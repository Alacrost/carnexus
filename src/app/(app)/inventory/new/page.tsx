import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/types";
import { VehicleForm } from "./vehicle-form";

export default async function NewVehiclePage() {
  const session = await requireSession();

  if (!can.manageVehicles(session.role)) {
    return (
      <p className="text-sm text-slate-400">Your role cannot manage vehicles.</p>
    );
  }

  return (
    <div>
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeftIcon size={14} /> Inventory
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gradient">Add vehicle</h1>
      <p className="mt-1 text-sm text-slate-400">
        Enter the details manually, or paste a DoneDeal link to import later.
      </p>
      <VehicleForm />
    </div>
  );
}
