"use client";

import { useMemo, useState, useTransition } from "react";
import { StudioShell, StudioProperties } from "@/components/studio-shell";
import {
  WriteIcon,
  ScriptIcon,
  LayersIcon,
  InventoryIcon,
  SparkIcon,
} from "@/components/icons";
import { CAR_TYPES, angleSuggestions, carTypeLabel } from "@/lib/car-types";
import { draftDoneDealListing, saveDoneDealListing } from "./actions";

export interface DdVehicle {
  id: string;
  label: string;
}
export interface DdScript {
  id: string;
  name: string;
  body: string;
  vehicle_type: string | null;
}
export interface DdBlock {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
}

const tools = [
  { key: "setup", label: "Setup", icon: InventoryIcon },
  { key: "blocks", label: "Blocks", icon: LayersIcon },
  { key: "templates", label: "Templates", icon: ScriptIcon },
];

export function DoneDealStudio({
  vehicles,
  scripts,
  blocks,
}: {
  vehicles: DdVehicle[];
  scripts: DdScript[];
  blocks: DdBlock[];
}) {
  const [activeTool, setActiveTool] = useState("setup");
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [carType, setCarType] = useState("suv");
  const [emphasis, setEmphasis] = useState("");
  const [scriptId, setScriptId] = useState("");
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(
    () => new Set(blocks.filter((b) => b.is_default).map((b) => b.id))
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [generator, setGenerator] = useState<"openai" | "mock" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();

  const angles = useMemo(() => angleSuggestions(carType), [carType]);
  const matchingScripts = useMemo(() => {
    const m = scripts.filter((s) => !s.vehicle_type || s.vehicle_type === carType);
    return m.length ? m : scripts;
  }, [scripts, carType]);

  function generate() {
    setError("");
    setSaved(false);
    startGenerate(async () => {
      const chosen = blocks.filter((b) => selectedBlocks.has(b.id)).map((b) => b.body);
      const scriptBody = scripts.find((s) => s.id === scriptId)?.body;
      const res = await draftDoneDealListing({
        vehicleId,
        carType,
        emphasis: emphasis || undefined,
        scriptBody,
        blocks: chosen,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setTitle(res.title);
      setBody(res.body);
      setGenerator(res.generator);
    });
  }

  function save() {
    setError("");
    setSaved(false);
    startSave(async () => {
      const res = await saveDoneDealListing({ vehicleId, title, body });
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  function copy() {
    navigator.clipboard?.writeText(`${title}\n\n${body}`.trim());
  }

  function toggleBlock(id: string) {
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectCls = "mt-1 studio-input";

  const properties =
    activeTool === "blocks" ? (
      <div className="space-y-3 text-sm">
        <p className="text-slate-400">
          Standard blocks appended to every listing. Toggle what applies to this car.
        </p>
        {blocks.length === 0 && (
          <p className="text-xs text-slate-500">
            No standard blocks yet — add them in Brand Kit → Description blocks.
          </p>
        )}
        {blocks.map((b) => (
          <label
            key={b.id}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5"
          >
            <input
              type="checkbox"
              checked={selectedBlocks.has(b.id)}
              onChange={() => toggleBlock(b.id)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-slate-200">{b.name}</span>
              <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">{b.body}</span>
            </span>
          </label>
        ))}
      </div>
    ) : activeTool === "templates" ? (
      <div className="space-y-3 text-sm">
        <p className="text-slate-400">
          Your saved DoneDeal templates, tagged by car type. Pick one in Setup.
        </p>
        {scripts.length === 0 && (
          <p className="text-xs text-slate-500">No templates yet.</p>
        )}
        {scripts.map((s) => (
          <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
            <span className="block text-slate-200">{s.name}</span>
            <span className="mt-0.5 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
              {carTypeLabel(s.vehicle_type)}
            </span>
          </div>
        ))}
        <a
          href="/marketing/scripts"
          className="inline-block text-xs text-sky-400 hover:text-sky-300"
        >
          Manage templates →
        </a>
      </div>
    ) : (
      // Setup
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="text-slate-300">Vehicle</span>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className={selectCls}
          >
            {vehicles.length === 0 && <option value="">No vehicles in stock</option>}
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate-300">Car type</span>
          <select
            value={carType}
            onChange={(e) => {
              setCarType(e.target.value);
              setEmphasis("");
            }}
            className={selectCls}
          >
            {CAR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-slate-300">Suggested angle</span>
          <p className="text-xs text-slate-500">Pick an emphasis — the AI leans into it.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {angles.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setEmphasis((cur) => (cur === a ? "" : a))}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  emphasis === a
                    ? "border-sky-400/50 bg-sky-500/15 text-sky-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-slate-300">
            Template <span className="text-slate-500">(optional)</span>
          </span>
          <select
            value={scriptId}
            onChange={(e) => setScriptId(e.target.value)}
            className={selectCls}
          >
            <option value="">AI decides the layout</option>
            {matchingScripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={generate}
          disabled={generating || !vehicleId}
          className="btn-gradient w-full disabled:opacity-50"
        >
          {generating ? "Drafting…" : body ? "Regenerate listing" : "Generate listing"}
        </button>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    );

  return (
    <StudioShell
      title="DoneDeal Description Studio"
      subtitle="Standard DoneDeal listings by car type — set up on the right, then generate & edit."
      backHref="/marketing"
      icon={WriteIcon}
      tools={tools}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      rightActions={
        <>
          {generator && body && (
            <span className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 sm:inline-flex">
              <SparkIcon size={13} />
              {generator === "openai" ? "Drafted by AI" : "Template engine"}
            </span>
          )}
          <button
            type="button"
            onClick={copy}
            disabled={!body}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!body || saving}
            className="btn-gradient disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save draft"}
          </button>
        </>
      }
    >
      {/* Workspace: the editable DoneDeal listing */}
      <div className="min-w-0 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.05),transparent_60%)] p-4 lg:p-8">
        {body ? (
          <div className="mx-auto max-w-3xl">
            <label className="text-xs uppercase tracking-wider text-slate-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="studio-input mt-1 text-lg font-semibold"
            />
            <label className="mt-4 block text-xs uppercase tracking-wider text-slate-500">
              Listing
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              className="studio-input mt-1 leading-relaxed"
            />
            {saved && (
              <p className="mt-3 text-sm text-emerald-400">
                Saved as a draft and set as the car&apos;s description.
              </p>
            )}
          </div>
        ) : (
          <div className="grid h-full min-h-[50vh] place-items-center text-center">
            <div className="max-w-sm">
              <span className="studio-tile mx-auto grid h-14 w-14 place-items-center rounded-xl text-sky-300">
                <WriteIcon size={26} />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-100">
                Draft a DoneDeal listing
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Pick the car and its type on the right, choose an angle, then generate.
                Everything stays editable before you save.
              </p>
            </div>
          </div>
        )}
      </div>

      <StudioProperties>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            {tools.find((t) => t.key === activeTool)?.label}
          </h2>
        </div>
        {properties}
      </StudioProperties>
    </StudioShell>
  );
}
