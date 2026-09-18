import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoPurchases } from "@/lib/demo";
import { commercialPermission } from "@/lib/commercial-server";
import { hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { PurchasesList, type PurchaseRow } from "./purchases-list";

export default async function PurchasesPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!(await commercialPermission("purchase"))) {
    return <p className="text-sm text-slate-400">Your role does not include purchases.</p>;
  }

  let rows: PurchaseRow[] = [];

  if (isDemoMode()) {
    rows = demoPurchases.map((p) => {
      const total = p.lines.reduce((a, l) => a + l.gross, 0);
      const paid = p.payments.reduce((a, x) => a + x.amount, 0);
      return { id: p.id, po_no: p.po_no, vendor: p.vendor.name, car: p.car, status: p.status, total, paid, outstanding: total - paid };
    });
  } else {
    const supabase = await createClient();
    const {data,error}=await supabase.rpc("purchase_balances",{p_dealer:session.dealer.id});
    if(error)return <p role="alert">Purchase balances could not load. Check the connection and commercial migrations.</p>;
    rows=(data??[]) as PurchaseRow[];
  }

  return <PurchasesList rows={rows} />;
}
