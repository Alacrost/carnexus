"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createVehicle, type CreateVehicleState } from "../actions";

const initial: CreateVehicleState = {};

export function VehicleForm() {
  const [state, action, pending] = useActionState(createVehicle, initial);

  return (
    <form action={action} className="mt-6 max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Make" name="make" required placeholder="Volkswagen" />
        <Field label="Model" name="model" required placeholder="Golf 1.6 TDI" />
        <Field label="Year" name="year" type="number" required placeholder="2020" />
        <Field label="Mileage (km)" name="km" type="number" required placeholder="85000" />
        <label className="text-sm">
          <span className="text-slate-300">Fuel</span>
          <select
            name="fuel"
            defaultValue="diesel"
            className="mt-1 studio-input"
          >
            <option value="petrol">Petrol</option>
            <option value="diesel">Diesel</option>
            <option value="hybrid">Hybrid</option>
            <option value="electric">Electric</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-300">Transmission</span>
          <select
            name="transmission"
            defaultValue="manual"
            className="mt-1 studio-input"
          >
            <option value="manual">Manual</option>
            <option value="automatic">Automatic</option>
          </select>
        </label>
        <Field label="Sale price (€)" name="sale_price" type="number" placeholder="18950" />
      </div>

      <Field
        label="Registration (plate)"
        name="registration"
        required
        placeholder="201-D-12345"
        hint="Required — used to cross-reference your stock with DoneDeal."
      />

      <Field
        label="DoneDeal listing URL (optional)"
        name="source_url"
        type="url"
        placeholder="https://www.donedeal.ie/cars-for-sale/..."
        hint="Saved for the DoneDeal import that connects later."
      />

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save vehicle"}
        </button>
        <Link href="/inventory" className="text-sm text-slate-400 hover:text-white">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="text-sm">
      <span className="text-slate-300">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 studio-input"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
