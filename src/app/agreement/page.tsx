import { requireSession } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";
import { can } from "@/lib/types";
import { TERMS, CURRENT_TERMS_VERSION } from "@/lib/terms";
import { acceptTerms } from "./actions";

export default async function AgreementPage() {
  const session = await requireSession();
  const isOwner = can.manageBilling(session.role);

  return (
    <div className="min-h-screen bg-[var(--ink-900)] px-4 py-10 text-slate-200">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <span className="text-lg font-bold tracking-tight">Auto<span className="text-gradient">nexus</span></span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Service Agreement</h1>
          <p className="mt-1 text-sm text-slate-400">Please review and accept our Terms of Service to continue · v{CURRENT_TERMS_VERSION}</p>
        </div>

        <div className="mt-6 max-h-[55vh] space-y-5 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm leading-relaxed">
          {TERMS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-semibold text-slate-100">{s.heading}</h2>
              {s.body.map((p, i) => <p key={i} className="mt-1 text-slate-400">{p}</p>)}
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {isOwner ? (
            <form action={acceptTerms}>
              <button type="submit" className="btn-gradient px-6 py-2.5 text-sm">I Agree</button>
            </form>
          ) : (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-sm text-amber-200">
              Your dealership owner must accept the Terms before the team can continue.
            </p>
          )}
          <form action={logout}>
            <button type="submit" className="rounded-xl border border-white/10 px-6 py-2.5 text-sm text-slate-400 hover:text-white">I Don&apos;t Agree</button>
          </form>
        </div>
      </div>
    </div>
  );
}
