begin;

create schema if not exists money_private;
revoke all on schema money_private from public, anon, authenticated;

create table if not exists money_private.businesses (
  id uuid primary key,
  owner_id text not null,
  name text not null check (length(name) between 1 and 100),
  currency text not null check (currency ~ '^[A-Z]{3}$')
);
create table if not exists money_private.business_members (
  business_id uuid not null references money_private.businesses(id),
  user_id text not null,
  name text not null check (length(name) between 1 and 100),
  role text not null check (role in ('owner', 'admin', 'member')),
  primary key (business_id, user_id)
);
create index if not exists business_members_user on money_private.business_members(user_id);
create table if not exists money_private.business_invites (
  token_hash bytea primary key,
  business_id uuid not null references money_private.businesses(id),
  role text not null check (role in ('admin', 'member')),
  expires_at timestamptz not null default (now() + interval '7 days')
);
alter table money_private.business_invites add column if not exists accepted_by text;
create table if not exists money_private.business_sales (
  business_id uuid not null,
  id uuid not null,
  recorder text not null,
  cents bigint not null check (cents between 1 and 100000000000),
  description text not null check (length(description) between 1 and 100),
  sale_date date not null,
  created_at timestamptz not null default now(),
  primary key (business_id, id),
  foreign key (business_id, recorder) references money_private.business_members(business_id, user_id)
);
alter table money_private.business_sales
  add column if not exists entry jsonb not null default '{}'::jsonb;
create unique index if not exists business_sales_reference
  on money_private.business_sales(business_id, lower(entry->>'provider'), upper(entry->>'reference'))
  where coalesce(entry->>'provider', '') <> '' and coalesce(entry->>'reference', '') <> '';
create index if not exists business_sales_date on money_private.business_sales(business_id, sale_date desc, created_at desc, id desc);
create index if not exists business_sales_recorder on money_private.business_sales(business_id, recorder, sale_date desc, created_at desc, id desc);

revoke all on money_private.businesses, money_private.business_members, money_private.business_invites, money_private.business_sales from public, anon, authenticated;
alter table money_private.businesses enable row level security;
alter table money_private.business_members enable row level security;
alter table money_private.business_invites enable row level security;
alter table money_private.business_sales enable row level security;

