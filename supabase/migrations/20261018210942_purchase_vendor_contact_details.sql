-- Save the complete seller contact in the same transaction as its purchase order.
-- Existing contact selections and every commercial wrapper remain unchanged.
create function public.create_purchase_vendor(p_dealer uuid,p_vendor jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare
  vendor_id uuid;
  vendor_type text;
  vendor_country text;
  field_name text;
  max_length integer;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then
    raise exception 'commercial_not_allowed';
  end if;
  if p_vendor is null or jsonb_typeof(p_vendor)<>'object' then raise exception 'vendor_required'; end if;
  if jsonb_typeof(p_vendor->'name') is distinct from 'string'
    or char_length(trim(p_vendor->>'name')) not between 2 and 120 then
    raise exception 'vendor_required';
  end if;
  vendor_type:=coalesce(p_vendor->>'type','business');
  vendor_country:=coalesce(nullif(trim(p_vendor->>'country'),''),'IE');
  if vendor_type not in ('individual','business') then raise exception 'invalid_vendor_type'; end if;
  if vendor_country not in ('IE','GB','CA') then raise exception 'invalid_vendor_country'; end if;
  for field_name,max_length in select key,value::integer from jsonb_each_text('{
    "business_name":120,"title":20,"first_name":80,"last_name":80,"job_title":80,
    "phone":40,"mobile":40,"ddi_phone":40,"fax":40,"email":200,
    "address_line1":500,"address_line2":160,"city":80,"county":80,"eircode":16,
    "vat_number":40,"notes":2000
  }'::jsonb) loop
    if p_vendor ? field_name and p_vendor->field_name<>'null'::jsonb then
      if jsonb_typeof(p_vendor->field_name)<>'string'
        or char_length(trim(p_vendor->>field_name))>max_length then
        raise exception 'invalid_vendor_field: %',field_name;
      end if;
    end if;
  end loop;
  if nullif(trim(p_vendor->>'email'),'') is not null
    and trim(p_vendor->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_vendor_email';
  end if;
  insert into public.customers(
    dealer_id,name,type,business_name,title,first_name,last_name,job_title,
    phone,mobile,ddi_phone,fax,email,address_line1,address_line2,city,county,eircode,
    country,vat_number,notes
  ) values (
    p_dealer,trim(p_vendor->>'name'),vendor_type,
    nullif(trim(p_vendor->>'business_name'),''),nullif(trim(p_vendor->>'title'),''),
    nullif(trim(p_vendor->>'first_name'),''),nullif(trim(p_vendor->>'last_name'),''),
    nullif(trim(p_vendor->>'job_title'),''),nullif(trim(p_vendor->>'phone'),''),
    nullif(trim(p_vendor->>'mobile'),''),nullif(trim(p_vendor->>'ddi_phone'),''),
    nullif(trim(p_vendor->>'fax'),''),nullif(trim(p_vendor->>'email'),''),
    nullif(trim(p_vendor->>'address_line1'),''),nullif(trim(p_vendor->>'address_line2'),''),
    nullif(trim(p_vendor->>'city'),''),nullif(trim(p_vendor->>'county'),''),
    nullif(trim(p_vendor->>'eircode'),''),vendor_country,
    nullif(trim(p_vendor->>'vat_number'),''),nullif(trim(p_vendor->>'notes'),'')
  ) returning id into vendor_id;
  return vendor_id;
end $$;
revoke all on function public.create_purchase_vendor(uuid,jsonb) from public,anon,authenticated;

-- Patch only the insert sites; fail closed if the expected historical bodies differ.
-- The original authorization, locks, request cache, PO/vehicle/tax work and audit stay in place.
do $$
declare body text; old_insert text; new_insert text; function_name text;
begin
  for function_name,old_insert,new_insert in values
    ('commercial_command_v053',
      $old$insert into public.customers(dealer_id,name,type,phone,email)
        values(p_dealer,left(new_vendor->>'name',120),'business',left(new_vendor->>'phone',40),left(new_vendor->>'email',200))
        returning id into vendor_id;$old$,
      $new$vendor_id:=public.create_purchase_vendor(p_dealer,new_vendor);$new$),
    ('commercial_command_v069',
      $old$insert into public.customers(dealer_id,name,type,phone,email)
      values(p_dealer,left(p_input->'newVendor'->>'name',120),'business',
        left(p_input->'newVendor'->>'phone',40),left(p_input->'newVendor'->>'email',200))
      returning id into vendor_id;$old$,
      $new$vendor_id:=public.create_purchase_vendor(p_dealer,p_input->'newVendor');$new$)
  loop
    select replace(prosrc,E'\r\n',E'\n') into body from pg_proc
      where oid=to_regprocedure('public.'||function_name||'(uuid,text,uuid,jsonb,uuid)');
    if body is null or (length(body)-length(replace(body,old_insert,'')))/length(old_insert)<>1 then
      raise exception 'purchase_vendor_patch_missing: %',function_name;
    end if;
    body:=replace(body,old_insert,new_insert);
    execute format('create or replace function public.%I(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',function_name,body);
  end loop;
end $$;

-- The application checks this before accepting the richer contact payload so an
-- older database cannot silently discard fields. This function does not write data.
create function public.purchase_vendor_schema_version(p_dealer uuid)
returns integer language plpgsql stable security invoker set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then
    raise exception 'commercial_not_allowed';
  end if;
  return 1;
end $$;
revoke all on function public.purchase_vendor_schema_version(uuid) from public,anon;
grant execute on function public.purchase_vendor_schema_version(uuid) to authenticated;
