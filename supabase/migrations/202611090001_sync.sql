-- Apply once in the Supabase SQL editor. Clerk must be configured as a
-- third-party auth provider, with role=authenticated in session tokens.
create schema if not exists money_private;
revoke all on schema money_private from public, anon, authenticated;

create table money_private.user_cursors (
  user_id text primary key,
  cursor bigint not null default 0
);
create table money_private.transactions (
  user_id text not null,
  id uuid not null,
  version bigint not null check (version > 0),
  entry jsonb not null,
  primary key (user_id, id)
);
create table money_private.changes (
  user_id text not null,
  cursor bigint not null,
  entry jsonb not null,
  primary key (user_id, cursor)
);
create table money_private.operations (
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
       coalesce(item->>'type','') not in ('income','expense') or
       jsonb_typeof(item->'cents') is distinct from 'number' or coalesce(item->>'cents','') !~ '^[0-9]{1,12}$' or
       (item->>'cents')::numeric < 1 or (item->>'cents')::numeric > 100000000000 or
       jsonb_typeof(item->'description') is distinct from 'string' or length(trim(item->>'description')) not between 1 and 100 or
       jsonb_typeof(item->'category') is distinct from 'string' or length(item->>'category') > 50 or
       coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or
       jsonb_typeof(item->'createdAt') is distinct from 'string' or length(item->>'createdAt') > 40 or
       jsonb_typeof(item->'deleted') is distinct from 'boolean' then
      raise exception 'Invalid entry' using errcode = '22023';
    end if;
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
      item := jsonb_build_object('id',entry_id,'type',item->'type','cents',item->'cents',
        'description',trim(item->>'description'),'category',item->'category','date',item->'date',
        'createdAt',item->'createdAt','deleted',item->'deleted','version',(base_version + 1)::text);
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
