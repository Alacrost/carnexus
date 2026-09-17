"use client";

import { useActionState, useState } from "react";
import { saveAdScript, deleteAdScript, type AdScriptState } from "../actions";
import { starterScripts } from "@/lib/starters";
import { CAR_TYPES } from "@/lib/car-types";

const channelLabels: Record<string, string> = {
  "": "Any channel",
  donedeal: "DoneDeal",
  facebook: "Facebook",
  instagram_feed: "Instagram Post",
  instagram_story: "Instagram Story",
  google: "Google Ad",
  website: "Website",
};

const placeholders = [
  "{year}", "{make}", "{model}", "{price}", "{specs}",
  "{km}", "{fuel}", "{transmission}", "{nct}", "{warranty}", "{dealer}",
];

const inputCls =
  "mt-1 studio-input";

export interface Script {
  id: string;
  name: string;
  channel: string | null;
  body: string;
}

export function ScriptsManager({
  scripts,
  demo,
}: {
  scripts: Script[];
  demo: boolean;
}) {
  const [state, formAction, pending] = useActionState<AdScriptState, FormData>(
    saveAdScript,
    {}
  );
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("");
  const [carType, setCarType] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        action={formAction}
        className="studio-surface p-6"
      >
        <h2 className="font-medium text-slate-100">New script</h2>

        <div className="mt-3">
          <p className="text-xs text-slate-500">Starters — click to fill the form, then tweak and save.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {starterScripts.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setName(s.name);
                  setChannel(s.channel);
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
            Script saved.
          </p>
        )}
        {state.error && (
          <p className="mt-3 rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
            {state.error}
          </p>
        )}

        <label htmlFor="name" className="mt-4 block text-sm text-slate-300">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Generic — DoneDeal listing"
          className={inputCls}
        />

        <label htmlFor="channel" className="mt-4 block text-sm text-slate-300">
          Channel
        </label>
        <select
          id="channel"
          name="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className={inputCls}
        >
          {Object.entries(channelLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label htmlFor="vehicle_type" className="mt-4 block text-sm text-slate-300">
          Car type <span className="text-slate-500">(optional)</span>
        </label>
        <select
          id="vehicle_type"
          name="vehicle_type"
          value={carType}
          onChange={(e) => setCarType(e.target.value)}
          className={inputCls}
        >
          <option value="">Any type</option>
          {CAR_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label htmlFor="body" className="mt-4 block text-sm text-slate-300">
          Script body
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"{year} {make} {model} — {price}\n\nPresented in excellent condition at {dealer}.\n• {specs}\n• {warranty}"}
          className={`${inputCls} font-mono text-sm`}
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {placeholders.map((p) => (
            <span
              key={p}
              className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-300"
            >
              {p}
            </span>
          ))}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save script"}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          The AI follows this structure and fills the placeholders from the
          vehicle. Lines whose data is missing are dropped automatically.
        </p>
      </form>

      <div className="space-y-4">
        <h2 className="font-medium">Saved scripts</h2>
        {scripts.length === 0 && (
          <p className="text-sm text-slate-500">No scripts yet.</p>
        )}
        {scripts.map((s) => (
          <div
            key={s.id}
            className="studio-surface p-4"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-white">{s.name}</h3>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-sky-300">
                {channelLabels[s.channel ?? ""]}
              </span>
              {!demo && (
                <form action={deleteAdScript} className="ml-auto">
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="text-xs text-slate-500 transition hover:text-red-400"
                  >
                    Delete
                  </button>
                </form>
              )}
            </div>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-300">
              {s.body}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
