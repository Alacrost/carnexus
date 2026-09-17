"use client";

import { useActionState } from "react";
import { signup, type AuthState } from "../actions";

const inputCls = "studio-input";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signup,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-xl font-semibold text-white">
        Create your dealership account
      </h1>
      <p className="text-sm text-slate-400">
        14-day free trial. No card required.
      </p>

      {state.error && (
        <p className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="fullName" className="mb-1 block text-sm text-slate-300">
          Your name
        </label>
        <input id="fullName" name="fullName" required className={inputCls} />
      </div>

      <div>
        <label htmlFor="dealerName" className="mb-1 block text-sm text-slate-300">
          Dealership name
        </label>
        <input
          id="dealerName"
          name="dealerName"
          required
          placeholder="e.g. Murphy Motors"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-slate-300">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
          Password (8+ characters)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{" "}
        <a href="/login" className="text-sky-400 hover:underline">
          Log in
        </a>
      </p>
    </form>
  );
}