create or replace function public.money_business(p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  uid text := auth.jwt()->>'sub';
  business uuid;
  access_role text;
  member_name text := btrim(coalesce(p_data->>'name', ''));
  invite money_private.business_invites%rowtype;
  sale money_private.business_sales%rowtype;
  token text;
  summary jsonb;
  sale_rows jsonb;
  page_number integer;
  item jsonb;
  direction text;
  fee bigint;
begin
  if uid is null or uid = '' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_action = 'list' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'currency', b.currency, 'role', m.role) order by b.name, b.id)
      from money_private.business_members m join money_private.businesses b on b.id = m.business_id
      where m.user_id = uid
    ), '[]'::jsonb);
  end if;

  if p_action = 'create' then
    business := (p_data->>'id')::uuid;
    insert into money_private.businesses(id, owner_id, name, currency)
    values (business, uid, btrim(p_data->>'businessName'), p_data->>'currency')
    on conflict (id) do nothing;
    if not exists (select 1 from money_private.businesses where id = business and owner_id = uid) then
      raise exception 'Business unavailable' using errcode = '42501';
    end if;
    insert into money_private.business_members values (business, uid, member_name, 'owner') on conflict do nothing;
    return jsonb_build_object('id', business);
  end if;

  if p_action = 'join' then
    token := p_data->>'token';
    if token is null or token !~ '^[0-9a-f]{64}$' then
      return jsonb_build_object('error', 'This invite is invalid, expired or already used.');
    end if;
    select * into invite from money_private.business_invites
    where token_hash = sha256(convert_to(token, 'UTF8')) and expires_at > now()
      and (accepted_by is null or accepted_by = uid) for update;
    if not found then
      return jsonb_build_object('error', 'This invite is invalid, expired or already used.');
    end if;
    insert into money_private.business_members values (invite.business_id, uid, member_name, invite.role)
    on conflict do nothing;
    if found then
      update money_private.business_invites set accepted_by = uid where token_hash = invite.token_hash;
    end if;
    return jsonb_build_object('id', invite.business_id);
  end if;

  business := (p_data->>'businessId')::uuid;
  select role into access_role from money_private.business_members where business_id = business and user_id = uid;
  if access_role is null then
    raise exception 'Business unavailable' using errcode = '42501';
  end if;

  if p_action = 'invite' and access_role = 'owner' then
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into money_private.business_invites(token_hash, business_id, role)
    values (sha256(convert_to(token, 'UTF8')), business, p_data->>'role');
    return jsonb_build_object('token', token);
  end if;

  if p_action in ('record', 'record_transaction') then
    if coalesce(p_data->>'cents', '') !~ '^[0-9]{1,12}$'
      or coalesce(p_data->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid sale' using errcode = '22023';
    end if;
    direction := coalesce(p_data->>'type', 'income');
    if (p_action = 'record_transaction' and p_data->>'type' is null) or direction not in ('income', 'expense') or coalesce(p_data->>'fee', '0') !~ '^[0-9]{1,12}$'
      or length(coalesce(p_data->>'description', '')) not between 1 and 100
      or length(coalesce(p_data->>'category', '')) > 50 or length(coalesce(p_data->>'reference', '')) > 40
      or length(coalesce(p_data->>'provider', '')) > 40 or length(coalesce(p_data->>'source', '')) > 12000
      or coalesce(p_data->>'time', '') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(p_data->>'createdAt', '') !~ '^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$'
      or coalesce(p_data->>'reportedBalance', '') !~ '^$|^-?[0-9]{1,15}$' then
      raise exception 'Invalid transaction' using errcode = '22023';
    end if;
    fee := coalesce((p_data->>'fee')::bigint, 0);
    if fee > 100000000000 then
      raise exception 'Invalid fee' using errcode = '22023';
    end if;
    item := jsonb_strip_nulls(jsonb_build_object(
      'type', p_data->>'type', 'fee', case when p_data ? 'fee' then fee end,
      'category', p_data->>'category', 'reference', p_data->>'reference', 'provider', p_data->>'provider',
      'time', p_data->>'time', 'source', p_data->>'source', 'createdAt', p_data->>'createdAt',
      'reportedBalance', p_data->'reportedBalance'));
    insert into money_private.business_sales (business_id, id, recorder, cents, description, sale_date, entry)
    values (business, (p_data->>'id')::uuid, uid, (p_data->>'cents')::bigint,
      btrim(p_data->>'description'), (p_data->>'date')::date, item)
    on conflict do nothing;
    select * into sale from money_private.business_sales where business_id = business and id = (p_data->>'id')::uuid;
    if not found then
      return jsonb_build_object('error', 'This message reference is already recorded in this business.');
    end if;
    if sale.recorder <> uid or sale.cents <> (p_data->>'cents')::bigint
      or sale.description <> btrim(p_data->>'description') or sale.sale_date <> (p_data->>'date')::date or sale.entry <> item then
      raise exception 'Sale ID already used' using errcode = '22023';
    end if;
    return jsonb_build_object('id', sale.id, 'syncedAt', sale.created_at, 'recorder', (select name from money_private.business_members where business_id = business and user_id = uid));
  end if;

  if p_action in ('sales', 'transactions') then
    page_number := coalesce((p_data->>'page')::integer, 0);
    if page_number < 0 or page_number > 1000000 then
      raise exception 'Invalid page' using errcode = '22023';
    end if;
    with visible as (
      select s.* from money_private.business_sales s
      where s.business_id = business and (access_role in ('owner', 'admin') or s.recorder = uid)
    ), totals as (
      select jsonb_build_object(
        'cents', coalesce(sum(cents) filter (where coalesce(entry->>'type', 'income') = 'income'), 0)::text,
        'income', coalesce(sum(cents) filter (where coalesce(entry->>'type', 'income') = 'income'), 0)::text,
        'expense', (coalesce(sum(cents) filter (where entry->>'type' = 'expense'), 0)
          + coalesce(sum((entry->>'fee')::bigint), 0))::text,
        'count', count(*)) as data from visible
    ), page as (
      select v.id, v.cents, v.description, v.sale_date as date, v.created_at, m.name as recorder,
        v.recorder = uid as own, v.recorder as recorder_id, v.entry
      from visible v join money_private.business_members m on m.business_id = v.business_id and m.user_id = v.recorder
      order by v.sale_date desc, v.created_at desc, v.id desc limit 20 offset (page_number * 20)
    )
    select totals.data, coalesce((select jsonb_agg(to_jsonb(page) order by date desc, created_at desc, id desc) from page), '[]'::jsonb)
    into summary, sale_rows from totals;
    return jsonb_build_object('summary', summary, 'sales', sale_rows);
  end if;

  raise exception 'Action unavailable' using errcode = '42501';
end;
$$;

revoke all on function public.money_business(text, jsonb) from public, anon, authenticated;
grant execute on function public.money_business(text, jsonb) to authenticated;
commit;
