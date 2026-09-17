import Link from "next/link";

// Shown when a dealer opens a product that isn't on their plan (products are sold separately).
export function ModuleUpsell({ product }: { product: string }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <h1 className="text-xl font-semibold text-slate-100">{product} isn&apos;t on your plan</h1>
      <p className="mt-2 text-sm text-slate-400">
        This product is sold separately from the rest of Autonexus. Ask your admin to enable it in Billing.
      </p>
      <Link href="/settings" className="btn-gradient mt-4 inline-block text-sm">Go to Settings</Link>
    </div>
  );
}
