"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import {
  savePromotion,
  setPromotionStatus,
  approvePromotion,
  submitPromotion,
  unsubmitPromotion,
  draftPromoIdeas,
  draftPromoTerms,
  type PromotionState,
} from "../actions";
import type { PromoIdea } from "@/lib/ai/promo";
import { starterPromotions } from "@/lib/starters";

export interface PromotionRow {
  id: string;
  title: string;
  kind: string;
  brief: string | null;
  offer_details: string | null;
  included: string | null;
  excluded: string | null;
  starts_on: string | null;
  ends_on: string | null;
  terms: string | null;
  status: string;
  submitted_for_approval?: boolean;
  approved_by?: string | null;
  approved_role?: string | null;
  approved_at?: string | null;
}

const kinds: { value: string; label: string }[] = [
  { value: "seasonal", label: "Seasonal (summer, back-to-school…)" },
  { value: "holiday", label: "Holiday (Easter, Christmas…)" },
  { value: "sale", label: "Sale" },
  { value: "finance", label: "Finance offer" },
  { value: "event", label: "Showroom event" },
  { value: "other", label: "Other" },
];

const emptyForm: PromotionRow = {
  id: "",
  title: "",
  kind: "seasonal",
  brief: "",
  offer_details: "",
  included: "",
  excluded: "",
  starts_on: "",
  ends_on: "",
  terms: "",
  status: "draft",
};

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    draft: "border-white/10 bg-white/[0.04] text-slate-400",
    ended: "border-white/10 bg-white/[0.04] text-slate-500",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? map.draft}`}>
      {status}
    </span>
  );
}

export function PromotionsManager({
  promotions,
  canApprove,
}: {
  promotions: PromotionRow[];
  canApprove: boolean;
}) {
  const [form, setForm] = useState<PromotionRow>(emptyForm);
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<PromoIdea[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingIdeas, startIdeas] = useTransition();
  const [pendingTerms, startTerms] = useTransition();
  const [state, formAction, saving] = useActionState<PromotionState, FormData>(
    savePromotion,
    {}
  );

  // Close the popup once a save succeeds.
  useEffect(() => {
    if (state.saved) setOpen(false);
  }, [state.saved]);

  const active = promotions.filter((p) => p.status === "active");
  const awaiting = promotions.filter((p) => p.status === "draft" && p.submitted_for_approval);
  const drafts = promotions.filter((p) => p.status === "draft" && !p.submitted_for_approval);
  const expired = promotions.filter((p) => p.status === "ended");

  const set = (k: keyof PromotionRow, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function briefData() {
    const fd = new FormData();
    fd.set("kind", form.kind);
    fd.set("title", form.title);
    fd.set("brief", form.brief ?? "");
    fd.set("offer_details", form.offer_details ?? "");
    fd.set("starts_on", form.starts_on ?? "");
    fd.set("ends_on", form.ends_on ?? "");
    return fd;
  }

  function onIdeas() {
    setAiError(null);
    startIdeas(async () => {
      const res = await draftPromoIdeas({}, briefData());
      if (res.error) setAiError(res.error);
      else setIdeas(res.ideas ?? []);
    });
  }

  function onTerms() {
    setAiError(null);
    startTerms(async () => {
      const res = await draftPromoTerms({}, briefData());
      if (res.error) setAiError(res.error);
      else if (res.result) {
        setForm((f) => ({
          ...f,
          terms: res.result!.terms,
          included: res.result!.included,
          excluded: res.result!.excluded,
        }));
      }
    });
  }

  function edit(p: PromotionRow) {
    setForm({ ...emptyForm, ...p });
    setIdeas([]);
    setAiError(null);
    setOpen(true);
  }

  const inputCls = "mt-1 studio-input";

  return (
    <>
      {/* Big action to open the creation popup */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm);
            setIdeas([]);
            setAiError(null);
            setOpen(true);
          }}
          className="btn-gradient px-6 py-3 text-base"
        >
          + New promotion
        </button>
      </div>

      {/* Separated buckets */}
      <div className="mt-6 space-y-8">
        <Bucket title="Active" hint="Live on your public pages." items={active} empty="No active promotions." canApprove={canApprove} onEdit={edit} />
        <Bucket title="Awaiting approval" hint="Submitted — a manager signs the T&C to publish." items={awaiting} empty="Nothing waiting for approval." canApprove={canApprove} onEdit={edit} />
        <Bucket title="Drafts" hint="Work in progress — send for approval when ready." items={drafts} empty="No drafts." canApprove={canApprove} onEdit={edit} />
        <Bucket title="Expired" hint="Ended promotions." items={expired} empty="Nothing expired." canApprove={canApprove} onEdit={edit} />
      </div>

      {/* Creation / edit popup */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-4 h-fit w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f17] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium text-slate-100">
                {form.id ? "Edit promotion" : "New promotion"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form action={formAction} className="space-y-5">
              <input type="hidden" name="id" value={form.id} />
              <input type="hidden" name="status" value={form.status} />
              <input type="hidden" name="terms" value={form.terms ?? ""} />
              <input type="hidden" name="included" value={form.included ?? ""} />
              <input type="hidden" name="excluded" value={form.excluded ?? ""} />

        {state.saved && (
          <p className="rounded-xl border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-300">
            Promotion saved.
          </p>
        )}
        {(state.error || aiError) && (
          <p className="rounded-xl border border-red-800 bg-red-950 p-3 text-sm text-red-300">
            {state.error || aiError}
          </p>
        )}

        <div className="studio-surface p-6">
          <p className="text-sm text-slate-400">
            Describe the idea, let the AI draft angles and terms, then save as a draft.
          </p>

          <div className="mt-3">
            <p className="text-xs text-slate-500">Starters — click to fill the form, then tweak and save.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {starterPromotions.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => {
                    setForm({ ...emptyForm, ...s, status: "draft" });
                    setIdeas([]);
                    setAiError(null);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <label className="text-sm">
              <span className="text-slate-300">Title</span>
              <input
                name="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Christmas Drive-Away Event"
                required
                className={inputCls}
              />
            </label>

            <label className="text-sm">
              <span className="text-slate-300">Type</span>
              <select
                name="kind"
                value={form.kind}
                onChange={(e) => set("kind", e.target.value)}
                className={inputCls}
              >
                {kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-slate-300">Starts</span>
                <input
                  type="date"
                  name="starts_on"
                  value={form.starts_on ?? ""}
                  onChange={(e) => set("starts_on", e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-300">Ends</span>
                <input
                  type="date"
                  name="ends_on"
                  value={form.ends_on ?? ""}
                  onChange={(e) => set("ends_on", e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>

            <label className="text-sm">
              <span className="text-slate-300">Brief</span>
              <textarea
                name="brief"
                rows={2}
                value={form.brief ?? ""}
                onChange={(e) => set("brief", e.target.value)}
                placeholder="€500 off any car plus a free full tank for December"
                className={inputCls}
              />
            </label>

            <label className="text-sm">
              <span className="text-slate-300">Offer details</span>
              <textarea
                name="offer_details"
                rows={2}
                value={form.offer_details ?? ""}
                onChange={(e) => set("offer_details", e.target.value)}
                placeholder="€500 off the ticket price and a full tank of fuel on collection."
                className={inputCls}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onIdeas}
                disabled={pendingIdeas}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {pendingIdeas ? "Thinking…" : "Generate ideas"}
              </button>
              <button
                type="button"
                onClick={onTerms}
                disabled={pendingTerms}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {pendingTerms ? "Drafting…" : "Draft terms"}
              </button>
            </div>
          </div>
        </div>

        {ideas.length > 0 && (
          <div className="studio-surface p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Campaign angles
            </h3>
            <div className="mt-3 grid gap-3">
              {ideas.map((idea, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => set("title", idea.headline)}
                  className="studio-interactive rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left"
                >
                  <p className="font-medium text-slate-100">{idea.headline}</p>
                  <p className="mt-1 text-sm text-slate-400">{idea.hook}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Tap an angle to use it as the title.</p>
          </div>
        )}

        <div className="studio-surface p-6">
          <h3 className="font-medium text-slate-100">Terms &amp; conditions</h3>
          <p className="mt-1 text-sm text-slate-400">
            AI draft — review before publishing. Shown on the public share page.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="text-sm">
              <span className="text-slate-300">What&apos;s included / allowed</span>
              <textarea
                rows={2}
                value={form.included ?? ""}
                onChange={(e) => set("included", e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-300">What&apos;s excluded / not allowed</span>
              <textarea
                rows={2}
                value={form.excluded ?? ""}
                onChange={(e) => set("excluded", e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-300">Full terms</span>
              <textarea
                rows={5}
                value={form.terms ?? ""}
                onChange={(e) => set("terms", e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-5 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : form.id ? "Save changes" : "Save promotion"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function StatusForm({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setPromotionStatus} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="font-medium text-slate-400 hover:text-white">
        {label}
      </button>
    </form>
  );
}

// Manager-only: approve & sign the T&C, then publish.
function ApproveForm({ id, label = "Approve & publish" }: { id: string; label?: string }) {
  return (
    <form action={approvePromotion} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="font-medium text-emerald-400 hover:text-emerald-300">
        {label}
      </button>
    </form>
  );
}

function SubmitForm({ id }: { id: string }) {
  return (
    <form action={submitPromotion} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="font-medium text-sky-400 hover:text-sky-300">
        Send for approval
      </button>
    </form>
  );
}

function UnsubmitForm({ id, label }: { id: string; label: string }) {
  return (
    <form action={unsubmitPromotion} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="font-medium text-slate-400 hover:text-white">
        {label}
      </button>
    </form>
  );
}

function Bucket({
  title,
  hint,
  items,
  empty,
  canApprove,
  onEdit,
}: {
  title: string;
  hint: string;
  items: PromotionRow[];
  empty: string;
  canApprove: boolean;
  onEdit: (p: PromotionRow) => void;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h2>
        <span className="rounded-full bg-white/5 px-2 text-xs text-slate-400">{items.length}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      {items.length === 0 ? (
        <p className="studio-surface mt-3 p-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((p) => (
            <PromoCard key={p.id} p={p} canApprove={canApprove} onEdit={onEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

function PromoCard({
  p,
  canApprove,
  onEdit,
}: {
  p: PromotionRow;
  canApprove: boolean;
  onEdit: (p: PromotionRow) => void;
}) {
  const awaiting = p.status === "draft" && !!p.submitted_for_approval;
  return (
    <div className="studio-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-medium text-slate-100">{p.title}</h3>
        {awaiting ? (
          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
            awaiting
          </span>
        ) : (
          <StatusChip status={p.status} />
        )}
      </div>
      {(p.starts_on || p.ends_on) && (
        <p className="mt-1 text-xs text-slate-500">
          {p.starts_on ?? "—"} → {p.ends_on ?? "—"}
        </p>
      )}
      {p.offer_details && (
        <p className="mt-2 line-clamp-2 text-sm text-slate-400">{p.offer_details}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => onEdit(p)}
          className="font-medium text-sky-400 hover:text-sky-300"
        >
          Edit
        </button>
        {p.status === "active" && (
          <>
            <Link
              href={`/promo/${p.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 font-medium text-sky-400 hover:text-sky-300"
            >
              Public page <ArrowRightIcon size={12} />
            </Link>
            <StatusForm id={p.id} status="ended" label="End" />
          </>
        )}
        {p.status === "ended" && canApprove && <ApproveForm id={p.id} label="Publish again" />}
        {p.status === "draft" && !awaiting && (
          <>
            <SubmitForm id={p.id} />
            {canApprove && <ApproveForm id={p.id} />}
          </>
        )}
        {awaiting &&
          (canApprove ? (
            <>
              <ApproveForm id={p.id} />
              <UnsubmitForm id={p.id} label="Send back" />
            </>
          ) : (
            <UnsubmitForm id={p.id} label="Withdraw" />
          ))}
      </div>
      {p.approved_by && p.status === "active" && (
        <p className="mt-2 text-[11px] text-emerald-300/80">
          ✓ T&amp;C approved by {p.approved_by} · {p.approved_role}
        </p>
      )}
    </div>
  );
}
