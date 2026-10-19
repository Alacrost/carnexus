-- Multi-location reporting inside one dealer tenant. A location is an operating
-- branch, never a security boundary; dealer_id remains the isolation boundary.

create table public.dealer_locations(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 120),code text check(code is null or char_length(trim(code)) between 1 and 20),
  is_primary boolean not null default false,active boolean not null default true,
  created_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(dealer_id,name)
);
create unique index dealer_locations_one_primary on public.dealer_locations(dealer_id) where is_primary;
insert into public.dealer_locations(dealer_id,name,code,is_primary)
select id,'Main location','MAIN',true from public.dealers;
alter table public.dealer_locations enable row level security;
revoke all on public.dealer_locations from anon,authenticated;grant select on public.dealer_locations to authenticated;
create policy dealer_locations_read on public.dealer_locations for select using(public.commercial_allowed(dealer_id,'read'));

create function public.seed_primary_location() returns trigger language plpgsql set search_path=public as $$
begin insert into public.dealer_locations(dealer_id,name,code,is_primary) values(new.id,'Main location','MAIN',true);return new;end $$;
create trigger dealers_seed_primary_location after insert on public.dealers for each row execute function public.seed_primary_location();

alter table public.deals add column location_id uuid references public.dealer_locations(id);
update public.deals d set location_id=(select l.id from public.dealer_locations l where l.dealer_id=d.dealer_id and l.is_primary);
alter table public.deals alter column location_id set not null;
create index deals_location_date on public.deals(dealer_id,location_id,created_at);
grant select(location_id) on public.deals to authenticated;

create function public.default_deal_location() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.location_id is null then select id into new.location_id from public.dealer_locations where dealer_id=new.dealer_id and is_primary and active;end if;
  if not exists(select 1 from public.dealer_locations where id=new.location_id and dealer_id=new.dealer_id and active) then raise exception 'invalid_location';end if;
  return new;
end $$;
create trigger deals_default_location before insert or update of location_id,dealer_id on public.deals for each row execute function public.default_deal_location();

create table public.location_requests(dealer_id uuid references public.dealers(id),request_id uuid,command text,input jsonb,result jsonb,primary key(dealer_id,request_id));
revoke all on public.location_requests from anon,authenticated;
create function public.location_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.location_requests;result jsonb;location public.dealer_locations;
begin
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin') then raise exception 'location_not_allowed';end if;
  if p_request is null or p_input is null then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.location_requests where dealer_id=p_dealer and request_id=p_request;
  if found then if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;return cached.result;end if;
  if p_command='create' then
    insert into public.dealer_locations(dealer_id,name,code,created_by) values(p_dealer,trim(p_input->>'name'),nullif(upper(trim(p_input->>'code')),''),auth.uid()) returning * into location;
  elsif p_command='update' then
    update public.dealer_locations set name=trim(p_input->>'name'),code=nullif(upper(trim(p_input->>'code')),''),active=coalesce((p_input->>'active')::boolean,active)
      where id=p_id and dealer_id=p_dealer and not is_primary returning * into location;
    if not found then raise exception 'location_missing_or_primary';end if;
  else raise exception 'invalid_command';end if;
  result:=jsonb_build_object('id',location.id,'name',location.name,'code',location.code,'active',location.active);
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'location_'||p_command,'dealer_location',location.id,p_input);
  insert into public.location_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);return result;
