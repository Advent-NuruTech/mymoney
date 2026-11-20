-- Run after 202611200001_business_recording.sql. All test data is rolled back.
begin;
set local role authenticated;
do $$
declare
  business uuid := gen_random_uuid();
  sale_id uuid := gen_random_uuid();
  data jsonb := jsonb_build_object('businessId', business);
  record_data jsonb;
  member_token text;
  admin_token text;
  expense_id uuid := gen_random_uuid();
  payment jsonb;
  result jsonb;
  prefix text := gen_random_uuid()::text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', prefix || '-owner')::text, true);
  perform public.money_business('create', jsonb_build_object('id', business, 'businessName', 'Test shop', 'currency', 'KES', 'name', 'Owner'));
  member_token := public.money_business('invite', data || '{"role":"member"}'::jsonb)->>'token';
  admin_token := public.money_business('invite', data || '{"role":"admin"}'::jsonb)->>'token';
  perform public.money_business('record', data || jsonb_build_object('id', gen_random_uuid(), 'cents', 1200, 'description', 'Owner sale', 'date', '2026-11-20'));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', prefix || '-member')::text, true);
  result := public.money_business('join', jsonb_build_object('token', member_token, 'name', 'Staff'));
  if result->>'id' is distinct from business::text then
    raise exception 'Member could not accept invitation';
  end if;
  result := public.money_business('join', jsonb_build_object('token', member_token, 'name', 'Staff'));
  if result->>'id' is distinct from business::text then
    raise exception 'Member invitation retry failed';
  end if;
  record_data := data || jsonb_build_object('id', sale_id, 'cents', 550, 'description', 'Staff sale', 'date', '2026-11-20', 'recorder', prefix || '-owner');
  perform public.money_business('record', record_data);
  perform public.money_business('record', record_data);
  payment := data || jsonb_build_object('id', expense_id, 'type', 'expense', 'cents', 200, 'fee', 15,
    'description', 'Staff payment', 'date', '2026-11-20', 'time', '11:09', 'reference', 'PAY123',
    'provider', 'mpesa', 'source', 'Original payment message', 'createdAt', '2026-11-20T08:09:15.010Z');
  perform public.money_business('record_transaction', payment);
  perform public.money_business('record_transaction', payment);
  result := public.money_business('transactions', data);
  if result->'summary' is distinct from '{"cents":"550","income":"550","expense":"215","count":2}'::jsonb
    or result->'sales'->0->>'recorder' is distinct from 'Staff' then
    raise exception 'Member visibility, attribution or recording retry failed';
  end if;
  if not exists (select 1 from jsonb_array_elements(result->'sales') as row
    where row->>'id' = expense_id::text and row->'entry'->>'type' = 'expense'
      and row->'entry'->>'time' = '11:09' and row->'entry'->>'source' = 'Original payment message'
      and row->>'recorder_id' = prefix || '-member' and row->>'own' = 'true') then
    raise exception 'Payment data or member attribution was lost';
  end if;
  begin
    perform public.money_business('invite', data || '{"role":"admin"}'::jsonb);
    raise exception 'Member could issue an admin invitation';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', prefix || '-outsider')::text, true);
  result := public.money_business('join', jsonb_build_object('token', member_token, 'name', 'Outsider'));
  if not (result ? 'error') then
    raise exception 'A consumed invitation was accepted by a different user';
  end if;
  if public.money_business('list', '{}'::jsonb) <> '[]'::jsonb then
    raise exception 'Outsider could list the business';
  end if;
  begin
    perform public.money_business('sales', data);
    raise exception 'Outsider could view business sales';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.money_business('record', record_data);
    raise exception 'Outsider could record business sales';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', prefix || '-admin')::text, true);
  perform public.money_business('join', jsonb_build_object('token', admin_token, 'name', 'Admin'));
  result := public.money_business('record_transaction', payment || jsonb_build_object('id', gen_random_uuid()));
  if not (result ? 'error') then
    raise exception 'A pasted payment was recorded twice by different users';
  end if;
  result := public.money_business('transactions', data);
  if result->'summary' is distinct from '{"cents":"1750","income":"1750","expense":"215","count":3}'::jsonb
    or jsonb_array_length(result->'sales') is distinct from 3 then
    raise exception 'Admin could not see the full sales history and total';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', prefix || '-owner')::text, true);
  result := public.money_business('sales', data);
  if result->'summary' is distinct from '{"cents":"1750","income":"1750","expense":"215","count":3}'::jsonb then
    raise exception 'Owner could not see the full sales total';
  end if;
end;
$$;
rollback;
