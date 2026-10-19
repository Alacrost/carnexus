-- Fresh Supabase projects do not necessarily inherit Data API grants. Keep the
-- existing RLS and RPC boundaries; grant only operations used by the application.
-- In particular, do not restore direct financial/stock lifecycle writes removed
-- by migrations 040, 048, 050 and 051, or expose vehicle purchase costs.
grant usage on schema public to anon, authenticated;
grant insert on public.customers to authenticated;
grant select, insert, delete on public.vehicle_photos to authenticated;
grant update(is_cover) on public.vehicle_photos to authenticated;
grant update(description) on public.vehicles to authenticated;

-- Existing settings and studio forms. Row policies still determine the tenant
-- and whether owner/admin/agency may perform each operation.
grant select, insert, update on public.brand_kits, public.business_profiles,
  public.dealer_integrations, public.promotions to authenticated;
grant select, insert, delete on public.ad_scripts, public.description_templates,
  public.campaign_templates, public.background_templates to authenticated;
grant select, insert, update, delete on public.overlay_patterns,
  public.scheduled_content to authenticated;
grant insert on public.generated_descriptions, public.campaigns to authenticated;

-- The public promotion page selects only this published-page projection. Its
-- existing status='active' policy continues to hide drafts and ended offers.
grant select(id, title, brief, starts_on, ends_on, offer_details, included,
  excluded, terms, status, dealer_id, approved_by, approved_role, approved_at)
  on public.promotions to anon;

-- Core RLS helpers are needed even when functions have no default PUBLIC
-- EXECUTE grant. Onboarding remains authenticated and checks auth.uid().
grant execute on function public.user_dealer_ids(), public.user_role_in(uuid)
  to anon, authenticated;
revoke execute on function public.create_dealer_with_owner(text,text) from public, anon;
grant execute on function public.create_dealer_with_owner(text,text) to authenticated;

-- Supabase may already install pgcrypto in extensions; the local adapter uses
-- public. Resolve the installed trusted namespace without relocating extension
-- objects, replacing function bodies, or changing invitation permissions.
do $$
declare crypto_schema text; target regprocedure;
begin
  select n.nspname into crypto_schema from pg_extension e
    join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if crypto_schema is null or crypto_schema not in ('public','extensions') then
    raise exception 'unsupported_pgcrypto_schema';
  end if;
  if has_schema_privilege('anon',crypto_schema,'CREATE')
    or has_schema_privilege('authenticated',crypto_schema,'CREATE')
    or has_schema_privilege('anon','public','CREATE')
    or has_schema_privilege('authenticated','public','CREATE') then
    raise exception 'untrusted_invitation_search_path';
  end if;
  foreach target in array array[
    'public.create_invitation(uuid,text,public.member_role)'::regprocedure,
    'public.accept_invitation(text)'::regprocedure,
    'public.team_command(uuid,text,uuid,jsonb)'::regprocedure
  ] loop
    execute format('alter function %s set search_path = pg_catalog, %I, public, pg_temp', target, crypto_schema);
  end loop;
end $$;
