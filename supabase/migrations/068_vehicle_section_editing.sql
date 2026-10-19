-- Independent, audited vehicle edits. Purchase-cost corrections are limited to
-- an untouched acquisition PO so payments, trade-in equity and invoices cannot drift.
alter table public.vehicle_details drop constraint if exists vehicle_details_service_history_check;
alter table public.vehicle_details add constraint vehicle_details_service_history_check
  check(service_history in ('unknown','none','partial','full','full_franchise','full_independent',
    'full_mixed','partial_franchise','partial_independent','partial_mixed'));

create function public.vehicle_edit_section(p_dealer uuid,p_vehicle uuid,p_section text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.vehicles; d public.vehicle_details; po public.purchase_orders;
  line public.po_lines; amount numeric; vat_amount numeric; before_state jsonb;
  after_state jsonb; result jsonb; current_location uuid;
begin
  if auth.uid() is null or public.user_role_in(p_dealer)::text not in ('owner','admin')
    or not public.commercial_allowed(p_dealer,'work') then raise exception 'vehicle_edit_not_allowed'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000
    then raise exception 'invalid_vehicle_data'; end if;
  select * into v from public.vehicles where id=p_vehicle and dealer_id=p_dealer for update;
  if not found then raise exception 'vehicle_missing'; end if;
  insert into public.vehicle_details(vehicle_id,dealer_id) values(p_vehicle,p_dealer)
    on conflict(vehicle_id) do nothing;
  select * into d from public.vehicle_details where vehicle_id=p_vehicle and dealer_id=p_dealer for update;
  before_state:=jsonb_build_object('vehicle',to_jsonb(v),'details',to_jsonb(d));

  if p_section='identity' then
    if coalesce(length(trim(p_data->>'make')),0)<2 or coalesce(length(trim(p_data->>'model')),0)<1
      or coalesce(length(trim(p_data->>'registration')),0)<2
      or (p_data->>'year')::int not between 1950 and 2100
      or (p_data->>'km')::int not between 0 and 10000000
      or p_data->>'stock_class' not in ('main','trade') then raise exception 'invalid_vehicle_identity'; end if;
    if exists(select 1 from public.vehicles other where other.dealer_id=p_dealer and other.id<>p_vehicle
      and other.status<>'sold' and lower(regexp_replace(other.registration,'[^a-zA-Z0-9]','','g'))=
        lower(regexp_replace(p_data->>'registration','[^a-zA-Z0-9]','','g')))
      then raise exception 'duplicate_registration'; end if;
    current_location:=nullif(p_data->>'location_id','')::uuid;
    if current_location is not null and not exists(select 1 from public.dealer_locations
      where id=current_location and dealer_id=p_dealer and active) then raise exception 'invalid_location'; end if;
    if nullif(p_data->>'local_registered_on','')::date < nullif(p_data->>'first_registered_on','')::date
      then raise exception 'local_registration_before_first'; end if;
    update public.vehicles set make=left(trim(p_data->>'make'),60),model=left(trim(p_data->>'model'),80),
      year=(p_data->>'year')::int,km=(p_data->>'km')::int,
      registration=upper(left(trim(p_data->>'registration'),20)),stock_class=p_data->>'stock_class',
      location_id=coalesce(current_location,location_id),updated_at=now() where id=p_vehicle;
    update public.vehicle_details set trim=left(p_data->>'trim',80),
      original_registration=upper(left(trim(p_data->>'original_registration'),20)),
      first_registered_on=nullif(p_data->>'first_registered_on','')::date,
      local_registered_on=nullif(p_data->>'local_registered_on','')::date,
      vin=upper(left(trim(p_data->>'vin'),17)),engine_no=left(p_data->>'engine_no',80),
      yard=left(p_data->>'yard',120),updated_at=now() where vehicle_id=p_vehicle;
  elsif p_section='specs' then
    if p_data->>'fuel' not in ('petrol','diesel','hybrid','electric','other')
      or p_data->>'transmission' not in ('manual','automatic') then raise exception 'invalid_vehicle_specs'; end if;
    update public.vehicles set fuel=(p_data->>'fuel')::public.fuel_type,
      transmission=(p_data->>'transmission')::public.transmission_type,
      nct_expiry=nullif(p_data->>'nct_expiry','')::date,updated_at=now() where id=p_vehicle;
    update public.vehicle_details set body_style=left(p_data->>'body_style',40),
      doors=left(p_data->>'doors',30),colour=left(p_data->>'colour',40),
      engine_cc=nullif(p_data->>'engine_cc','')::int,co2_g_km=nullif(p_data->>'co2_g_km','')::int,
      gross_weight_kg=nullif(p_data->>'gross_weight_kg','')::numeric,
      body_length_mm=nullif(p_data->>'body_length_mm','')::numeric,
      nct_expiry=nullif(p_data->>'nct_expiry','')::date,tax_expiry=nullif(p_data->>'tax_expiry','')::date,
      metallic_paint=coalesce((p_data->>'metallic_paint')::boolean,false),updated_at=now()
      where vehicle_id=p_vehicle;
  elsif p_section='pricing' then
    amount:=nullif(p_data->>'sale_price','')::numeric;
    if amount is not null and (amount<0 or amount>100000000 or amount<>round(amount,2))
      then raise exception 'invalid_sale_price'; end if;
    update public.vehicles set sale_price=amount,updated_at=now() where id=p_vehicle;
    amount:=nullif(p_data->>'trade_price','')::numeric;
    if amount is not null and (amount<0 or amount>100000000 or amount<>round(amount,2))
      then raise exception 'invalid_trade_price'; end if;
    insert into public.vehicle_trade_prices(vehicle_id,dealer_id,trade_price)
      values(p_vehicle,p_dealer,amount)
      on conflict(vehicle_id) do update set trade_price=excluded.trade_price,updated_at=now();
  elsif p_section='documents' then
    if p_data->>'service_history' not in ('unknown','none','partial','full','full_franchise',
      'full_independent','full_mixed','partial_franchise','partial_independent','partial_mixed')
      or p_data->>'hp_check_status' not in ('not_checked','clear','finance_recorded','attention')
      then raise exception 'invalid_vehicle_documents'; end if;
    update public.vehicles set warranty_months=nullif(p_data->>'warranty_months','')::int,updated_at=now()
      where id=p_vehicle;
    update public.vehicle_details set previous_owners=nullif(p_data->>'previous_owners','')::int,
      keys_count=nullif(p_data->>'keys_count','')::int,key_peg_ref=left(p_data->>'key_peg_ref',60),
      service_history=p_data->>'service_history',hp_check_status=p_data->>'hp_check_status',
      vlc_status=left(p_data->>'vlc_status',60),vlc_number=left(p_data->>'vlc_number',60),
      warranty_months=nullif(p_data->>'warranty_months','')::int,
      last_service_on=nullif(p_data->>'last_service_on','')::date,
      last_service_km=nullif(p_data->>'last_service_km','')::int,
      timing_belt_on=nullif(p_data->>'timing_belt_on','')::date,
      has_logbook=coalesce((p_data->>'has_logbook')::boolean,false),updated_at=now()
      where vehicle_id=p_vehicle;
  elsif p_section='presentation' then
    update public.vehicles set description=left(p_data->>'description',2000),
      website_visible=coalesce((p_data->>'website_visible')::boolean,false),
      featured=coalesce((p_data->>'featured')::boolean,false),updated_at=now() where id=p_vehicle;
    update public.vehicle_details set equipment=array(select jsonb_array_elements_text(coalesce(p_data->'equipment','[]'::jsonb))),
      tags=array(select jsonb_array_elements_text(coalesce(p_data->'tags','[]'::jsonb))),
      condition_notes=left(p_data->>'condition_notes',2000),repair_notes=left(p_data->>'repair_notes',2000),
      internal_notes=left(p_data->>'internal_notes',2000),updated_at=now() where vehicle_id=p_vehicle;
  elsif p_section='purchase_price' then
    if not public.commercial_allowed(p_dealer,'purchase') or not public.commercial_allowed(p_dealer,'cost')
      then raise exception 'purchase_price_not_allowed'; end if;
    select * into po from public.purchase_orders where id=v.originating_po_id and dealer_id=p_dealer
      and vehicle_id=p_vehicle for update;
    if not found or po.status<>'to_be_paid' or po.deal_id is not null or po.replaces_po_id is not null
      or exists(select 1 from public.po_payments where po_id=po.id)
      or exists(select 1 from public.deal_orders where vehicle_id=p_vehicle)
      then raise exception 'purchase_price_locked'; end if;
    if (select count(*) from public.po_lines where po_id=po.id)<>1 then raise exception 'purchase_line_ambiguous'; end if;
    select * into line from public.po_lines where po_id=po.id and vehicle_id=p_vehicle for update;
    if not found or line.qty<>1 then raise exception 'purchase_line_ambiguous'; end if;
    amount:=nullif(p_data->>'purchase_price','')::numeric;
    if amount is not null and (amount<0 or amount>100000000 or amount<>round(amount,2)
      or amount<po.settlement_due) then raise exception 'invalid_purchase_amount'; end if;
    if amount is null and po.settlement_due>0 then raise exception 'purchase_below_settlement'; end if;
    before_state:=before_state||jsonb_build_object('po',to_jsonb(po),'line',to_jsonb(line),
      'purchase_price',(select purchase_price from public.vehicle_deals where vehicle_id=p_vehicle));
    vat_amount:=case when po.vat_scheme='standard' then round(coalesce(amount,0)*23/123,2) else 0 end;
    update public.po_lines set net=coalesce(amount,0)-vat_amount,vat=vat_amount,gross=coalesce(amount,0)
      where id=line.id;
    update public.purchase_orders set purchase_amount_known=amount is not null,updated_at=now() where id=po.id;
    update public.vehicle_deals set purchase_price=amount where vehicle_id=p_vehicle and dealer_id=p_dealer;
    result:=jsonb_build_object('po_id',po.id,'purchase_price',amount);
  else raise exception 'invalid_vehicle_section'; end if;

  after_state:=jsonb_build_object('vehicle',(select to_jsonb(x) from public.vehicles x where id=p_vehicle),
    'details',(select to_jsonb(x) from public.vehicle_details x where vehicle_id=p_vehicle));
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'vehicle_edit_'||p_section,'vehicle',p_vehicle,
      jsonb_build_object('before',before_state,'after',after_state,'input',p_data,'result',result));
  return coalesce(result,jsonb_build_object('vehicle_id',p_vehicle,'section',p_section));
end $$;
revoke all on function public.vehicle_edit_section(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.vehicle_edit_section(uuid,uuid,text,jsonb) to authenticated;
