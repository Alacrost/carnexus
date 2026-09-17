"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { SparkIcon, PhotoIcon, WriteIcon, ReadyIcon } from "@/components/icons";
import {
  draftCampaignIdeas,
  generateCampaign,
  enhanceCampaignImage,
  saveCampaign,
  saveCampaignTemplate,
  refineChannelCopy,
  type CampaignIdeasState,
  type GenerateCampaignState,
  type EnhanceState,
  type SaveCampaignState,
  type CampaignTemplateState,
} from "./actions";
import { starterRecipes } from "@/lib/starters";

type RefineAction = "shorter" | "punchier" | "emojis" | "rephrase";
const REFINE_ACTIONS: { action: RefineAction; label: string }[] = [
  { action: "shorter", label: "Shorter" },
  { action: "punchier", label: "Punchier" },
  { action: "emojis", label: "+ Emojis" },
  { action: "rephrase", label: "Regenerate" },
];

export interface VehicleOption {
  id: string;
  label: string;
  price: number | null;
  coverUrl: string | null;
  coverPath: string | null;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  config: { push?: string; audience?: string; promotionId?: string; angle?: string };
}

interface PromoOption {
  id: string;
  title: string;
}

type Channel =
  | "donedeal"
  | "facebook"
  | "instagram_feed"
  | "instagram_story"
  | "whatsapp"
  | "tiktok";

const CHANNEL_META: Record<
  Channel,
  { label: string; size: [number, number]; ratio: string }
> = {
  donedeal: { label: "DoneDeal", size: [1200, 900], ratio: "4 / 3" },
  facebook: { label: "Facebook", size: [1080, 1080], ratio: "1 / 1" },
  instagram_feed: { label: "Instagram Post", size: [1080, 1350], ratio: "4 / 5" },
  instagram_story: { label: "Instagram Story", size: [1080, 1920], ratio: "9 / 16" },
  whatsapp: { label: "WhatsApp Status", size: [1080, 1920], ratio: "9 / 16" },
  tiktok: { label: "TikTok", size: [1080, 1920], ratio: "9 / 16" },
};

const pushOptions = [
  { value: "soft", label: "Soft — just showcase it" },
  { value: "balanced", label: "Balanced — value + invite" },
  { value: "hard", label: "Hard — urgency, act now" },
];

function euro(n: number | null): string {
  return n == null ? "" : `€${n.toLocaleString("en-IE")}`;
}

