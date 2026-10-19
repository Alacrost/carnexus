-- Tax defaults apply to new acquisitions. Every PO and sale retains its own rate.
alter table public.accounting_settings
  add column default_vat_scheme text not null default 'none' check(default_vat_scheme in ('standard','margin','none')),
  add column standard_vat_rate numeric(5,2) not null default 23 check(standard_vat_rate between 0 and 100);
alter table public.purchase_orders
  add column vat_rate numeric(5,2) not null default 23 check(vat_rate between 0 and 100),
  add column imported boolean not null default false,
  add column vrt_amount numeric(14,2) not null default 0 check(vrt_amount>=0),
  add column vrt_vat_treatment text not null default 'included' check(vrt_vat_treatment in ('included','excluded'));
alter table public.deal_orders
  add column vat_rate numeric(5,2) not null default 23 check(vat_rate between 0 and 100),
  add column imported boolean not null default false,
  add column vrt_amount numeric(14,2) not null default 0 check(vrt_amount>=0),
  add column vrt_vat_treatment text not null default 'included' check(vrt_vat_treatment in ('included','excluded')),
  add column tax_source_po_id uuid references public.purchase_orders(id);

create function public.financial_tax_settings(p_dealer uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
  return (select jsonb_build_object('defaultVatScheme',default_vat_scheme,'standardVatRate',standard_vat_rate) from public.accounting_settings where dealer_id=p_dealer);
end $$;
revoke all on function public.financial_tax_settings(uuid) from public,anon;
grant execute on function public.financial_tax_settings(uuid) to authenticated;

create function public.vehicle_purchase_tax(p_dealer uuid,p_vehicle uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
  return (select jsonb_build_object('scheme',po.vat_scheme,'vatRate',po.vat_rate,'imported',po.imported,
    'vrtAmount',po.vrt_amount,'vrtVatTreatment',po.vrt_vat_treatment)
    from public.vehicles v join public.purchase_orders po on po.id=v.originating_po_id and po.dealer_id=v.dealer_id and po.vehicle_id=v.id
    where v.id=p_vehicle and v.dealer_id=p_dealer and po.status<>'cancelled');
end $$;
revoke all on function public.vehicle_purchase_tax(uuid,uuid) from public,anon;
grant execute on function public.vehicle_purchase_tax(uuid,uuid) to authenticated;

create function public.inherit_new_purchase_tax() returns trigger
language plpgsql security definer set search_path=public as $$
declare profile jsonb;
begin
  profile:=nullif(current_setting('app.purchase_tax_profile',true),'')::jsonb;
  new.vat_rate:=coalesce((profile->>'vatRate')::numeric,(select standard_vat_rate from public.accounting_settings where dealer_id=new.dealer_id),23);
  new.imported:=coalesce((profile->>'imported')::boolean,false);
  new.vrt_amount:=coalesce((profile->>'vrtAmount')::numeric,0);
  new.vrt_vat_treatment:=coalesce(profile->>'vrtVatTreatment','included');
  if new.vrt_amount<0 or new.vrt_amount<>round(new.vrt_amount,2) or (not new.imported and new.vrt_amount<>0)
    or new.vat_rate<0 or new.vat_rate>100 or new.vrt_vat_treatment not in ('included','excluded') then raise exception 'invalid_purchase_tax'; end if;
  return new;
end $$;
revoke all on function public.inherit_new_purchase_tax() from public,anon,authenticated;
create trigger inherit_new_purchase_tax before insert on public.purchase_orders for each row execute function public.inherit_new_purchase_tax();

create function public.apply_purchase_line_tax() returns trigger
language plpgsql security definer set search_path=public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id=new.po_id and dealer_id=new.dealer_id;
  if new.vehicle_id is not null and new.vehicle_id=po.vehicle_id then
    new.vat:=case when po.vat_scheme='standard' then round(new.gross*po.vat_rate/(100+po.vat_rate),2) else 0 end;
    new.net:=new.gross-new.vat;
  end if;
  return new;
end $$;
revoke all on function public.apply_purchase_line_tax() from public,anon,authenticated;
create trigger apply_purchase_line_tax before insert or update on public.po_lines for each row execute function public.apply_purchase_line_tax();

create function public.inherit_sale_purchase_tax() returns trigger
language plpgsql security definer set search_path=public as $$
declare po public.purchase_orders;
begin
  if new.kind<>'sale' then return new; end if;
  if tg_op='INSERT' or new.tax_source_po_id is null or new.vehicle_id is distinct from old.vehicle_id then
    select p.* into po from public.vehicles v join public.purchase_orders p on p.id=v.originating_po_id and p.dealer_id=v.dealer_id
      where v.id=new.vehicle_id and v.dealer_id=new.dealer_id and p.vehicle_id=v.id and p.status<>'cancelled';
    if found then
      new.vat_scheme:=po.vat_scheme;new.vat_rate:=po.vat_rate;new.imported:=po.imported;
      new.vrt_amount:=po.vrt_amount;new.vrt_vat_treatment:=po.vrt_vat_treatment;new.tax_source_po_id:=po.id;
    end if;
  end if;
  if new.vrt_amount>new.price then raise exception 'vrt_exceeds_sale_price'; end if;
  return new;
end $$;
revoke all on function public.inherit_sale_purchase_tax() from public,anon,authenticated;
create trigger inherit_sale_purchase_tax before insert or update on public.deal_orders for each row execute function public.inherit_sale_purchase_tax();

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v093;
revoke all on function public.commercial_command_v093(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; cached public.commercial_requests; po public.purchase_orders; profile jsonb; previous_profile text;
  rate numeric; scheme text; vrt numeric; v_imported boolean; treatment text;
begin
  if p_command in ('tax_settings','purchase_tax_details') then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then raise exception 'commercial_not_allowed'; end if;
    if p_command='tax_settings' and public.user_role_in(p_dealer)::text not in ('owner','admin') then raise exception 'tax_settings_not_allowed'; end if;
    if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid_request'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
    if found then
      if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused'; end if;
      return cached.result;
    end if;
    rate:=case when p_command='tax_settings' then (p_input->>'standardVatRate')::numeric else (p_input->>'vatRate')::numeric end;
    scheme:=case when p_command='tax_settings' then p_input->>'defaultVatScheme' else p_input->>'vatScheme' end;
    if rate is null or rate<0 or rate>100 or rate<>round(rate,2) or scheme is null or scheme not in ('standard','margin','none') then raise exception 'invalid_purchase_tax'; end if;
    if p_command='tax_settings' then
      update public.accounting_settings set default_vat_scheme=scheme,standard_vat_rate=rate,updated_by=auth.uid(),updated_at=now() where dealer_id=p_dealer;
      result:=jsonb_build_object('id',p_dealer);
    else
      select * into po from public.purchase_orders where id=p_id and dealer_id=p_dealer for update;
      if not found or po.status='cancelled' then raise exception 'purchase_missing'; end if;
      if exists(select 1 from public.deal_orders o join public.deals d on d.id=o.deal_id where o.vehicle_id=po.vehicle_id and o.kind='sale'
        and (d.status in ('completed','reversed') or exists(select 1 from public.deal_documents x where x.deal_id=d.id and x.kind='invoice' and x.status<>'void')))
        then raise exception 'purchase_tax_locked'; end if;
      v_imported:=coalesce((p_input->>'imported')::boolean,false);vrt:=coalesce((p_input->>'vrtAmount')::numeric,0);treatment:=coalesce(p_input->>'vrtVatTreatment','included');
      if vrt<0 or vrt<>round(vrt,2) or (not v_imported and vrt<>0) or treatment not in ('included','excluded') then raise exception 'invalid_purchase_tax'; end if;
      update public.purchase_orders set vat_scheme=scheme,vat_rate=rate,imported=v_imported,vrt_amount=vrt,vrt_vat_treatment=treatment where id=po.id;
      update public.po_lines set gross=gross where po_id=po.id and vehicle_id=po.vehicle_id;
      update public.deal_orders o set vat_scheme=scheme,vat_rate=rate,imported=v_imported,vrt_amount=vrt,vrt_vat_treatment=treatment,tax_source_po_id=po.id
        where o.vehicle_id=po.vehicle_id and o.kind='sale' and o.dealer_id=p_dealer
          and exists(select 1 from public.deals d where d.id=o.deal_id and d.status not in ('completed','cancelled','reversed'));
      update public.deals d set version=version+1,updated_at=now() where d.dealer_id=p_dealer and d.status not in ('completed','cancelled','reversed')
        and exists(select 1 from public.deal_orders o where o.deal_id=d.id and o.kind='sale' and o.vehicle_id=po.vehicle_id);
      insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
        select p_dealer,d.id,'purchase_tax_updated',jsonb_build_object('message','Purchase VAT and VRT updated; previous documents retained','po_id',po.id),auth.uid()
        from public.deals d where d.dealer_id=p_dealer and d.status not in ('completed','cancelled','reversed') and exists(select 1 from public.deal_orders o where o.deal_id=d.id and o.kind='sale' and o.vehicle_id=po.vehicle_id);
      result:=jsonb_build_object('id',po.id);
    end if;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),p_command,case when p_command='tax_settings' then 'accounting_settings' else 'purchase_order' end,coalesce(p_id,p_dealer),p_input);
    insert into public.commercial_requests(dealer_id,request_id,command,input,result) values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
    return result;
  end if;
  if p_command in ('purchase','purchase_existing') then
    profile:=public.financial_tax_settings(p_dealer);
    select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
    p_input:=p_input||jsonb_build_object('vatScheme',coalesce(p_input->>'vatScheme',
      case when cached.command=p_command then cached.input->'data'->>'vatScheme' end,profile->>'defaultVatScheme','none'));
    previous_profile:=coalesce(current_setting('app.purchase_tax_profile',true),'');
    perform set_config('app.purchase_tax_profile',p_input::text,true);
    result:=public.commercial_command_v093(p_dealer,p_command,p_id,p_input,p_request);
    perform set_config('app.purchase_tax_profile',previous_profile,true);
    return result;
  end if;
  return public.commercial_command_v093(p_dealer,p_command,p_id,p_input,p_request);
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

-- Change only newly created snapshots. Existing issued documents are not rewritten.
do $$
declare body text; original text;
begin
  select prosrc into body from pg_proc where oid='public.issue_commercial_document_v058(uuid,text)'::regprocedure;
  original:=body;
  body:=replace(body,'round(o.price*23/123,2)',
    'round((o.price-case when o.vrt_vat_treatment=''excluded'' then o.vrt_amount else 0 end)*o.vat_rate/(100+o.vat_rate),2)');
  body:=replace(body,'then 23 else null end','then o.vat_rate else null end');
  body:=replace(body,'then 23 else 0 end','then o.vat_rate else 0 end');
  body:=replace(body,'''scheme'',o.vat_scheme,','''scheme'',o.vat_scheme,''imported'',o.imported,');
  body:=replace(body,'''km'',v.km)', '''km'',v.km,''original_registration'',(select original_registration from public.vehicle_details where vehicle_id=v.id))');
  body:=replace(body,'''costToChange'',total-d.siv_total,',
    '''costToChange'',total-d.siv_total,''vrtAmount'',o.vrt_amount,''vrtVatTreatment'',o.vrt_vat_treatment,''vehicleVatBase'',o.price-case when o.vrt_vat_treatment=''excluded'' then o.vrt_amount else 0 end,');
  if body=original then raise exception 'tax_snapshot_patch_missing'; end if;
  execute format('create or replace function public.issue_commercial_document_v058(p_deal uuid,p_kind text) returns uuid language plpgsql security definer set search_path=public as %L',body);
end $$;
