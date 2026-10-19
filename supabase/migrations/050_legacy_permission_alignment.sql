-- Align legacy read models with the current permission predicates. Old per-vehicle
-- financial records remain readable for migration/reference but can no longer bypass
-- the transactional Deal/PO ledgers.

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='customers' loop
    execute format('drop policy %I on public.customers',p.policyname);
  end loop;
end $$;
create policy customer_read on public.customers for select using(public.commercial_allowed(dealer_id,'read'));
create policy customer_insert on public.customers for insert with check(public.commercial_allowed(dealer_id,'work'));
create policy customer_update on public.customers for update using(public.commercial_allowed(dealer_id,'work')) with check(public.commercial_allowed(dealer_id,'work'));
create policy customer_delete on public.customers for delete using(public.user_role_in(dealer_id) in ('owner','admin'));

do $$ declare t text;p record;begin
  foreach t in array array['vehicle_deals','vehicle_costs'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t);end loop;
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy legacy_financial_read on public.%I for select using(public.commercial_allowed(dealer_id,%L))',t,'cost');
  end loop;
end $$;
