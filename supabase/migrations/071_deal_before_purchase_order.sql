-- A quote/Deal may be opened for an unresolved legacy car. Invoice completion waits
-- until the same vehicle has a verified, non-cancelled originating purchase order.
-- Permit the PO intake command to resolve a car already reserved in an open Deal.
do $$
declare original_body text; revised_body text;
  previous_rule text := 'if vehicle.status=''sold'' or exists(select 1 from public.deal_orders where dealer_id=p_dealer and vehicle_id=vehicle.id)
    then raise exception ''vehicle_has_sale_history''; end if;';
  revised_rule text := 'if vehicle.status=''sold'' or exists(
      select 1 from public.deal_orders o join public.deals d on d.id=o.deal_id
      where o.dealer_id=p_dealer and o.vehicle_id=vehicle.id and d.status=''completed''
    ) then raise exception ''vehicle_has_sale_history''; end if;';
begin
  select prosrc into original_body from pg_proc
    where oid='public.commercial_command_v069(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  if original_body is null or position(previous_rule in original_body)=0 then
    raise exception 'purchase_existing_rule_not_found';
  end if;
  revised_body:=replace(original_body,previous_rule,revised_rule);
  execute format('create or replace function public.commercial_command_v069(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
    returns jsonb language plpgsql security definer set search_path=public as %L',revised_body);
end $$;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v070;
revoke all on function public.commercial_command_v070(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare sale_vehicle public.vehicles; po public.purchase_orders;
begin
  -- Bypass v070's earlier PO-at-Deal-creation rule. The original sale validations
  -- and audit chain remain in v069 and its delegated functions.
  if p_command='sale' then
    return public.commercial_command_v069(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if (p_command='status' and p_input->>'status'='completed')
    or (p_command='document' and p_input->>'kind'='invoice') then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then
      raise exception 'commercial_not_allowed';
    end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select v.* into sale_vehicle from public.deals d
      join public.deal_orders o on o.deal_id=d.id and o.kind='sale'
      join public.vehicles v on v.id=o.vehicle_id and v.dealer_id=p_dealer
      where d.id=p_id and d.dealer_id=p_dealer for update of v;
    if found then
      if sale_vehicle.originating_po_id is null or sale_vehicle.provenance_status<>'verified' then
        raise exception 'purchase_order_required_for_completion';
      end if;
      select * into po from public.purchase_orders
        where id=sale_vehicle.originating_po_id and dealer_id=p_dealer
          and vehicle_id=sale_vehicle.id for share;
      if not found or po.status='cancelled' or (po.deal_id is null and
        (nullif(trim(po.inv_ref),'') is null or po.purchase_date is null or po.received_on is null)) then
        raise exception 'purchase_order_required_for_completion';
      end if;
    end if;
  end if;
  return public.commercial_command_v070(p_dealer,p_command,p_id,p_input,p_request);
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

-- Expose only the yes/no acquisition gate to sales users, never cost or vendor data.
create function public.vehicle_purchase_ready(p_dealer uuid,p_vehicle uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then
    raise exception 'commercial_not_allowed';
  end if;
  return exists(select 1 from public.vehicles v join public.purchase_orders po
    on po.id=v.originating_po_id and po.vehicle_id=v.id and po.dealer_id=v.dealer_id
    where v.id=p_vehicle and v.dealer_id=p_dealer and v.provenance_status='verified'
      and po.status<>'cancelled' and (po.deal_id is not null or
        (nullif(trim(po.inv_ref),'') is not null and po.purchase_date is not null and po.received_on is not null)));
end $$;
revoke all on function public.vehicle_purchase_ready(uuid,uuid) from public,anon;
grant execute on function public.vehicle_purchase_ready(uuid,uuid) to authenticated;

-- Legacy direct POs can be completed without rewriting an existing invoice reference
-- or acquisition date. Changes are blank-field-only and audited.
create function public.fill_purchase_intake(p_dealer uuid,p_po uuid,p_data jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare po public.purchase_orders; invoice_ref text; purchased_on date; arrived_on date;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then
    raise exception 'commercial_not_allowed';
  end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2000 then
    raise exception 'invalid_request';
  end if;
  select * into po from public.purchase_orders where id=p_po and dealer_id=p_dealer for update;
  if not found then raise exception 'purchase_missing'; end if;
  if po.status='cancelled' or po.deal_id is not null then raise exception 'purchase_intake_not_editable'; end if;
  if nullif(trim(po.inv_ref),'') is not null and po.purchase_date is not null and po.received_on is not null then
    raise exception 'purchase_intake_complete';
  end if;
  invoice_ref:=coalesce(nullif(trim(po.inv_ref),''),nullif(trim(p_data->>'invRef'),''));
  purchased_on:=coalesce(po.purchase_date,nullif(p_data->>'purchaseDate','')::date);
  arrived_on:=coalesce(po.received_on,nullif(p_data->>'receivedOn','')::date);
  if invoice_ref is null or length(invoice_ref)>80 then raise exception 'supplier_invoice_required'; end if;
  if purchased_on is null then raise exception 'purchase_date_required'; end if;
  if arrived_on is null then raise exception 'vehicle_received_date_required'; end if;
  if arrived_on<purchased_on then raise exception 'vehicle_received_before_purchase'; end if;
  if purchased_on>current_date or arrived_on>current_date then raise exception 'purchase_dates_in_future'; end if;
  update public.purchase_orders set inv_ref=invoice_ref,purchase_date=purchased_on,
    received_on=arrived_on,updated_at=now() where id=po.id and dealer_id=p_dealer;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'purchase_intake_completed','purchase_order',po.id,
      jsonb_build_object('before',jsonb_build_object('inv_ref',po.inv_ref,'purchase_date',po.purchase_date,'received_on',po.received_on),
        'after',jsonb_build_object('inv_ref',invoice_ref,'purchase_date',purchased_on,'received_on',arrived_on)));
end $$;
revoke all on function public.fill_purchase_intake(uuid,uuid,jsonb) from public,anon;
grant execute on function public.fill_purchase_intake(uuid,uuid,jsonb) to authenticated;
