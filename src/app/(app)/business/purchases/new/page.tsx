import { requireSession } from "@/lib/auth";
import { commercialPermission } from "@/lib/commercial-server";
import { hasModule } from "@/lib/types";
import { ModuleUpsell } from "@/components/module-upsell";
import { PurchaseForm } from "./purchase-form";

export default async function NewPurchasePage() {
  const session = await requireSession();
  if (!hasModule(session.dealer.modules, "sales")) return <ModuleUpsell product="Sales CRM" />;
  if (!(await commercialPermission("purchase"))) {
    return <p className="text-sm text-slate-400">Your role does not include purchases.</p>;
  }
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">Finance</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gradient">New purchase</h1>
      <p className="mt-1 text-sm text-slate-400">Buy a vehicle from a vendor — creates the PO and adds the car to stock.</p>
      <div className="mt-6">
        <PurchaseForm />
      </div>
    </div>
  );
}
