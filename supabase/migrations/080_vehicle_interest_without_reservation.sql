alter table public.deals drop constraint deals_status_check;
alter table public.deals add constraint deals_status_check check(status in ('vehicle_interest','draft','quoted','agreed','finance','completed','cancelled','reversed'));

-- An interest is not an exclusive claim to the car.
do $$
declare body text;
begin
  select prosrc into body from pg_proc where oid='public.commercial_command_v041(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  if position('x.status not in (''cancelled'',''completed'')' in body)=0 then raise exception 'sale_availability_guard_missing'; end if;
  body:=replace(body,'x.status not in (''cancelled'',''completed'')','x.status not in (''cancelled'',''completed'',''reversed'',''vehicle_interest'')');
  execute format('create or replace function public.commercial_command_v041(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
end $$;

alter function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) rename to create_deal_from_sheet_v079;
revoke all on function public.create_deal_from_sheet_v079(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
create function public.create_deal_from_sheet(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_finance jsonb,p_mode text,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; original_status public.vehicle_status; cached boolean;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select exists(select 1 from public.deal_sheet_requests where dealer_id=p_dealer and request_id=p_request) into cached;
  select status into original_status from public.vehicles where id=(p_sale->>'vehicleId')::uuid and dealer_id=p_dealer;
  result:=public.create_deal_from_sheet_v079(p_dealer,p_sale,p_terms,p_finance,p_mode,p_request);
  if not cached and p_mode in ('deal','edit') and not exists(select 1 from public.payments where deal_id=(result->>'id')::uuid and kind='deposit')
    and not exists(select 1 from public.deal_documents where deal_id=(result->>'id')::uuid and kind='agreement' and status<>'void') then
    update public.deals set status='vehicle_interest',stage='vehicle_interest' where id=(result->>'id')::uuid and dealer_id=p_dealer;
    update public.vehicles set status=original_status where id=(p_sale->>'vehicleId')::uuid and dealer_id=p_dealer;
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,(result->>'id')::uuid,'vehicle_interest_saved',jsonb_build_object('message','Vehicle Interest saved without reserving the car'),auth.uid());
  end if;
  return result;
end $$;
revoke all on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) to authenticated;

-- Promotion must reacquire availability; another buyer may have agreed meanwhile.
alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v079;
revoke all on function public.commercial_command_v079(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.deals; v public.vehicles; result jsonb; preserve_status public.vehicle_status;
begin
  if p_command in ('force_agreement','payment','trade','status','cancel_deal') then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
    if d.status='vehicle_interest' and p_command='cancel_deal' then
      select v1.* into v from public.vehicles v1 join public.deal_orders o on o.vehicle_id=v1.id where o.deal_id=p_id and o.kind='sale' and v1.dealer_id=p_dealer for update of v1;
      preserve_status:=v.status;
    end if;
    if d.status='vehicle_interest' and (p_command in ('force_agreement','trade') or (p_command='payment' and p_input->>'kind'='deposit') or (p_command='status' and p_input->>'status'='agreed')) then
      select v1.* into v from public.vehicles v1 join public.deal_orders o on o.vehicle_id=v1.id where o.deal_id=p_id and o.kind='sale' and v1.dealer_id=p_dealer for update of v1;
      if v.id is null or v.status in ('sold','reserved','returned_to_customer') or exists(select 1 from public.deal_orders o join public.deals other on other.id=o.deal_id where o.vehicle_id=v.id and o.kind='sale' and other.id<>p_id and other.status not in ('vehicle_interest','cancelled','completed','reversed')) then raise exception 'vehicle_has_open_deal'; end if;
      update public.deals set status='agreed',stage='closing' where id=p_id;
      update public.vehicles set status='reserved' where id=v.id;
      insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,p_id,'interest_promoted',jsonb_build_object('message','Vehicle Interest promoted to agreement; car reserved'),auth.uid());
    end if;
  end if;
  result:=public.commercial_command_v079(p_dealer,p_command,p_id,p_input,p_request);
  if preserve_status is not null then update public.vehicles set status=preserve_status where id=v.id; end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

-- Every multi-trade creation uses the existing agreement + PO transaction.
alter function public.create_deal_with_trade_ins(uuid,jsonb,jsonb,text,jsonb,uuid) rename to create_deal_with_trade_ins_v079;
revoke all on function public.create_deal_with_trade_ins_v079(uuid,jsonb,jsonb,text,jsonb,uuid) from public,anon,authenticated;
create function public.create_deal_with_trade_ins(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_mode text,p_trades jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if p_mode not in ('deal','edit','agreement') then raise exception 'invalid_request'; end if;
  return public.create_deal_with_trade_ins_v079(p_dealer,p_sale,p_terms,'agreement',p_trades,p_request);
end $$;
revoke all on function public.create_deal_with_trade_ins(uuid,jsonb,jsonb,text,jsonb,uuid) from public,anon;
grant execute on function public.create_deal_with_trade_ins(uuid,jsonb,jsonb,text,jsonb,uuid) to authenticated;
