import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoPurchases } from "@/lib/demo";
import { can, hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { PurchasesList, type PurchaseRow } from "./purchases-list";

export default async function PurchasesPage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!can.viewFinancials(session.role)) {
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
    const [{ data: pos }, { data: lines }, { data: pays }, { data: vendors }, { data: vehicles }] = await Promise.all([
      supabase.from("purchase_orders").select("id, po_no, status, vendor_id, vehicle_id").eq("dealer_id", session.dealer.id).order("created_at", { ascending: false }),
      supabase.from("po_lines").select("po_id, gross").eq("dealer_id", session.dealer.id),
      supabase.from("po_payments").select("po_id, amount").eq("dealer_id", session.dealer.id),
      supabase.from("customers").select("id, name").eq("dealer_id", session.dealer.id),
      supabase.from("vehicles").select("id, make, model, year").eq("dealer_id", session.dealer.id),
    ]);
    const totalByPo = new Map<string, number>();
    for (const l of lines ?? []) totalByPo.set(l.po_id, (totalByPo.get(l.po_id) ?? 0) + Number(l.gross));
    const paidByPo = new Map<string, number>();
    for (const p of pays ?? []) paidByPo.set(p.po_id, (paidByPo.get(p.po_id) ?? 0) + Number(p.amount));
    const vName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
    const vLabel = new Map((vehicles ?? []).map((v) => [v.id, `${v.year} ${v.make} ${v.model}`]));
    rows = (pos ?? []).map((p) => {
      const total = totalByPo.get(p.id) ?? 0;
      const paid = paidByPo.get(p.id) ?? 0;
      return {
        id: p.id, po_no: p.po_no,
        vendor: p.vendor_id ? vName.get(p.vendor_id) ?? "—" : "—",
        car: p.vehicle_id ? vLabel.get(p.vehicle_id) ?? "—" : "—",
        status: p.status, total, paid, outstanding: total - paid,
      };
    });
  }

  return <PurchasesList rows={rows} />;
}
