-- Run this entire file in the Supabase SQL Editor before deploying the client.
-- Works both on a fresh project and after 202611090001_sync.sql.
-- Existing tables and financial records are preserved; only missing tables are created.
-- Clerk must be configured as a third-party auth provider with role=authenticated.
-- Keep bootstrap and function replacement atomic if any statement fails.
begin;

create schema if not exists money_private;
revoke all on schema money_private from public, anon, authenticated;

create table if not exists money_private.user_cursors (
  user_id text primary key,
  cursor bigint not null default 0
);
create table if not exists money_private.transactions (
  user_id text not null,
  id uuid not null,
  version bigint not null check (version > 0),
  entry jsonb not null,
  primary key (user_id, id)
);
create table if not exists money_private.changes (
  user_id text not null,
  cursor bigint not null,
  entry jsonb not null,
  primary key (user_id, cursor)
);
create table if not exists money_private.operations (
  user_id text not null,
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  primary key (user_id, operation_id)
);
revoke all on all tables in schema money_private from public, anon, authenticated;
alter table money_private.user_cursors enable row level security;
alter table money_private.transactions enable row level security;
alter table money_private.changes enable row level security;
alter table money_private.operations enable row level security;

create or replace function public.money_sync(p_cursor text, p_operations jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  uid text := auth.jwt()->>'sub';
  op jsonb; item jsonb; existing money_private.transactions%rowtype;
  previous money_private.operations%rowtype; result jsonb;
  results jsonb := '[]'::jsonb; changes jsonb; new_cursor bigint;
  requested_cursor bigint; base_version bigint; v_operation_id uuid; entry_id uuid;
begin
  if uid is null or uid = '' or length(uid) > 255 then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_cursor is null or p_cursor !~ '^[0-9]{1,18}$' or jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations) > 100 then
    raise exception 'Invalid sync request' using errcode = '22023';
  end if;
  requested_cursor := p_cursor::bigint;
  -- Serializing each user's sync requests ensures cursor order is commit order.
  perform pg_advisory_xact_lock(hashtextextended(uid, 0));
  insert into money_private.user_cursors(user_id) values (uid) on conflict do nothing;
  if requested_cursor > (select cursor from money_private.user_cursors where user_id = uid) then
    raise exception 'Invalid sync cursor' using errcode = '22023';
  end if;
  for op in select value from jsonb_array_elements(p_operations) loop
    if jsonb_typeof(op) is distinct from 'object' or jsonb_typeof(op->'entry') is distinct from 'object' or
       coalesce(op->>'operationId','') !~ '^[0-9a-fA-F-]{36}$' or
       coalesce(op->>'baseVersion','') !~ '^[0-9]{1,18}$' then
      raise exception 'Invalid operation' using errcode = '22023';
    end if;
    v_operation_id := (op->>'operationId')::uuid;
    base_version := (op->>'baseVersion')::bigint;
    item := op->'entry';
    if coalesce(item->>'id','') !~ '^[0-9a-fA-F-]{36}$' or
       coalesce(item->>'type','') not in ('income','expense','transfer','account','category','reconciliation','adjustment','audit') or
       jsonb_typeof(item->'cents') is distinct from 'number' or coalesce(item->>'cents','') !~ '^-?[0-9]{1,12}$' or
       abs((item->>'cents')::numeric) > 100000000000 or (item->>'type' in ('income','expense','transfer') and (item->>'cents')::numeric < 1) or
       jsonb_typeof(item->'description') is distinct from 'string' or length(trim(item->>'description')) not between 1 and 100 or
       jsonb_typeof(item->'category') is distinct from 'string' or length(item->>'category') > 50 or
       coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or
       jsonb_typeof(item->'createdAt') is distinct from 'string' or length(item->>'createdAt') > 40 or
       jsonb_typeof(item->'deleted') is distinct from 'boolean' then
      raise exception 'Invalid entry' using errcode = '22023';
    end if;
    if octet_length(item::text) > 180000 then raise exception 'Entry too large' using errcode = '22023'; end if;
    if item ? 'fee' and (jsonb_typeof(item->'fee') <> 'number' or (item->>'fee') !~ '^[0-9]{1,12}$' or (item->>'fee')::numeric > 100000000000) then
      raise exception 'Invalid fee' using errcode = '22023';
    end if;
    if item->>'type' = 'transfer' and (coalesce(item->>'accountId','') = '' or coalesce(item->>'toAccountId','') = '' or item->>'accountId' = item->>'toAccountId') then
      raise exception 'Transfer requires distinct accounts' using errcode = '22023';
    end if;
    if item->>'type' = 'account' and (jsonb_typeof(item->'opening') is distinct from 'number' or (item->>'opening') !~ '^-?[0-9]{1,12}$' or abs((item->>'opening')::numeric) > 100000000000) then
      raise exception 'Invalid opening balance' using errcode = '22023';
    end if;
    if item ? 'time' and coalesce(item->>'time','') <> '' and (item->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid time' using errcode = '22023'; end if;
    if item ? 'position' and (jsonb_typeof(item->'position') <> 'number' or (item->>'position') !~ '^[0-9]{1,9}$') then raise exception 'Invalid position' using errcode = '22023'; end if;
    if item ? 'accountId' and coalesce(item->>'accountId','') not in ('','unassigned') and (item->>'accountId') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invalid account' using errcode = '22023'; end if;
    if item ? 'toAccountId' and coalesce(item->>'toAccountId','') not in ('','unassigned') and (item->>'toAccountId') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invalid destination' using errcode = '22023'; end if;
    entry_id := (item->>'id')::uuid;
    select * into previous from money_private.operations where user_id = uid and money_private.operations.operation_id = v_operation_id;
    if found then
      if previous.request <> op then raise exception 'Operation ID reused' using errcode = '22023'; end if;
      results := results || jsonb_build_array(previous.result);
      continue;
    end if;
    select * into existing from money_private.transactions where user_id = uid and id = entry_id;
    if (found and existing.version <> base_version) or (not found and base_version <> 0) then
      result := jsonb_build_object('operationId', v_operation_id, 'status', 'conflict', 'entry', case when existing.id is null then null else existing.entry end);
    else
      item := (item - 'owner' - 'dirty' - 'pendingOperation' - 'updatedAt') || jsonb_build_object('id',entry_id,'version',(base_version + 1)::text);
      insert into money_private.transactions(user_id,id,version,entry) values(uid,entry_id,base_version + 1,item)
        on conflict (user_id,id) do update set version=excluded.version, entry=excluded.entry;
      update money_private.user_cursors set cursor=cursor+1 where user_id=uid returning cursor into new_cursor;
      insert into money_private.changes(user_id,cursor,entry) values(uid,new_cursor,item);
      result := jsonb_build_object('operationId', v_operation_id, 'status', 'applied', 'entry', item);
    end if;
    insert into money_private.operations(user_id,operation_id,request,result) values(uid,v_operation_id,op,result);
    results := results || jsonb_build_array(result);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('cursor', cursor::text, 'entry', entry) order by cursor), '[]'::jsonb)
    into changes from (select cursor, entry from money_private.changes where user_id=uid and cursor > requested_cursor order by cursor limit 200) page;
  return jsonb_build_object('results',results,'changes',changes);
end;
$$;
revoke all on function public.money_sync(text,jsonb) from public, anon;
grant execute on function public.money_sync(text,jsonb) to authenticated;

commit;
