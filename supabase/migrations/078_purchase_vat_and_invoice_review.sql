-- Purchase VAT is authoritative. Read only the scheme, never the purchase cost.
create function public.vehicle_purchase_vat(p_dealer uuid,p_vehicle uuid) returns text
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
  return (select po.vat_scheme from vehicles v join purchase_orders po on po.id=v.originating_po_id
    and po.dealer_id=v.dealer_id and po.vehicle_id=v.id where v.id=p_vehicle and v.dealer_id=p_dealer and po.status<>'cancelled');
end $$;
revoke all on function public.vehicle_purchase_vat(uuid,uuid) from public,anon;
grant execute on function public.vehicle_purchase_vat(uuid,uuid) to authenticated;

-- Agreements can include recorded deposits; quotes still cannot.
do $$
declare body text;
begin
  select prosrc into body from pg_proc where oid='public.create_deal_from_sheet_v073(uuid,jsonb,jsonb,jsonb,text,uuid)'::regprocedure;
  if position('p_mode in (''quote'',''agreement'')' in body)=0 then raise exception 'agreement_guard_not_found'; end if;
  body:=replace(body,'p_mode in (''quote'',''agreement'')','p_mode=''quote''');
  execute format('create or replace function public.create_deal_from_sheet_v073(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_finance jsonb,p_mode text,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
end $$;

alter function public.create_sales_quote(uuid,jsonb,uuid) rename to create_sales_quote_v077;
revoke all on function public.create_sales_quote_v077(uuid,jsonb,uuid) from public,anon,authenticated;
create function public.create_sales_quote(p_dealer uuid,p_input jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare scheme text;
begin
  scheme:=public.vehicle_purchase_vat(p_dealer,(p_input->>'vehicleId')::uuid);
  return public.create_sales_quote_v077(p_dealer,p_input||jsonb_build_object('vatScheme',coalesce(scheme,'standard')),p_request);
end $$;
revoke all on function public.create_sales_quote(uuid,jsonb,uuid) from public,anon;
grant execute on function public.create_sales_quote(uuid,jsonb,uuid) to authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v077;
revoke all on function public.commercial_command_v077(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare scheme text; vehicle uuid;
begin
  if p_command='sale' then
    scheme:=public.vehicle_purchase_vat(p_dealer,(p_input->>'vehicleId')::uuid);
    -- Legacy cars may start a Deal before acquisition is resolved; completion
    -- still requires the verified PO and refreshes this provisional scheme.
    p_input:=p_input||jsonb_build_object('vatScheme',coalesce(scheme,'standard'));
  elsif p_command='status' and p_input->>'status'='completed' then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from dealers where id=p_dealer for update;
    select vehicle_id into vehicle from deal_orders where dealer_id=p_dealer and deal_id=p_id and kind='sale';
    scheme:=public.vehicle_purchase_vat(p_dealer,vehicle);
    if scheme is not null then update deal_orders set vat_scheme=scheme where dealer_id=p_dealer and deal_id=p_id and kind='sale'
      and exists(select 1 from deals where id=p_id and dealer_id=p_dealer and status not in ('completed','cancelled','reversed')); end if;
  end if;
  return public.commercial_command_v077(p_dealer,p_command,p_id,p_input,p_request);
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create function public.finish_deal_review(p_dealer uuid,p_deal uuid,p_version integer,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d deals; v vehicles; c customers; cached commercial_requests; payload jsonb; result jsonb;
  reading numeric; kilometres integer; unit text; consent text; chosen date; doc uuid;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_input is null then raise exception 'invalid_request'; end if;
  perform 1 from dealers where id=p_dealer for update;
  payload:=jsonb_build_object('deal',p_deal,'version',p_version,'data',p_input);
  select * into cached from commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'finish_review' or cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into d from deals where id=p_deal and dealer_id=p_dealer for update;
  if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
  if d.version is distinct from p_version then raise exception 'stale_deal'; end if;
  select v1.* into v from vehicles v1 join deal_orders o on o.vehicle_id=v1.id where o.deal_id=p_deal and o.dealer_id=p_dealer and o.kind='sale' and v1.dealer_id=p_dealer for update of v1;
  select * into c from customers where id=d.customer_id and dealer_id=p_dealer and deleted_at is null for update;
  if v.id is null or c.id is null then raise exception 'review_customer_vehicle_missing'; end if;
  reading:=(p_input->>'odometer')::numeric; unit:=p_input->>'unit'; consent:=p_input->>'consent'; chosen:=(p_input->>'invoiceDate')::date;
  if reading is null or reading<0 or reading<>trunc(reading) or reading>5000000 or unit is null or unit not in ('km','miles') then raise exception 'invalid_delivery_odometer'; end if;
  kilometres:=round(case when unit='miles' then reading*1.609344 else reading end);
  if kilometres<coalesce(v.km,0)-1 then raise exception 'delivery_odometer_below_stock'; end if;
  if consent is null or consent not in ('not_asked','refused','verbal','written','electronic') then raise exception 'invalid_data_consent'; end if;
  if chosen is null then raise exception 'invoice_date_required'; end if;
  if length(coalesce(p_input->>'email',''))>200 or (coalesce(p_input->>'email','')<>'' and p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'invalid_customer_email'; end if;
  update vehicles set km=kilometres,updated_at=now(),updated_by=auth.uid() where id=v.id;
  update customers set email=nullif(trim(p_input->>'email'),''),data_consent=consent where id=c.id;
  perform public.commercial_command(p_dealer,'force_agreement',p_deal,jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
  perform public.commercial_command(p_dealer,'status',p_deal,jsonb_build_object('status','completed','invoiceDate',chosen),gen_random_uuid());
  select id into doc from deal_documents where dealer_id=p_dealer and deal_id=p_deal and kind='invoice' and status<>'void' order by created_at desc limit 1;
  if doc is null then raise exception 'invoice_missing'; end if;
  update deal_documents set snapshot=snapshot||jsonb_build_object('delivery_review',p_input||jsonb_build_object('km',kilometres,'reviewed_by',auth.uid(),'reviewed_at',now())) where id=doc;
  insert into audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'invoice_delivery_review','deal',p_deal,
    jsonb_build_object('before',jsonb_build_object('km',v.km,'email',c.email,'consent',c.data_consent),'review',p_input));
  result:=jsonb_build_object('id',doc);
  insert into commercial_requests(dealer_id,request_id,command,input,result) values(p_dealer,p_request,'finish_review',payload,result);
  return result;
end $$;
revoke all on function public.finish_deal_review(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.finish_deal_review(uuid,uuid,integer,jsonb,uuid) to authenticated;
