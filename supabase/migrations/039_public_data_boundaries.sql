-- Explicit Data API boundaries: RLS decides rows, grants decide public columns.
create function public.website_is_published(p_dealer_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.website_settings w join public.dealers d on d.id=w.dealer_id
    where w.dealer_id=p_dealer_id and w.enabled and d.modules->>'website'='true');
$$;
revoke all on function public.website_is_published(uuid) from public;
grant execute on function public.website_is_published(uuid) to anon,authenticated;
drop policy "website settings public" on public.website_settings;
create policy "website settings public" on public.website_settings for select
  using (public.website_is_published(dealer_id));
drop policy "vehicles public via website" on public.vehicles;
create policy "vehicles public via website" on public.vehicles for select
  using (stock_class='main' and status in ('ready_for_sale','reserved') and public.website_is_published(dealer_id));
revoke select on public.website_settings from anon;
grant select(dealer_id,enabled,headline,subheadline,about,phone,whatsapp,email,theme_color,last_synced_at)
  on public.website_settings to anon;
grant select,insert,update on public.website_settings to authenticated;
-- Keep legacy buy_price private; the financial module uses protected vehicle_deals.
revoke select on public.vehicles from anon, authenticated;
grant select(id,dealer_id,make,model,year,km,fuel,transmission,sale_price,status,nct_expiry,
  warranty_months,description,created_by,created_at,updated_at,source_url,registration,
  donedeal_ad_id,last_synced_at,stock_class) on public.vehicles to authenticated;
grant select(id,dealer_id,make,model,year,km,fuel,transmission,sale_price,status,
  nct_expiry,warranty_months,description,created_at,registration,stock_class) on public.vehicles to anon;

-- Public queries need only the dealer's trading identity. Private operational fields
-- are readable by signed-in users only through their own tenant policy.
drop policy "dealers public via website" on public.dealers;
drop policy "dealers public via active promo" on public.dealers;
create function public.public_dealer(p_slug text default null,p_id uuid default null)
returns table(id uuid,name text,slug text)
language sql stable security definer set search_path=public as $$
  select d.id,d.name,d.slug from public.dealers d
  where ((p_slug is not null and d.slug=p_slug) or (p_id is not null and d.id=p_id))
    and (public.website_is_published(d.id)
      or exists(select 1 from public.promotions p where p.dealer_id=d.id and p.status='active'));
$$;
revoke all on function public.public_dealer(text,uuid) from public;
grant execute on function public.public_dealer(text,uuid) to anon,authenticated;
revoke select on public.dealers from anon;
grant select on public.dealers,public.dealer_members,public.customers,public.profiles to authenticated;

-- Product provisioning and credits are platform-owned, not customer preferences.
revoke update on public.dealers from anon,authenticated;
grant update(name,currency,terms_accepted_at,terms_version,terms_accepted_by) on public.dealers to authenticated;

-- Ciphertext is still sensitive operational material; only integration managers need it.
drop policy "integrations read" on public.dealer_integrations;
create policy "integration managers read" on public.dealer_integrations for select
  using (public.user_role_in(dealer_id) in ('owner','admin'));
