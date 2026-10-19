-- Leaving the customer step persists the party independently of the Deal. The
-- command is replay-safe and records who created/updated the customer and when.
-- A Deal with at least one recorded opening deposit is an agreement; a Deal
-- without a deposit remains a quote unless explicitly promoted.

create table public.customer_intake_requests(
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  request_id uuid not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(dealer_id,request_id)
);
revoke all on public.customer_intake_requests from public,anon,authenticated;

create function public.save_deal_customer(p_dealer uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.customer_intake_requests;customer public.customers;customer_id uuid;
  customer_name text;customer_type text;result jsonb;action_name text;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>12000 then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.customer_intake_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.input<>p_input then raise exception 'request_reused';end if;
    return cached.result;
  end if;

  customer_name:=trim(coalesce(p_input->>'name',''));
  customer_type:=coalesce(nullif(p_input->>'type',''),'individual');
  if char_length(customer_name) not between 2 and 120 or customer_type not in ('individual','business') then raise exception 'customer_required';end if;
  if nullif(p_input->>'email','') is not null and (char_length(p_input->>'email')>200 or position('@' in p_input->>'email')<2) then raise exception 'invalid_customer_email';end if;
  customer_id:=nullif(p_input->>'customerId','')::uuid;

  if customer_id is null then
    insert into public.customers(dealer_id,name,type,phone,email,address_line1,city,county,eircode,country,
      business_name,title,first_name,last_name,job_title,data_consent,ddi_phone,fax,mobile)
    values(p_dealer,customer_name,customer_type,nullif(left(trim(p_input->>'phone'),40),''),nullif(left(trim(p_input->>'email'),200),''),
      nullif(left(trim(p_input->>'address'),400),''),nullif(left(trim(p_input->>'town'),80),''),nullif(left(trim(p_input->>'county'),80),''),
      nullif(left(trim(p_input->>'postCode'),16),''),coalesce(nullif(left(trim(p_input->>'country'),4),''),'IE'),
      nullif(left(trim(p_input->>'company'),120),''),nullif(left(trim(p_input->>'title'),20),''),
      nullif(left(trim(p_input->>'firstName'),80),''),nullif(left(trim(p_input->>'lastName'),80),''),
      nullif(left(trim(p_input->>'jobTitle'),80),''),nullif(left(trim(p_input->>'dataConsent'),40),''),
      nullif(left(trim(p_input->>'ddiPhone'),40),''),nullif(left(trim(p_input->>'fax'),40),''),nullif(left(trim(p_input->>'mobile'),40),''))
    returning * into customer;
    action_name:='customer_created_from_deal_intake';
  else
    select * into customer from public.customers where id=customer_id and dealer_id=p_dealer and deleted_at is null for update;
    if not found then raise exception 'invalid_customer';end if;
    update public.customers set name=customer_name,type=customer_type,
      phone=nullif(left(trim(p_input->>'phone'),40),''),email=nullif(left(trim(p_input->>'email'),200),''),
      address_line1=nullif(left(trim(p_input->>'address'),400),''),city=nullif(left(trim(p_input->>'town'),80),''),
      county=nullif(left(trim(p_input->>'county'),80),''),eircode=nullif(left(trim(p_input->>'postCode'),16),''),
      country=coalesce(nullif(left(trim(p_input->>'country'),4),''),'IE'),business_name=nullif(left(trim(p_input->>'company'),120),''),
      title=nullif(left(trim(p_input->>'title'),20),''),first_name=nullif(left(trim(p_input->>'firstName'),80),''),
      last_name=nullif(left(trim(p_input->>'lastName'),80),''),job_title=nullif(left(trim(p_input->>'jobTitle'),80),''),
      data_consent=nullif(left(trim(p_input->>'dataConsent'),40),''),ddi_phone=nullif(left(trim(p_input->>'ddiPhone'),40),''),
      fax=nullif(left(trim(p_input->>'fax'),40),''),mobile=nullif(left(trim(p_input->>'mobile'),40),'')
    where id=customer_id returning * into customer;
    action_name:='customer_updated_from_deal_intake';
  end if;

  result:=jsonb_build_object('id',customer.id,'name',customer.name,'type',customer.type,'savedAt',now());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),action_name,'customer',customer.id,jsonb_build_object('source','deal_intake','name',customer.name,'type',customer.type));
  insert into public.customer_intake_requests(dealer_id,request_id,input,result) values(p_dealer,p_request,p_input,result);
  return result;
end $$;
revoke all on function public.save_deal_customer(uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_deal_customer(uuid,jsonb,uuid) to authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v064;
revoke all on function public.commercial_command_v064(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;v_deal_id uuid;
begin
  result:=public.commercial_command_v064(p_dealer,p_command,p_id,p_input,p_request);
  if p_command='sale' then
    v_deal_id:=(result->>'id')::uuid;
    if exists(select 1 from public.payments p where p.dealer_id=p_dealer and p.deal_id=v_deal_id and p.source_request_id=p_request and p.kind='deposit') then
      update public.deals set status='agreed',updated_at=now() where id=v_deal_id and dealer_id=p_dealer and status in ('draft','quoted');
      if not exists(select 1 from public.deal_events e where e.deal_id=v_deal_id and e.kind='agreement_by_deposit' and e.detail->>'request_id'=p_request::text) then
        insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,v_deal_id,'agreement_by_deposit',
          jsonb_build_object('message','Agreement stage reached by recorded opening deposit','request_id',p_request),auth.uid());
        insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'deal_agreed_by_deposit','deal',v_deal_id,jsonb_build_object('request_id',p_request));
      end if;
      result:=result||jsonb_build_object('status','agreed');
    end if;
  end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
