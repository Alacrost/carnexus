"use client";

import { useActionState } from "react";
import { createDealer, type AuthState } from "../actions";

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    createDealer,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-xl font-semibold text-white">
        Set up your dealership
      </h1>
      <p className="text-sm text-slate-400">
        Your account isn&apos;t linked to a dealership yet. Create one now, or
        ask your manager for an invitation link.
      </p>

      {state.error && (
        <p className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="dealerName" className="mb-1 block text-sm text-slate-300">
          Dealership name
        </label>
        <input
          id="dealerName"
          name="dealerName"
          required
          placeholder="e.g. Murphy Motors"
          className="studio-input"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create dealership"}
      </button>
    </form>
  );
}
