import { LogoutIcon } from "@/components/icons";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";
import { can, hasModule } from "@/lib/types";
import { isDemoMode } from "@/lib/demo";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { commercialPermission } from "@/lib/commercial-server";
import { CrmShell, SideNav } from "./side-nav";
import { createClient } from "@/lib/supabase/server";
import { getPendingActions } from "@/lib/pending-actions";
import Link from "next/link";
import "../crm-retro.css";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  // Service Agreement gate: require accepting the current Terms before using the app.
  if (!isDemoMode() && session.dealer.terms_version !== CURRENT_TERMS_VERSION) {
    redirect("/agreement");
  }
  const sales = hasModule(session.dealer.modules, "sales");
  const marketing = hasModule(session.dealer.modules, "marketing");
  const website = hasModule(session.dealer.modules, "website");
  const [canPurchase, unreadMessages] = await Promise.all([
    commercialPermission("purchase"),
    isDemoMode() ? Promise.resolve(0) : createClient().then(async (db) => {
      const { data } = await db.rpc("message_unread_count", { p_dealer: session.dealer.id });
      return Number(data ?? 0);
    }),
  ]);
  const pending=sales?await getPendingActions(session.dealer.id,canPurchase,can.manageVehicles(session.role)):{items:[],error:false};
  const pendingCount=pending.error?null:pending.items.length;

  return (
    <CrmShell>
      <a href="#crm-main" className="crm-skip-link">Skip to page content</a>
      <aside className="crm-sidebar sticky top-0 z-20 hidden h-screen w-[276px] shrink-0 flex-col border-r border-black/[0.07] bg-[#f7f7f5]/95 shadow-[8px_0_30px_-28px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:flex">
        <div className="border-b border-black/[0.06] px-5 pb-4 pt-5">
          <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-[5px] bg-[#1b1b1a] text-[11px] font-semibold tracking-tight text-[#f8f8f6]">AN</span><span className="text-[17px] font-semibold tracking-[-0.025em] text-[#1b1b1a]">Autonexus</span></div>
          <p className="mt-4 truncate text-sm font-medium text-slate-200">
            {session.dealer.name}
          </p>
          <span className="mt-1 inline-block rounded-full border border-black/[0.08] bg-black/[0.035] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {session.role}
          </span>
        </div>

        <SideNav
          canBusiness={can.viewFinancials(session.role)}
          canPurchase={canPurchase}
          canDeals={can.manageDeals(session.role)}
          sales={sales}
          marketing={marketing}
          website={website}
          unreadMessages={unreadMessages}
          pendingCount={pendingCount}
        />

        <form action={logout} className="border-t border-black/[0.06] p-3">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors duration-150 hover:bg-black/[0.04] hover:text-slate-100"
          >
            <LogoutIcon size={17} />
            Log out
          </button>
        </form>
      </aside>

      <div className="crm-mobile-menu sticky top-0 z-30 border-b border-black/[0.07] bg-[#f7f7f5]/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-[5px] bg-[#1b1b1a] text-[11px] font-semibold text-[#f8f8f6]">AN</span><div><p className="text-sm font-semibold text-[#1b1b1a]">Autonexus</p><p className="text-[10px] text-slate-500">{session.dealer.name}</p></div></div><span className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-slate-300">Menu</span></summary>
          <div className="mt-3 max-h-[72vh] overflow-y-auto rounded-2xl border border-black/[0.08] bg-white p-1 shadow-xl">
            <SideNav
              canBusiness={can.viewFinancials(session.role)}
              canPurchase={canPurchase}
              canDeals={can.manageDeals(session.role)}
              sales={sales}
              marketing={marketing}
              website={website}
              unreadMessages={unreadMessages}
              pendingCount={pendingCount}
            />
            <form action={logout} className="border-t border-black/[0.06] p-3"><button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-black/[0.04]"><LogoutIcon size={17}/>Log out</button></form>
          </div>
        </details>
      </div>

      <main id="crm-main" tabIndex={-1} className="crm-main min-w-0 flex-1 p-5 lg:p-8 xl:p-10">
        <div className="mx-auto w-full max-w-[1600px] animate-rise">
          {sales&&<div className="mb-5 flex justify-end"><Link href="/pending" className={`inline-flex items-center gap-2 border px-3.5 py-2 text-xs font-bold tabular-nums transition-colors ${pendingCount===null||pendingCount>0?"border-[#bc912c] bg-[#ffe9a4] text-[#5b420b] hover:bg-[#ffdf78]":"border-[#bfc0b9] bg-[#f5f5f2] text-[#30302e] hover:bg-white"}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${pendingCount===null||pendingCount>0?"bg-[#b16e05]":"bg-[#638566]"}`}/>{pendingCount===null?"Pending status unavailable":`${pendingCount} pending`}<span aria-hidden="true">→</span></Link></div>}
          {children}
        </div>
      </main>
    </CrmShell>
  );
}