/* ---------- canvas drawing ---------- */

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function drawCanvas(
  canvas: HTMLCanvasElement,
  size: [number, number],
  img: HTMLImageElement | null,
  opts: { headline: string; price: string; dealer: string }
) {
  const [w, h] = size;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Backdrop
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, w, h);

  // Cover-fit the car photo
  if (img && img.naturalWidth) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  // Bottom scrim for legible text
  const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
  grad.addColorStop(0, "rgba(2,6,23,0)");
  grad.addColorStop(1, "rgba(2,6,23,0.92)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, h * 0.45, w, h * 0.55);

  const pad = w * 0.06;

  // Dealer wordmark (top-left)
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 ${Math.round(w * 0.032)}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(opts.dealer, pad, pad);

  // Headline (bottom)
  const headSize = Math.round(w * 0.058);
  ctx.font = `700 ${headSize}px system-ui, sans-serif`;
  ctx.textBaseline = "alphabetic";
  const lines = wrapLines(ctx, opts.headline, w - pad * 2, 3);
  const lineH = headSize * 1.15;
  const priceH = opts.price ? w * 0.07 : 0;
  let y = h - pad - priceH - (lines.length - 1) * lineH;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  for (const ln of lines) {
    ctx.fillText(ln, pad, y);
    y += lineH;
  }
  ctx.shadowBlur = 0;

  // Price pill
  if (opts.price) {
    const pSize = Math.round(w * 0.05);
    ctx.font = `700 ${pSize}px system-ui, sans-serif`;
    const tw = ctx.measureText(opts.price).width;
    const px = pad;
    const py = h - pad - pSize * 1.1;
    const padX = w * 0.03;
    const padY = pSize * 0.35;
    ctx.fillStyle = "#0ea5e9";
    const rw = tw + padX * 2;
    const rh = pSize + padY * 2;
    const r = rh / 2;
    ctx.beginPath();
    ctx.moveTo(px + r, py - padY);
    ctx.arcTo(px + rw, py - padY, px + rw, py - padY + rh, r);
    ctx.arcTo(px + rw, py - padY + rh, px, py - padY + rh, r);
    ctx.arcTo(px, py - padY + rh, px, py - padY, r);
    ctx.arcTo(px, py - padY, px + rw, py - padY, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#04121f";
    ctx.textBaseline = "top";
    ctx.fillText(opts.price, px + padX, py - padY + padY);
  }
}

/* ---------- component ---------- */

export function CampaignComposer({
  vehicles,
  promotions,
  templates,
  dealerName,
  credits,
}: {
  vehicles: VehicleOption[];
  promotions: PromoOption[];
  templates: CampaignTemplate[];
  dealerName: string;
  credits: number;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [promotionId, setPromotionId] = useState("");
  const [audience, setAudience] = useState("");
  const [push, setPush] = useState("balanced");
  const [angle, setAngle] = useState("");
  const [creditsLeft, setCreditsLeft] = useState(credits);
  const [bgPrompt, setBgPrompt] = useState("");
  const [templateName, setTemplateName] = useState("");

  function applyRecipe(config: CampaignTemplate["config"]) {
    setPush(config.push ?? "balanced");
    setAudience(config.audience ?? "");
    setPromotionId(config.promotionId ?? "");
    setAngle(config.angle ?? "");
  }
  function applyTemplate(value: string) {
    if (value.startsWith("starter:")) {
      const s = starterRecipes[Number(value.slice(8))];
      if (s) applyRecipe(s.config);
      return;
    }
    const t = templates.find((x) => x.id === value);
    if (t) applyRecipe(t.config);
  }

  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId]
  );

  // Base image (starts as the vehicle cover; AI edits swap it out).
  const [baseUrl, setBaseUrl] = useState<string | null>(vehicle?.coverUrl ?? null);
  const [basePath, setBasePath] = useState<string | null>(vehicle?.coverPath ?? null);
  const [baseBucket, setBaseBucket] = useState<"vehicle-photos" | "brand-assets">(
    "vehicle-photos"
  );
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    setBaseUrl(vehicle?.coverUrl ?? null);
    setBasePath(vehicle?.coverPath ?? null);
    setBaseBucket("vehicle-photos");
  }, [vehicle]);

  // Load base image for the canvas (CORS so export isn't tainted).
  useEffect(() => {
    if (!baseUrl) {
      setLoadedImg(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = baseUrl;
    let cancelled = false;
    img.decode().then(
      () => !cancelled && setLoadedImg(img),
      () => !cancelled && setLoadedImg(null)
    );
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const [ideasState, ideasAction, ideasPending] = useActionState<
    CampaignIdeasState,
    FormData
  >(draftCampaignIdeas, {});
  const [genState, genAction, genPending] = useActionState<
    GenerateCampaignState,
    FormData
  >(generateCampaign, {});
  const [enhState, enhAction, enhPending] = useActionState<EnhanceState, FormData>(
    enhanceCampaignImage,
    {}
  );
  const [saveState, saveAction, savePending] = useActionState<
    SaveCampaignState,
    FormData
  >(saveCampaign, {});
  const [tplState, tplAction, tplPending] = useActionState<
    CampaignTemplateState,
    FormData
  >(saveCampaignTemplate, {});

  // Editable per-channel copy, seeded from the AI result.
  const [copy, setCopy] = useState<
    Record<string, { title: string; body: string; hashtags: string }>
  >({});
  useEffect(() => {
    if (genState.result) {
      const next: typeof copy = {};
      for (const c of genState.result.channels) {
        next[c.channel] = { title: c.title, body: c.body, hashtags: c.hashtags };
      }
      setCopy(next);
    }
  }, [genState.result]);

  // Apply AI image result + credit balance.
  useEffect(() => {
    if (enhState.remaining != null) setCreditsLeft(enhState.remaining);
    if (enhState.url) {
      setBaseUrl(enhState.url);
      setBasePath(null); // enhanced output isn't re-editable by path
      setBaseBucket("brand-assets");
    }
  }, [enhState]);

  const headline = angle || genState.result?.vehicleName || vehicle?.label || "";
  const priceText = euro(vehicle?.price ?? null);

  // Redraw every channel canvas when inputs change.
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  useEffect(() => {
    if (!genState.result) return;
    for (const c of genState.result.channels) {
      const canvas = canvasRefs.current[c.channel];
      if (canvas) {
        drawCanvas(canvas, CHANNEL_META[c.channel as Channel].size, loadedImg, {
          headline,
          price: priceText,
          dealer: dealerName,
        });
      }
    }
  }, [genState.result, loadedImg, headline, priceText, dealerName]);

  function download(channel: string) {
    const canvas = canvasRefs.current[channel];
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${channel}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function copyText(channel: string) {
    const c = copy[channel];
    if (!c) return;
    const text = [c.title, "", c.body, "", c.hashtags].filter(Boolean).join("\n");
    navigator.clipboard?.writeText(text);
  }

  const [refinePending, startRefine] = useTransition();
  const [refiningKey, setRefiningKey] = useState<string | null>(null);
  function refine(channel: string, action: RefineAction) {
    const cc = copy[channel];
    if (!cc || !cc.body.trim()) return;
    setRefiningKey(`${channel}:${action}`);
    startRefine(async () => {
      const fd = new FormData();
      fd.set("text", cc.body);
      fd.set("action", action);
      fd.set("channel", channel);
      const res = await refineChannelCopy({}, fd);
      if (res.text) {
        setCopy((p) => ({ ...p, [channel]: { ...cc, body: res.text! } }));
      }
      setRefiningKey(null);
    });
  }

  const assetsJson = JSON.stringify({ angle, dealerName, channels: copy });

  return (
    <div className="space-y-6">
      {/* Credit meter */}
      <div className="flex items-center justify-between studio-surface px-4 py-3">
        <span className="text-sm text-slate-400">
          AI image credits let you enhance photos or replace backgrounds.
        </span>
        <span className="text-sm font-medium text-sky-300">
          {creditsLeft} credits left
        </span>
      </div>

      {/* Step 1 — plan + suggest angles */}
      <form action={ideasAction} className="studio-surface p-6">
        <div className="flex items-center gap-2">
          <SparkIcon size={18} />
          <h2 className="font-medium text-slate-100">1 · Plan the campaign</h2>
        </div>

        <div className="mt-4">
          <label htmlFor="templateId" className="block text-sm text-slate-300">
            Start from a template <span className="text-slate-500">(optional)</span>
          </label>
          <select
            id="templateId"
            defaultValue=""
            onChange={(e) => applyTemplate(e.target.value)}
            className="mt-1 studio-input"
          >
            <option value="">Start blank</option>
            <optgroup label="Starters">
              {starterRecipes.map((s, i) => (
                <option key={s.name} value={`starter:${i}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            {templates.length > 0 && (
              <optgroup label="Your templates">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="vehicleId" className="block text-sm text-slate-300">
              Vehicle
            </label>
            <select
              id="vehicleId"
              name="vehicleId"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              required
              className="mt-1 studio-input"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {promotions.length > 0 && (
            <div>
              <label htmlFor="promotionId" className="block text-sm text-slate-300">
                Promotion <span className="text-slate-500">(optional)</span>
              </label>
              <select
                id="promotionId"
                name="promotionId"
                value={promotionId}
                onChange={(e) => setPromotionId(e.target.value)}
                className="mt-1 studio-input"
              >
                <option value="">None</option>
                {promotions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="audience" className="block text-sm text-slate-300">
              Who is it for? <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="audience"
              name="audience"
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. first-time buyers, families"
              className="mt-1 studio-input"
            />
          </div>

          <div>
            <label htmlFor="push" className="block text-sm text-slate-300">
              How hard should it sell?
            </label>
            <select
              id="push"
              name="push"
              value={push}
              onChange={(e) => setPush(e.target.value)}
              className="mt-1 studio-input"
            >
              {pushOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={ideasPending || !vehicleId}
          className="btn-gradient mt-5 disabled:opacity-50"
        >
          {ideasPending ? "Thinking…" : "Suggest angles"}
        </button>
        {ideasState.error && (
          <p className="mt-3 text-sm text-rose-400">{ideasState.error}</p>
        )}
      </form>

      {/* Step 2 — pick an angle */}
      {ideasState.angles && (
        <div className="studio-surface p-6 animate-rise">
          <h2 className="font-medium text-slate-100">2 · Pick an angle</h2>
          <p className="mt-1 text-sm text-slate-400">
            These become the headline on your images. Edit later if you like.
          </p>
          <div className="mt-4 space-y-2">
            {ideasState.angles.map((a) => (
              <label
                key={a}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                  angle === a
                    ? "border-sky-500/60 bg-sky-500/10 text-white"
                    : "border-white/10 text-slate-300 hover:border-white/25"
                }`}
              >
                <input
                  type="radio"
                  name="angleChoice"
                  className="accent-sky-500"
                  checked={angle === a}
                  onChange={() => setAngle(a)}
                />
                {a}
              </label>
            ))}
          </div>

          <form action={genAction} className="mt-5">
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <input type="hidden" name="promotionId" value={promotionId} />
            <input type="hidden" name="angle" value={angle} />
            <button
              type="submit"
              disabled={genPending || !angle}
              className="btn-gradient disabled:opacity-50"
            >
              {genPending ? "Generating…" : "Generate campaign"}
            </button>
            {genState.error && (
              <p className="mt-3 text-sm text-rose-400">{genState.error}</p>
            )}
          </form>

          {/* Save these settings as a reusable recipe */}
          <form
            action={tplAction}
            className="mt-5 flex flex-wrap items-end gap-3 border-t border-white/10 pt-5"
          >
            <input
              type="hidden"
              name="config"
              value={JSON.stringify({ push, audience, promotionId, angle })}
            />
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="templateName" className="block text-xs text-slate-400">
                Save these settings as a template
              </label>
              <input
                id="templateName"
                name="name"
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Weekend push"
                className="mt-1 studio-input"
              />
            </div>
            <button
              type="submit"
              disabled={tplPending || templateName.trim().length < 2}
              className="btn-outline disabled:opacity-50"
            >
              Save as template
            </button>
            {tplState.saved && (
              <span className="text-sm text-emerald-400">Saved.</span>
            )}
            {tplState.error && (
              <span className="text-sm text-rose-400">{tplState.error}</span>
            )}
          </form>
        </div>
      )}

      {/* Step 3 — image + channels */}
      {genState.result && (
        <div className="animate-rise space-y-6">
          {/* Image tools */}
          <div className="studio-surface p-6">
            <div className="flex items-center gap-2">
              <PhotoIcon size={18} />
              <h2 className="font-medium text-slate-100">3 · Photo</h2>
            </div>
            {baseUrl ? (
              <p className="mt-1 text-sm text-slate-400">
                Using the vehicle&apos;s cover photo. Enhancing keeps the car exactly as it
                is — we only improve the shot.
              </p>
            ) : (
              <p className="mt-1 text-sm text-amber-400">
                This vehicle has no cover photo, so images are text-only. Add one in Inventory
                to compose posts.
              </p>
            )}

            {basePath && (
              <form action={enhAction} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="bucket" value={baseBucket} />
                <input type="hidden" name="path" value={basePath} />
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="backgroundPrompt" className="block text-xs text-slate-400">
                    New background <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    id="backgroundPrompt"
                    name="backgroundPrompt"
                    type="text"
                    value={bgPrompt}
                    onChange={(e) => setBgPrompt(e.target.value)}
                    placeholder="e.g. clean showroom, neutral studio"
                    className="mt-1 studio-input"
                  />
                </div>
                <button
                  type="submit"
                  name="op"
                  value="enhance"
                  disabled={enhPending || creditsLeft < 1}
                  className="btn-outline disabled:opacity-50"
                >
                  Enhance (1)
                </button>
                <button
                  type="submit"
                  name="op"
                  value="background"
                  disabled={enhPending || creditsLeft < 2}
                  className="btn-outline disabled:opacity-50"
                >
                  Replace background (2)
                </button>
              </form>
            )}
            {enhPending && (
              <p className="mt-3 text-sm text-slate-400">Working on the photo…</p>
            )}
            {enhState.note && (
              <p className="mt-3 text-sm text-slate-400">{enhState.note}</p>
            )}
            {enhState.error && (
              <p className="mt-3 text-sm text-rose-400">{enhState.error}</p>
            )}
          </div>

          {/* Channels */}
          <div className="grid gap-6 lg:grid-cols-2">
            {genState.result.channels.map((c) => {
              const meta = CHANNEL_META[c.channel as Channel];
              const cc = copy[c.channel] ?? {
                title: c.title,
                body: c.body,
                hashtags: c.hashtags,
              };
              return (
                <div key={c.channel} className="studio-surface p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-slate-100">{meta.label}</h3>
                    <span className="text-xs text-slate-500">
                      {meta.size[0]}×{meta.size[1]}
                    </span>
                  </div>

                  <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                    <canvas
                      ref={(el) => {
                        canvasRefs.current[c.channel] = el;
                      }}
                      style={{ width: "100%", aspectRatio: meta.ratio, display: "block" }}
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    {cc.title && (
                      <input
                        type="text"
                        value={cc.title}
                        onChange={(e) =>
                          setCopy((p) => ({
                            ...p,
                            [c.channel]: { ...cc, title: e.target.value },
                          }))
                        }
                        className="studio-input text-sm font-medium"
                      />
                    )}
                    <textarea
                      value={cc.body}
                      rows={4}
                      onChange={(e) =>
                        setCopy((p) => ({
                          ...p,
                          [c.channel]: { ...cc, body: e.target.value },
                        }))
                      }
                      className="studio-input text-sm"
                    />
                    {cc.hashtags && (
                      <input
                        type="text"
                        value={cc.hashtags}
                        onChange={(e) =>
                          setCopy((p) => ({
                            ...p,
                            [c.channel]: { ...cc, hashtags: e.target.value },
                          }))
                        }
                        className="studio-input text-sm text-sky-300"
                      />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {REFINE_ACTIONS.map((r) => {
                      const key = `${c.channel}:${r.action}`;
                      const busy = refiningKey === key;
                      return (
                        <button
                          key={r.action}
                          type="button"
                          onClick={() => refine(c.channel, r.action)}
                          disabled={refinePending || !cc.body.trim()}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
                        >
                          {busy ? "…" : r.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => copyText(c.channel)}
                      className="btn-outline text-sm"
                    >
                      <WriteIcon size={14} /> Copy text
                    </button>
                    <button
                      type="button"
                      onClick={() => download(c.channel)}
                      className="btn-outline text-sm"
                    >
                      <PhotoIcon size={14} /> Download image
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save draft */}
          <form action={saveAction} className="studio-surface flex items-center justify-between p-6">
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <input type="hidden" name="promotionId" value={promotionId} />
            <input type="hidden" name="assets" value={assetsJson} />
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <ReadyIcon size={16} />
              Saved as a draft — nothing is published automatically.
            </div>
            <div className="flex items-center gap-3">
              {saveState.saved && (
                <span className="text-sm text-emerald-400">Saved.</span>
              )}
              {saveState.error && (
                <span className="text-sm text-rose-400">{saveState.error}</span>
              )}
              <button
                type="submit"
                disabled={savePending}
                className="btn-gradient disabled:opacity-50"
              >
                {savePending ? "Saving…" : "Save draft"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