end $$;
revoke all on function public.location_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.location_command(uuid,text,uuid,jsonb,uuid) to authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v063;
revoke all on function public.commercial_command_v063(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;location uuid;
begin
  result:=public.commercial_command_v063(p_dealer,p_command,p_id,p_input,p_request);
  if p_command='sale' and nullif(p_input->>'locationId','') is not null then
    location:=(p_input->>'locationId')::uuid;
    if not exists(select 1 from public.dealer_locations where id=location and dealer_id=p_dealer and active) then raise exception 'invalid_location';end if;
    update public.deals set location_id=location where id=(result->>'id')::uuid and dealer_id=p_dealer;
  end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

alter function public.sales_lifecycle_report(uuid,date,date,text) rename to sales_lifecycle_report_v063;
revoke all on function public.sales_lifecycle_report_v063(uuid,date,date,text) from public,anon,authenticated;
create function public.sales_lifecycle_report(
  p_dealer uuid,p_from date,p_to date,p_basis text default 'invoice',p_status text default 'all',
  p_salesperson uuid default null,p_location uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;positions jsonb;open_positions jsonb;credits jsonb;pending_receipts jsonb;receipt_register jsonb;ranking jsonb;summary jsonb;
begin
  if p_status not in ('all','open','completed','reversed','outstanding','pending_clearance','overpaid') then raise exception 'invalid_report_status';end if;
  if p_location is not null and not exists(select 1 from public.dealer_locations where id=p_location and dealer_id=p_dealer) then raise exception 'invalid_location';end if;
  result:=public.sales_lifecycle_report_v063(p_dealer,p_from,p_to,p_basis);

  select coalesce(jsonb_agg(item||jsonb_build_object('status',d.status,'locationId',d.location_id,'location',l.name,
    'overpayment',(public.commercial_totals(d.id)->>'overpaid')::numeric) order by item->>'reportDate' desc),'[]') into positions
  from jsonb_array_elements(result->'invoicePositions') item join public.deals d on d.id=(item->>'dealId')::uuid
  join public.dealer_locations l on l.id=d.location_id
  where (p_salesperson is null or (item->>'responsibleId')::uuid=p_salesperson)
    and (p_location is null or d.location_id=p_location)
    and (p_status='all' or (p_status='completed' and d.status='completed') or (p_status='reversed' and d.status='reversed')
      or (p_status='outstanding' and (public.commercial_totals(d.id)->>'outstanding')::numeric>0)
      or (p_status='pending_clearance' and (public.commercial_totals(d.id)->>'pending')::numeric>0)
      or (p_status='overpaid' and (public.commercial_totals(d.id)->>'overpaid')::numeric>0));
  if p_status='open' then positions:='[]'::jsonb;end if;

  select coalesce(jsonb_agg(item||jsonb_build_object('locationId',d.location_id,'location',l.name) order by item->>'issuedAt' desc),'[]') into open_positions
  from jsonb_array_elements(result->'openPositions') item join public.deals d on d.id=(item->>'id')::uuid
  join public.dealer_locations l on l.id=d.location_id
  where (p_salesperson is null or d.salesperson_id=p_salesperson) and (p_location is null or d.location_id=p_location);
  if p_status not in ('all','open') then open_positions:='[]'::jsonb;end if;

  select coalesce(jsonb_agg(item order by item->>'issuedAt' desc),'[]') into credits
  from jsonb_array_elements(result->'creditPositions') item join public.deals d on d.id=(item->>'dealId')::uuid
  where (p_salesperson is null or d.salesperson_id=p_salesperson) and (p_location is null or d.location_id=p_location)
    and p_status in ('all','completed','reversed');

  select coalesce(jsonb_agg(item order by item->>'receivedOn'),'[]') into pending_receipts
  from jsonb_array_elements(result->'pendingReceipts') item join public.deals d on d.id=(item->>'dealId')::uuid
  where (p_salesperson is null or d.salesperson_id=p_salesperson) and (p_location is null or d.location_id=p_location)
    and (p_status='all' or p_status='pending_clearance' or (p_status='completed' and d.status='completed') or (p_status='reversed' and d.status='reversed'));

  with rows as (select value item from jsonb_array_elements(positions)),grouped as (
    select item->>'responsibleId' id,item->>'responsible' responsible,count(*) invoices,
      sum((item->>'gross')::numeric) gross,sum((item->>'credited')::numeric) credited,sum((item->>'net')::numeric) net
    from rows group by item->>'responsibleId',item->>'responsible')
  select coalesce(jsonb_agg(jsonb_build_object('responsibleId',id,'responsible',responsible,'invoices',invoices,'gross',gross,'credited',credited,'net',net) order by net desc),'[]') into ranking from grouped;

  with rows as (select value item from jsonb_array_elements(positions)),opens as(select value item from jsonb_array_elements(open_positions))
  select jsonb_build_object('openDeals',(select count(*) from opens),'openAgreementValue',(select coalesce(sum((item->>'gross')::numeric),0) from opens),
    'invoices',(select count(*) from rows),'invoicedGross',(select coalesce(sum((item->>'gross')::numeric),0) from rows),
    'creditNotes',(select coalesce(sum(jsonb_array_length(credits)),0)),'creditedGross',(select coalesce(sum((item->>'credited')::numeric),0) from rows),
    'netInvoicedRevenue',(select coalesce(sum((item->>'net')::numeric),0) from rows),
    'pendingClearance',(select coalesce(sum((item->>'pendingClearance')::numeric),0) from rows),
    'pendingReceipts',(select count(*) from jsonb_array_elements(pending_receipts)),
    'customerOutstanding',(select coalesce(sum((item->>'outstanding')::numeric),0) from rows),
    'customerOverpaid',(select coalesce(sum((item->>'overpayment')::numeric),0) from rows)) into summary;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'dealId',d.id,'dealNo',d.deal_no,'invoiceNo',coalesce(inv.number,'—'),'customer',coalesce(c.name,'—'),
    'responsible',coalesce(sp.full_name,'—'),'location',l.name,'kind',p.kind,'method',p.method,'amount',p.amount,
    'signedAmount',case when p.kind in ('refund','receipt_reversal') then -p.amount else p.amount end,
    'enteredDate',p.paid_on,'enteredAt',p.created_at,'enteredBy',coalesce(actor.full_name,'—'),'reference',p.reference,
    'clearanceStatus',p.clearance_status,'clearedOn',p.cleared_on,'reason',p.rejection_reason
  ) order by p.paid_on,p.created_at),'[]') into receipt_register
  from public.payments p join public.deals d on d.id=p.deal_id join public.dealer_locations l on l.id=d.location_id
  left join public.customers c on c.id=d.customer_id left join public.profiles sp on sp.id=d.salesperson_id
  left join public.profiles actor on actor.id=p.created_by
  left join lateral(select number from public.deal_documents where deal_id=d.id and kind='invoice' and status<>'void' order by created_at desc limit 1) inv on true
  where p.dealer_id=p_dealer and p.paid_on between p_from and p_to
    and (p_salesperson is null or d.salesperson_id=p_salesperson) and (p_location is null or d.location_id=p_location)
    and (p_status='all' or p_status='pending_clearance' and p.clearance_status='pending'
      or p_status='completed' and d.status='completed' or p_status='reversed' and d.status='reversed'
      or p_status='outstanding' and (public.commercial_totals(d.id)->>'outstanding')::numeric>0
      or p_status='overpaid' and (public.commercial_totals(d.id)->>'overpaid')::numeric>0);

  return result||jsonb_build_object('summary',summary,'openPositions',open_positions,'invoicePositions',positions,
    'creditPositions',credits,'pendingReceipts',pending_receipts,
    'salesByResponsible',ranking,'receiptRegister',receipt_register,
    'filters',jsonb_build_object('status',p_status,'salespersonId',p_salesperson,'locationId',p_location));
end $$;
revoke all on function public.sales_lifecycle_report(uuid,date,date,text,text,uuid,uuid) from public,anon;
grant execute on function public.sales_lifecycle_report(uuid,date,date,text,text,uuid,uuid) to authenticated;
