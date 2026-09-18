import { LogoutIcon } from "@/components/icons";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";
import { can, hasModule } from "@/lib/types";
import { isDemoMode } from "@/lib/demo";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { commercialPermission } from "@/lib/commercial-server";
import { SideNav } from "./side-nav";

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

  return (
    <div className="flex min-h-screen text-slate-100">
      <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-white/5 bg-[var(--ink-800)]/70 backdrop-blur-xl">
        <div className="border-b border-white/5 p-5">
          <span className="text-lg font-bold tracking-tight">
            Auto<span className="text-gradient">nexus</span>
          </span>
          <p className="mt-3 truncate text-sm font-medium text-slate-200">
            {session.dealer.name}
          </p>
          <span className="mt-2 inline-block rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-xs capitalize text-sky-300">
            {session.role}
          </span>
        </div>

        <SideNav
          canBusiness={can.viewFinancials(session.role)}
          canPurchase={await commercialPermission("purchase")}
          canDeals={can.manageDeals(session.role)}
          sales={sales}
          marketing={marketing}
          website={website}
        />

        <form action={logout} className="border-t border-white/5 p-3">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors duration-150 hover:bg-white/[0.03] hover:text-white"
          >
            <LogoutIcon size={17} />
            Log out
          </button>
        </form>
      </aside>

      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <div className="mx-auto w-full max-w-[1600px] animate-rise">{children}</div>
      </main>
    </div>
  );
}
