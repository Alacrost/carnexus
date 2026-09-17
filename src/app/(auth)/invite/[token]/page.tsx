"use client";

import { useActionState, use } from "react";
import { acceptInvite, type AuthState } from "../../actions";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    acceptInvite,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Join a dealership</h1>
      <p className="text-sm text-slate-400">
        You&apos;ve been invited to join a dealership on Autonexus. Make sure
        you are logged in with the email that received this invitation, then
        accept below.
      </p>

      {state.error && (
        <p className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <input type="hidden" name="token" value={token} />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Joining..." : "Accept invitation"}
      </button>

      <p className="text-center text-sm text-slate-400">
        Need an account first?{" "}
        <a href="/signup" className="text-sky-400 hover:underline">
          Sign up
        </a>{" "}
        with the invited email, then open this link again.
      </p>
    </form>
  );
}
