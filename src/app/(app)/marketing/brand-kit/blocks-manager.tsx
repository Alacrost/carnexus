"use client";

import { useActionState, useState } from "react";
import {
  saveDescriptionBlock,
  deleteDescriptionBlock,
  type DescriptionBlockState,
} from "../actions";
import { starterBlocks } from "@/lib/starters";

const kindLabels: Record<string, string> = {
  warranty: "Warranty",
  finance: "Finance",
  hours: "Opening hours",
  trade_in: "Trade-in",
  custom: "Custom",
};

export interface DescriptionBlock {
  id: string;
  name: string;
  kind: string;
  body: string;
}

const inputCls = "mt-1 studio-input";

export function BlocksManager({
  blocks,
  demo,
}: {
  blocks: DescriptionBlock[];
  demo: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    DescriptionBlockState,
    FormData
  >(saveDescriptionBlock, {});
  const [name, setName] = useState("");
  const [kind, setKind] = useState("custom");
  const [body, setBody] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={formAction} className="studio-surface p-6">
        <h3 className="font-medium text-slate-100">New block</h3>
        <p className="mt-1 text-sm text-slate-400">
          Appended automatically to every generated ad.
        </p>

        <div className="mt-3">
          <p className="text-xs text-slate-500">
            Starters — click to fill the form, then tweak and save.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {starterBlocks.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setName(s.name);
                  setKind(s.kind);
                  setBody(s.body);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {state.saved && (
          <p className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-300">
            Block saved.
          </p>
        )}
        {state.error && (
          <p className="mt-3 rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
            {state.error}
          </p>
        )}

        <label htmlFor="block-name" className="mt-4 block text-sm text-slate-300">
          Name
        </label>
        <input
          id="block-name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Standard warranty"
          className={inputCls}
        />

        <label htmlFor="block-kind" className="mt-4 block text-sm text-slate-300">
          Kind
        </label>
        <select
          id="block-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={inputCls}
        >
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label htmlFor="block-body" className="mt-4 block text-sm text-slate-300">
          Body
        </label>
        <textarea
          id="block-body"
          name="body"
          required
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Every car is sold with a comprehensive warranty…"
          className={`${inputCls} text-sm`}
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save block"}
        </button>
      </form>

      <div className="space-y-3">
        <h3 className="font-medium">Saved blocks</h3>
        {blocks.length === 0 && (
          <p className="text-sm text-slate-500">No blocks yet.</p>
        )}
        {blocks.map((b) => (
          <div key={b.id} className="studio-surface p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs capitalize text-sky-300">
                {kindLabels[b.kind] ?? b.kind}
              </span>
              <h4 className="text-sm font-medium text-white">{b.name}</h4>
              {!demo && (
                <form action={deleteDescriptionBlock} className="ml-auto">
                  <input type="hidden" name="id" value={b.id} />
                  <button
                    type="submit"
                    className="text-xs text-slate-500 transition hover:text-red-400"
                  >
                    Delete
                  </button>
                </form>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{b.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
