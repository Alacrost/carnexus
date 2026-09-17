"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthState } from "../actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const message = searchParams.get("message");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    login,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Log in</h1>

      {message === "confirm-email" && (
        <p className="rounded-lg border border-sky-800 bg-sky-950 p-3 text-sm text-sky-300">
          Check your inbox to confirm your email, then log in.
        </p>
      )}
      {state.error && (
        <p className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <input type="hidden" name="next" value={next} />

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
          className="studio-input"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="studio-input"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Logging in..." : "Log in"}
      </button>

      <p className="text-center text-sm text-slate-400">
        No account?{" "}
        <a href="/signup" className="text-sky-400 hover:underline">
          Start your free trial
        </a>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
