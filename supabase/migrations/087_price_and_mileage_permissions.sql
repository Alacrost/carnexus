-- Price authority is explicit and tenant-scoped; profile display names are not roles.
create function public.price_adjustment_allowed(p_dealer uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select d.modules->>'sales'='true' and m.role in ('owner','admin')
    from public.dealer_members m join public.dealers d on d.id=m.dealer_id
    where m.dealer_id=p_dealer and m.user_id=auth.uid() and m.status='active'),false);
$$;
revoke all on function public.price_adjustment_allowed(uuid) from public,anon;
grant execute on function public.price_adjustment_allowed(uuid) to authenticated;

-- All existing create/edit/quote/autosave price checks use this same predicate.
-- Preserve the existing read/work/payment/cost/purchase matrix.
create or replace function public.commercial_allowed(p_dealer_id uuid,p_permission text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select d.modules->>'sales'='true' and case
    when p_permission='price' then public.price_adjustment_allowed(p_dealer_id)
    when m.role in ('owner','admin') then true
    when m.role='accountant' then p_permission in ('read','work','payment','cost','purchase')
    when m.role='sales' and m.crm_role_id is null then p_permission in ('read','work','payment')
    when m.role='sales' then 'read'=any(r.permissions) and p_permission=any(r.permissions)
    else false end from dealer_members m join dealers d on d.id=m.dealer_id
    left join crm_roles r on r.id=m.crm_role_id and r.dealer_id=m.dealer_id
    where m.dealer_id=p_dealer_id and m.user_id=auth.uid() and m.status='active'),false);
$$;

-- Enforce changed fields at the actual writes, including security-definer RPCs.
-- Trusted jobs without an end-user JWT retain their existing database authority.
create function public.guard_price_mileage_fields()
returns trigger language plpgsql security definer set search_path=public as $$
declare restricted boolean:=false;
begin
  if auth.uid() is null then return new; end if;
  if TG_TABLE_NAME='vehicles' then
    if TG_OP='UPDATE' then restricted:=new.sale_price is distinct from old.sale_price or new.km is distinct from old.km;
    else restricted:=new.sale_price is not null or new.km is not null; end if;
  elsif TG_TABLE_NAME='vehicle_trade_prices' then
    if TG_OP='UPDATE' then restricted:=new.trade_price is distinct from old.trade_price;
    else restricted:=new.trade_price is not null; end if;
  elsif TG_TABLE_NAME='deals' then
    restricted:=new.retail_price is distinct from old.retail_price;
  elsif TG_TABLE_NAME='deal_orders' and new.kind='sale' then
    if TG_OP='UPDATE' then restricted:=new.price is distinct from old.price or new.discount is distinct from old.discount;
    else restricted:=coalesce(new.discount,0)<>0 or new.price is distinct from
      (select d.retail_price from public.deals d where d.id=new.deal_id and d.dealer_id=new.dealer_id); end if;
  end if;
  if restricted and not public.price_adjustment_allowed(new.dealer_id) then raise exception 'price_mileage_not_allowed'; end if;
  return new;
end $$;
revoke all on function public.guard_price_mileage_fields() from public,anon,authenticated;
create trigger guard_vehicle_price_mileage before insert or update of sale_price,km on public.vehicles
  for each row execute function public.guard_price_mileage_fields();
create trigger guard_vehicle_trade_price before insert or update of trade_price on public.vehicle_trade_prices
  for each row execute function public.guard_price_mileage_fields();
create trigger guard_deal_retail_price before update of retail_price on public.deals
  for each row execute function public.guard_price_mileage_fields();
create trigger guard_sale_order_price_discount before insert or update of price,discount,kind on public.deal_orders
  for each row execute function public.guard_price_mileage_fields();
