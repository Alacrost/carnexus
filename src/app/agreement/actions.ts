"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { can } from "@/lib/types";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

// Record acceptance of the current Terms of Service (owner acts for the dealership).
export async function acceptTerms(): Promise<void> {
  const session = await requireSession();
  if (isDemoMode()) redirect("/dashboard");
  if (!can.manageBilling(session.role)) return; // only the owner can accept
  const supabase = await createClient();
  await supabase
    .from("dealers")
    .update({ terms_accepted_at: new Date().toISOString(), terms_version: CURRENT_TERMS_VERSION, terms_accepted_by: session.userId })
    .eq("id", session.dealer.id);
  redirect("/dashboard");
}
