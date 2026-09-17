import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoSession } from "@/lib/demo";
import type { Dealer, MemberRole } from "@/lib/types";

export interface SessionContext {
  userId: string;
  email: string;
  dealer: Dealer;
  role: MemberRole;
}

/**
 * Loads the authenticated user + their dealer membership.
 * Redirects to /login when unauthenticated and to /onboarding when the
 * user has no dealer yet. RLS guarantees only own memberships are visible.
 */
export async function requireSession(): Promise<SessionContext> {
  if (isDemoMode()) return demoSession;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("dealer_members")
    .select("role, status, dealers(id, name, slug, plan, created_at, modules, terms_accepted_at, terms_version)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership || !membership.dealers) redirect("/onboarding");

  return {
    userId: user.id,
    email: user.email ?? "",
    dealer: membership.dealers as unknown as Dealer,
    role: membership.role as MemberRole,
  };
}
