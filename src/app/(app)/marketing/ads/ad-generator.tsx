"use client";

import { useActionState } from "react";
import { generateAd, type GenerateAdState } from "../actions";

const channelLabels: Record<string, string> = {
  donedeal: "DoneDeal",
  facebook: "Facebook",
  instagram_feed: "Instagram Post",
  instagram_story: "Instagram Story",
  google: "Google Ad",
  website: "Website",
};

interface VehicleOption {
  id: string;
  label: string;
}

interface ScriptOption {
  id: string;
  name: string;
}

interface PromoOption {
  id: string;
  title: string;
}

export function AdGenerator({
  vehicles,
  scripts,
  promotions,
}: {
  vehicles: VehicleOption[];
  scripts: ScriptOption[];
  promotions: PromoOption[];
}) {
  const [state, formAction, pending] = useActionState<GenerateAdState, FormData>(
    generateAd,
    {}
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        action={formAction}
        className="studio-surface p-6"
      >
        <h2 className="font-medium text-slate-100">Generate ad copy</h2>

        <label htmlFor="vehicleId" className="mt-4 block text-sm text-slate-300">
          Vehicle
        </label>
        <select
          id="vehicleId"
          name="vehicleId"
          required
          className="mt-1 studio-input"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>

        <label htmlFor="channel" className="mt-4 block text-sm text-slate-300">
          Channel
        </label>
        <select
          id="channel"
          name="channel"
          required
          className="mt-1 studio-input"
        >
          {Object.entries(channelLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label htmlFor="scriptId" className="mt-4 block text-sm text-slate-300">
          Script <span className="text-slate-500">(optional)</span>
        </label>
        <select
          id="scriptId"
          name="scriptId"
          defaultValue=""
          className="mt-1 studio-input"
        >
          <option value="">AI decides the layout</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {promotions.length > 0 && (
          <>
            <label htmlFor="promotionId" className="mt-4 block text-sm text-slate-300">
              Promotion <span className="text-slate-500">(optional)</span>
            </label>
            <select
              id="promotionId"
              name="promotionId"
              defaultValue=""
              className="mt-1 studio-input"
            >
              <option value="">None</option>
              {promotions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          type="submit"
          disabled={pending || vehicles.length === 0}
          className="mt-5 w-full rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Generating..." : "Generate"}
        </button>

        {state.error && (
          <p className="mt-3 rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
            {state.error}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Your standard blocks (warranty, finance, hours) are appended
          automatically. The AI never invents features or condition claims.
        </p>
      </form>

      <div className="studio-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-100">Result</h2>
          {state.result && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-sky-300">
              {channelLabels[state.result.channel]} ·{" "}
              {state.result.generator === "openai" ? "AI" : "template engine"}
            </span>
          )}
        </div>

        {state.result ? (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Title</p>
              <p className="mt-1 font-medium text-white">{state.result.title}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Description
              </p>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-sans text-slate-200">
                {state.result.body}
              </pre>
            </div>
            {state.result.hashtags && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Hashtags
                </p>
                <p className="mt-1 text-sky-300">{state.result.hashtags}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Pick a vehicle and a channel, then hit Generate. Copy is formatted
            for each platform — ready to paste.
          </p>
        )}
      </div>
    </div>
  );
}
