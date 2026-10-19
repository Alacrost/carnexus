-- Preserve the actor behind later vehicle and purchase-order changes.
-- Historical updates cannot be attributed reliably, so existing rows remain NULL.
alter table public.vehicles
  add column if not exists updated_by uuid references auth.users(id);

alter table public.purchase_orders
  add column if not exists updated_by uuid references auth.users(id);

create or replace function public.record_vehicle_update_actor()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists vehicles_update_actor on public.vehicles;
create trigger vehicles_update_actor before update on public.vehicles
  for each row execute function public.record_vehicle_update_actor();

create or replace function public.record_purchase_order_update_actor()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists purchase_orders_update_actor on public.purchase_orders;
create trigger purchase_orders_update_actor before update on public.purchase_orders
  for each row execute function public.record_purchase_order_update_actor();
