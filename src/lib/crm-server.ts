import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { CRM_PERMISSIONS, type CrmPermission } from "@/lib/crm";

export async function crmContext() {
  const session = await requireSession();
  if (isDemoMode()) return { session, supabase: null, permissions: [...CRM_PERMISSIONS], error: null };
  const supabase = await createClient();
  const checks = await Promise.all(CRM_PERMISSIONS.map(async permission => {
    const { data, error } = await supabase.rpc("crm_allowed", { p_dealer_id: session.dealer.id, p_permission: permission });
    return { permission, allowed: data === true, error };
  }));
  return {
    session, supabase,
    permissions: checks.filter(x => x.allowed).map(x => x.permission) as CrmPermission[],
    error: checks.some(x => x.error) ? "CRM could not be loaded. Check the connection and apply the CRM migrations." : null,
  };
}
