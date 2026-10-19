"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/types";

const role = z.enum(["owner", "admin", "sales", "agency", "accountant"]);
const memberRole = z.enum(["admin", "sales", "agency", "accountant"]);
export type TeamActionState = { error?: string; saved?: boolean; invitePath?: string };

function message(error: { message: string } | null, fallback: string) {
  if (!error) return undefined;
  if (error.message.includes("pending invitation")) return "There is already an active invitation for this email.";
  if (error.message.includes("membership already")) return "This person is already a team member.";
  if (error.message.includes("owner_protected")) return "Owner access is protected and cannot be changed here.";
  if (error.message.includes("self_management")) return "You cannot suspend or change your own membership.";
  return fallback;
}

export async function inviteMember(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const session = await requireSession();
  if (!can.manageMembers(session.role)) return { error: "Only owners and admins can invite team members." };
  if (isDemoMode()) return { error: "Preview only — no invitation was created." };
  const parsed = z.object({ email: z.string().trim().email().max(254), role }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and role." };
  if (session.role === "admin" && parsed.data.role === "owner") return { error: "Admins cannot invite owners." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation", { p_dealer_id: session.dealer.id, p_email: parsed.data.email, p_role: parsed.data.role });
  const friendly = message(error, "The invitation could not be created.");
  if (friendly || !data) return { error: friendly ?? "The invitation could not be created." };
  revalidatePath("/settings/team");
  return { saved: true, invitePath: `/invite/${data}` };
}

export async function manageInvitation(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const session = await requireSession();
  if (!can.manageMembers(session.role)) return { error: "Not allowed." };
  if (isDemoMode()) return { error: "Preview only — nothing was changed." };
  const parsed = z.object({ id: z.string().uuid(), command: z.enum(["revoke_invitation", "resend_invitation"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid invitation action." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_command", { p_dealer: session.dealer.id, p_command: parsed.data.command, p_target: parsed.data.id, p_input: {} });
  const friendly = message(error, "The invitation could not be updated.");
  if (friendly) return { error: friendly };
  revalidatePath("/settings/team");
  const result = data as { token?: string } | null;
  return { saved: true, invitePath: result?.token ? `/invite/${result.token}` : undefined };
}

export async function updateMember(_previous: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const session = await requireSession();
  if (!can.manageMembers(session.role)) return { error: "Not allowed." };
  if (isDemoMode()) return { error: "Preview only — nothing was changed." };
  const parsed = z.object({ id: z.string().uuid(), operation: z.enum(["role", "status"]), role: memberRole.optional(), status: z.enum(["active", "suspended"]).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || (parsed.data.operation === "role" ? !parsed.data.role : !parsed.data.status)) return { error: "Invalid team change." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_command", {
    p_dealer: session.dealer.id,
    p_command: parsed.data.operation === "role" ? "set_member_role" : "set_member_status",
    p_target: parsed.data.id,
    p_input: parsed.data.operation === "role" ? { role: parsed.data.role } : { status: parsed.data.status },
  });
  const friendly = message(error, "The member could not be updated.");
  if (friendly) return { error: friendly };
  revalidatePath("/settings/team");
  revalidatePath("/leads/team");
  return { saved: true };
}
