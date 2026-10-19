-- Dealer-scoped contact groups. Existing finance presets remain editable and are
-- mirrored into CRM contacts so the Deal editor has one contact-based source.
create table public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  system_key text check (system_key in ('customers','finance_companies')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (dealer_id,id),
  unique (dealer_id,name),
  unique (dealer_id,system_key)
);

create table public.contact_group_members (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  group_id uuid not null,
  customer_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (group_id,customer_id),
  foreign key (dealer_id,group_id) references public.contact_groups(dealer_id,id) on delete cascade,
  foreign key (customer_id) references public.customers(id) on delete cascade
);
create index contact_group_members_customer_idx on public.contact_group_members(dealer_id,customer_id);

alter table public.customers add column source_finance_preset_id uuid unique
  references public.dealer_finance_companies(id) on delete set null;
alter table public.dealer_finance_companies add constraint dealer_finance_companies_dealer_id_id_unique unique (dealer_id,id);
alter table public.customers add constraint customers_finance_preset_dealer_fk
  foreign key (dealer_id,source_finance_preset_id) references public.dealer_finance_companies(dealer_id,id)
  on delete set null (source_finance_preset_id);
create unique index customers_dealer_id_id_for_groups on public.customers(dealer_id,id);
alter table public.contact_group_members add constraint contact_group_members_customer_dealer_fk
  foreign key (dealer_id,customer_id) references public.customers(dealer_id,id) on delete cascade;

alter table public.contact_groups enable row level security;
alter table public.contact_group_members enable row level security;
revoke all on public.contact_groups,public.contact_group_members from anon,authenticated;
grant select,insert on public.contact_groups to authenticated;
grant select,insert,delete on public.contact_group_members to authenticated;
create policy contact_groups_read on public.contact_groups for select
  using (public.commercial_allowed(dealer_id,'read'));
create policy contact_groups_insert on public.contact_groups for insert
  with check (public.commercial_allowed(dealer_id,'work') and system_key is null);
create policy contact_group_members_read on public.contact_group_members for select
  using (public.commercial_allowed(dealer_id,'read'));
create policy contact_group_members_insert on public.contact_group_members for insert
  with check (public.commercial_allowed(dealer_id,'work') and exists (
    select 1 from public.customers c where c.id=customer_id and c.dealer_id=dealer_id and c.deleted_at is null));
create policy contact_group_members_delete on public.contact_group_members for delete
  using (public.commercial_allowed(dealer_id,'work') and exists (
    select 1 from public.contact_groups g where g.id=group_id and g.system_key is distinct from 'customers'));

insert into public.contact_groups(dealer_id,name,system_key)
select d.id,'Customers','customers' from public.dealers d
union all
select d.id,'Finance companies','finance_companies' from public.dealers d;

insert into public.contact_group_members(dealer_id,group_id,customer_id)
select c.dealer_id,g.id,c.id from public.customers c
join public.contact_groups g on g.dealer_id=c.dealer_id and g.system_key='customers'
where c.deleted_at is null;

create function public.seed_contact_groups_for_dealer() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.contact_groups(dealer_id,name,system_key) values
    (new.id,'Customers','customers'),(new.id,'Finance companies','finance_companies');
  return new;
end $$;
create trigger seed_contact_groups_for_dealer after insert on public.dealers
  for each row execute function public.seed_contact_groups_for_dealer();

create function public.add_customer_to_contact_group() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.contact_group_members(dealer_id,group_id,customer_id,created_by)
  select new.dealer_id,g.id,new.id,auth.uid() from public.contact_groups g
  where g.dealer_id=new.dealer_id and g.system_key='customers';
  return new;
end $$;
create trigger add_customer_to_contact_group after insert on public.customers
  for each row execute function public.add_customer_to_contact_group();

create function public.sync_finance_preset_contact() returns trigger
language plpgsql security definer set search_path=public as $$
declare contact_id uuid; finance_group uuid;
begin
  select id into contact_id from public.customers
    where source_finance_preset_id=new.id;
  if contact_id is null then
    select id into contact_id from public.customers
      where dealer_id=new.dealer_id and type='business' and source_finance_preset_id is null
        and lower(trim(name))=lower(trim(new.name))
        and trim(coalesce(address_line1,''))=trim(new.invoice_address)
      order by created_at,id limit 1;
  end if;
  if contact_id is null then
    insert into public.customers(dealer_id,name,type,business_name,address_line1,source_finance_preset_id)
      values(new.dealer_id,new.name,'business',new.name,new.invoice_address,new.id)
      returning id into contact_id;
  else
    update public.customers set name=new.name,business_name=new.name,address_line1=new.invoice_address,
      source_finance_preset_id=new.id,deleted_at=null where id=contact_id;
  end if;
  select id into finance_group from public.contact_groups
    where dealer_id=new.dealer_id and system_key='finance_companies';
  if new.active then
    insert into public.contact_group_members(dealer_id,group_id,customer_id)
      values(new.dealer_id,finance_group,contact_id) on conflict do nothing;
  else
    delete from public.contact_group_members where group_id=finance_group and customer_id=contact_id;
  end if;
  return new;
end $$;
create trigger sync_finance_preset_contact after insert or update of name,invoice_address,active
  on public.dealer_finance_companies for each row execute function public.sync_finance_preset_contact();
revoke all on function public.seed_contact_groups_for_dealer() from public,anon,authenticated;
revoke all on function public.add_customer_to_contact_group() from public,anon,authenticated;
revoke all on function public.sync_finance_preset_contact() from public,anon,authenticated;

-- Import every existing preset, including inactive ones, without deleting source rows.
with matches as (
  select f.id as preset_id,(
    select c.id from public.customers c
    where c.dealer_id=f.dealer_id and c.type='business' and c.source_finance_preset_id is null
      and lower(trim(c.name))=lower(trim(f.name))
      and trim(coalesce(c.address_line1,''))=trim(f.invoice_address)
    order by c.created_at,c.id limit 1
  ) as contact_id from public.dealer_finance_companies f
)
update public.customers c set source_finance_preset_id=m.preset_id
from matches m where c.id=m.contact_id;
insert into public.customers(dealer_id,name,type,business_name,address_line1,source_finance_preset_id)
select f.dealer_id,f.name,'business',f.name,f.invoice_address,f.id
from public.dealer_finance_companies f
where not exists(select 1 from public.customers c where c.source_finance_preset_id=f.id);
insert into public.contact_group_members(dealer_id,group_id,customer_id)
select c.dealer_id,g.id,c.id from public.customers c
join public.dealer_finance_companies f on f.id=c.source_finance_preset_id and f.active
join public.contact_groups g on g.dealer_id=c.dealer_id and g.system_key='finance_companies'
on conflict do nothing;
