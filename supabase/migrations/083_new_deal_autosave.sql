-- One durable identity per New Deal tab. No financial writes from partial inputs.
create table public.new_deal_sessions (
  dealer_id uuid not null references public.dealers(id), session_id uuid not null,
  created_by uuid not null references auth.users(id), deal_id uuid not null,
  revision integer not null default 0, deal_version integer not null,
  snapshot jsonb not null, primary key(dealer_id,session_id)
);
revoke all on public.new_deal_sessions from public,anon,authenticated;

create function public.autosave_new_deal(p_dealer uuid,p_session uuid,p_revision integer,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.new_deal_sessions; d public.deals; cached public.commercial_requests;
  sale jsonb:=p_input->'sale'; terms jsonb:=p_input->'terms'; result jsonb; payload jsonb;
  old_deposits jsonb; old_trades jsonb; deposits jsonb:=coalesce(p_input->'deposits','[]');
  trades jsonb:=coalesce(p_input->'trades','[]'); item jsonb; n integer; doc uuid; v public.vehicles;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_session is null or p_request is null or p_revision is null or p_input is null or octet_length(p_input::text)>80000
    or jsonb_typeof(deposits)<>'array' or jsonb_typeof(trades)<>'array' or jsonb_array_length(trades)>10
    or jsonb_array_length(deposits)>100 then raise exception 'invalid_request'; end if;
  if jsonb_typeof(sale)<>'object' or terms is null or (sale->>'salePrice')::numeric is null or (sale->>'salePrice')::numeric<=0
    or length(coalesce(sale->>'notes',''))>4000 or length(coalesce(sale->>'source',''))>40 then raise exception 'invalid_request'; end if;
  payload:=jsonb_build_object('session',p_session,'revision',p_revision,'input',p_input);
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'autosave_new_deal' or cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into s from public.new_deal_sessions where dealer_id=p_dealer and session_id=p_session for update;
  if found then
    if s.created_by<>auth.uid() then raise exception 'commercial_not_allowed'; end if;
    if s.revision<>p_revision then raise exception 'stale_deal'; end if;
    select * into d from public.deals where id=s.deal_id and dealer_id=p_dealer for update;
    if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
    if d.version<>s.deal_version then raise exception 'stale_deal'; end if;
    old_deposits:=coalesce(s.snapshot->'deposits','[]'); old_trades:=coalesce(s.snapshot->'trades','[]');
    if jsonb_array_length(deposits)<jsonb_array_length(old_deposits) or jsonb_array_length(trades)<jsonb_array_length(old_trades) then raise exception 'use_recorded_financial_editor'; end if;
    for n in 0..jsonb_array_length(old_deposits)-1 loop
      if deposits->n is distinct from old_deposits->n then raise exception 'use_recorded_financial_editor'; end if;
    end loop;
    for n in 0..jsonb_array_length(old_trades)-1 loop
      if trades->n is distinct from old_trades->n then raise exception 'use_recorded_financial_editor'; end if;
    end loop;
    if sale->>'vehicleId' is distinct from s.snapshot->'sale'->>'vehicleId' then
      if d.status<>'vehicle_interest' then raise exception 'agreement_vehicle_locked'; end if;
      select * into v from public.vehicles where id=(sale->>'vehicleId')::uuid and dealer_id=p_dealer for update;
      if not found or v.status in ('sold','reserved','returned_to_customer') or exists(select 1 from public.deal_orders o join public.deals other on other.id=o.deal_id where o.vehicle_id=v.id and o.kind='sale' and other.id<>d.id and other.status not in ('vehicle_interest','completed','cancelled','reversed')) then raise exception 'vehicle_unavailable'; end if;
      if exists(select 1 from public.purchase_orders po join public.deals other on other.id=po.deal_id where po.vehicle_id=v.id and other.status<>'completed') then raise exception 'trade_acquisition_pending'; end if;
      if (sale->>'salePrice')::numeric is distinct from v.sale_price and (not public.commercial_allowed(p_dealer,'price') or coalesce(length(trim(sale->>'priceReason')),0)<3) then raise exception 'price_permission_reason_required'; end if;
      update public.deal_orders set vehicle_id=v.id,vat_scheme=coalesce(public.vehicle_purchase_vat(p_dealer,v.id),'standard') where deal_id=d.id and kind='sale';
    end if;
    if not exists(select 1 from public.customers where id=(sale->>'customerId')::uuid and dealer_id=p_dealer and deleted_at is null) then raise exception 'invalid_customer'; end if;
    if not exists(select 1 from public.dealer_members where dealer_id=p_dealer and user_id=(sale->>'salespersonId')::uuid and status='active' and role in ('owner','admin','sales')) then raise exception 'invalid_assignee'; end if;
    if nullif(sale->>'locationId','') is not null and not exists(select 1 from public.dealer_locations where id=(sale->>'locationId')::uuid and dealer_id=p_dealer and active) then raise exception 'invalid_location'; end if;
    if nullif(sale->>'leadId','') is not null and not exists(select 1 from public.leads where id=(sale->>'leadId')::uuid and dealer_id=p_dealer and (customer_id is null or customer_id=(sale->>'customerId')::uuid)) then raise exception 'invalid_lead'; end if;
    if (sale->>'salePrice')::numeric is distinct from d.retail_price then
      perform public.commercial_command(p_dealer,'price',d.id,jsonb_build_object('price',sale->'salePrice','reason',sale->>'priceReason','version',d.version),gen_random_uuid());
      select * into d from public.deals where id=d.id;
    end if;
    if terms is distinct from s.snapshot->'terms' then
      perform public.commercial_command(p_dealer,'deal_terms',d.id,terms||jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
      select * into d from public.deals where id=d.id;
    end if;
    if sale is distinct from s.snapshot->'sale' then
      update public.deals set customer_id=(sale->>'customerId')::uuid,salesperson_id=(sale->>'salespersonId')::uuid,
        location_id=nullif(sale->>'locationId','')::uuid,lead_id=nullif(sale->>'leadId','')::uuid,
        source=nullif(sale->>'source',''),notes=nullif(sale->>'notes',''),version=version+1,updated_at=now() where id=d.id;
      insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,'autosaved',jsonb_build_object('message','Deal details saved automatically','before',s.snapshot->'sale','after',sale),auth.uid());
    end if;
  else
    if p_revision<>0 then raise exception 'stale_deal'; end if;
    result:=public.create_deal_from_sheet(p_dealer,sale-'deposits'-'depositAmount',terms,null,'deal',gen_random_uuid());
    select * into d from public.deals where id=(result->>'id')::uuid;
    old_deposits:='[]'; old_trades:='[]';
    insert into public.new_deal_sessions(dealer_id,session_id,created_by,deal_id,deal_version,snapshot) values(p_dealer,p_session,auth.uid(),d.id,d.version,p_input);
  end if;
  for n in jsonb_array_length(old_deposits)..jsonb_array_length(deposits)-1 loop
    item:=deposits->n;
    perform public.commercial_command(p_dealer,'payment',d.id,item||jsonb_build_object('kind','deposit'),gen_random_uuid());
  end loop;
  for n in jsonb_array_length(old_trades)..jsonb_array_length(trades)-1 loop
    perform public.record_trade_in(p_dealer,d.id,trades->n,gen_random_uuid());
  end loop;
  select * into d from public.deals where id=d.id;
  if coalesce((p_input->>'agreement')::boolean,false) or jsonb_array_length(deposits)>0 or jsonb_array_length(trades)>0 then
    select id into doc from public.deal_documents where deal_id=d.id and kind='agreement' and status<>'void' and deal_version=d.version order by created_at desc limit 1;
    if doc is null then
      result:=public.commercial_command(p_dealer,'force_agreement',d.id,jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
      doc:=(result->>'id')::uuid;
    end if;
  end if;
  select * into d from public.deals where id=d.id;
  update public.new_deal_sessions set revision=p_revision+1,deal_version=d.version,snapshot=p_input where dealer_id=p_dealer and session_id=p_session;
  result:=jsonb_build_object('id',d.id,'number',d.deal_no,'status',d.status,'version',d.version,'revision',p_revision+1,'documentId',doc);
  insert into public.commercial_requests(dealer_id,request_id,command,input,result) values(p_dealer,p_request,'autosave_new_deal',payload,result);
  return result;
end $$;
revoke all on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) to authenticated;
