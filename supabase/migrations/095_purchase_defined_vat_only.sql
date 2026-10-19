-- The ordinary unconfigured default is margin. Preserve every explicit dealer
-- choice, including an explicit No VAT choice made through tax settings.
alter table public.accounting_settings alter column default_vat_scheme set default 'margin';
update public.accounting_settings s set default_vat_scheme='margin'
where s.default_vat_scheme='none' and not exists(
  select 1 from public.audit_logs a where a.dealer_id=s.dealer_id and a.action='tax_settings');

-- A missing acquisition is not evidence that the car or van qualifies for VAT.
do $$
declare body text; original text;
begin
  select prosrc into body from pg_proc where oid='public.commercial_command_v079(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'coalesce(scheme,''standard'')','coalesce(scheme,''margin'')');
  if body=original then raise exception 'sale_vat_fallback_patch_missing'; end if;
  execute format('create or replace function public.commercial_command_v079(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);

  select prosrc into body from pg_proc where oid='public.create_sales_quote(uuid,jsonb,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'coalesce(scheme,''standard'')','coalesce(scheme,''margin'')');
  if body=original then raise exception 'quote_vat_fallback_patch_missing'; end if;
  execute format('create or replace function public.create_sales_quote(p_dealer uuid,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);

  select prosrc into body from pg_proc where oid='public.autosave_new_deal_v083(uuid,uuid,integer,jsonb,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'coalesce(public.vehicle_purchase_vat(p_dealer,v.id),''standard'')','coalesce(public.vehicle_purchase_vat(p_dealer,v.id),''margin'')');
  if body=original then raise exception 'autosave_vat_fallback_patch_missing'; end if;
  execute format('create or replace function public.autosave_new_deal_v083(p_dealer uuid,p_session uuid,p_revision integer,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
end $$;

create or replace function public.inherit_sale_purchase_tax() returns trigger
language plpgsql security definer set search_path=public as $$
declare po public.purchase_orders;
begin
  if new.kind<>'sale' then return new; end if;
  select p.* into po from public.vehicles v join public.purchase_orders p on p.id=v.originating_po_id and p.dealer_id=v.dealer_id
    where v.id=new.vehicle_id and v.dealer_id=new.dealer_id and p.vehicle_id=v.id and p.status<>'cancelled';
  if not found then
    new.vat_scheme:='margin';new.vat_rate:=0;new.imported:=false;
    new.vrt_amount:=0;new.vrt_vat_treatment:='included';new.tax_source_po_id:=null;
  elsif tg_op='INSERT' or new.tax_source_po_id is null or new.vehicle_id is distinct from old.vehicle_id then
    new.vat_scheme:=po.vat_scheme;new.vat_rate:=po.vat_rate;new.imported:=po.imported;
    new.vrt_amount:=po.vrt_amount;new.vrt_vat_treatment:=po.vrt_vat_treatment;new.tax_source_po_id:=po.id;
  end if;
  if new.vrt_amount>new.price then raise exception 'vrt_exceeds_sale_price'; end if;
  return new;
end $$;

-- Existing open orders may still carry the old standard fallback. Resolve the
-- effective tax in newly issued documents without rewriting an issued snapshot,
-- changing the sale price, or guessing a margin tax amount without a purchase.
do $$
declare body text; original text;
begin
  select prosrc into body from pg_proc where oid='public.issue_commercial_document_v058(uuid,text)'::regprocedure;
  original:=body;
  body:=replace(body,'select * into strict v from vehicles where id=o.vehicle_id and dealer_id=d.dealer_id;',
    'select * into strict v from vehicles where id=o.vehicle_id and dealer_id=d.dealer_id;
  if public.vehicle_purchase_vat(d.dealer_id,v.id) is null then
    o.vat_scheme:=''margin'';o.vat_rate:=0;o.vrt_amount:=0;o.vrt_vat_treatment:=''included'';o.imported:=false;
  end if;');
  body:=replace(body,'''scheme'',o.vat_scheme,','''scheme'',o.vat_scheme,''tax_pending'',public.vehicle_purchase_vat(d.dealer_id,v.id) is null,');
  if body=original then raise exception 'document_vat_fallback_patch_missing'; end if;
  execute format('create or replace function public.issue_commercial_document_v058(p_deal uuid,p_kind text) returns uuid language plpgsql security definer set search_path=public as %L',body);
end $$;
