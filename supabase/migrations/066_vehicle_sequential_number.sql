-- Dealer-scoped sequential vehicle number. UUID remains the relational primary key.
alter table public.vehicles add column if not exists vehicle_no bigint;

with numbered as (
  select id, row_number() over (partition by dealer_id order by created_at, id) as seq
  from public.vehicles
  where vehicle_no is null
)
update public.vehicles vehicle
set vehicle_no = numbered.seq
from numbered
where vehicle.id = numbered.id;

insert into public.commercial_numbers(dealer_id, kind, next_no)
select dealer_id, 'vehicle', max(vehicle_no)
from public.vehicles
group by dealer_id
on conflict (dealer_id, kind) do update
set next_no = greatest(public.commercial_numbers.next_no, excluded.next_no);

create or replace function public.assign_vehicle_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare allocated bigint;
begin
  if new.vehicle_no is not null then return new; end if;
  insert into public.commercial_numbers(dealer_id, kind, next_no)
  values(new.dealer_id, 'vehicle', 1)
  on conflict (dealer_id, kind) do update
    set next_no = public.commercial_numbers.next_no + 1
  returning next_no into allocated;
  new.vehicle_no := allocated;
  return new;
end $$;

drop trigger if exists vehicles_assign_number on public.vehicles;
create trigger vehicles_assign_number
before insert on public.vehicles
for each row execute function public.assign_vehicle_number();

alter table public.vehicles alter column vehicle_no set not null;
alter table public.vehicles add constraint vehicles_vehicle_no_positive check (vehicle_no > 0);
create unique index if not exists vehicles_dealer_vehicle_no_key on public.vehicles(dealer_id, vehicle_no);

revoke all on function public.assign_vehicle_number() from public, anon, authenticated;
