import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/types";
import { TeamManager, type TeamInvitation, type TeamMember } from "./team-manager";

export default async function SettingsTeamPage() {
  const session = await requireSession();
  if (!can.manageMembers(session.role)) return <p className="text-sm text-slate-400">Only owners and admins can manage the team.</p>;
  let members: TeamMember[] = [];
  let invitations: TeamInvitation[] = [];
  let error: string | null = null;
  if (isDemoMode()) {
    members = [{ id: session.userId, name: "Preview owner", email: null, role: session.role, status: "active", crmRoleId: null }];
  } else {
    const supabase = await createClient();
    const result = await supabase.rpc("team_overview", { p_dealer: session.dealer.id });
    if (result.error || !result.data) error = "The team roster could not be loaded.";
    else {
      const data = result.data as unknown as { members: TeamMember[]; invitations: TeamInvitation[] };
      members = data.members;
      invitations = data.invitations.filter((invite) => invite.status !== "revoked");
    }
  }
  return <div className="space-y-6"><header><Link href="/settings" className="text-sm text-sky-300">← Settings</Link><p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Dealership access</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">Team</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Invite people, review access and suspend accounts while retaining the dealership audit trail.</p></header>{error ? <p role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : <TeamManager members={members} invitations={invitations} actorRole={session.role} currentUserId={session.userId} />}</div>;
}
