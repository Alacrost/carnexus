-- Do not allow a sale to bypass the vehicle's verified acquisition PO.
alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v069;
revoke all on function public.commercial_command_v069(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.vehicles;
begin
  if p_command='sale' then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then
      raise exception 'commercial_not_allowed';
    end if;
    select * into v from public.vehicles
      where dealer_id=p_dealer and id=nullif(p_input->>'vehicleId','')::uuid;
    if found and (v.originating_po_id is null or v.provenance_status<>'verified'
      or not exists(select 1 from public.purchase_orders po
        where po.id=v.originating_po_id and po.dealer_id=p_dealer
          and po.vehicle_id=v.id and po.status<>'cancelled')) then
      raise exception 'purchase_order_required_for_sale';
    end if;
  end if;
  return public.commercial_command_v069(p_dealer,p_command,p_id,p_input,p_request);
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
