"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudioShell, StudioProperties } from "@/components/studio-shell";
import {
  PhotoIcon,
  SparkIcon,
  LayersIcon,
  ReadyIcon,
  PromoIcon,
  CampaignIcon,
  InventoryIcon,
} from "@/components/icons";
import {
  saveOverlayPattern,
  deleteOverlayPattern,
  enhanceCoverImage,
  attachCoverToVehicle,
  saveBackgroundTemplate,
  deleteBackgroundTemplate,
  type BackgroundTemplate,
} from "./actions";

// Small tool-rail glyphs not in the shared set (kept local, same 24/1.6 motif).
function SlidersIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="13" cy="18" r="2" />
    </svg>
  );
}
function FrameIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  );
}

// A pattern is a set of positioned PNG overlays, reusable across cover photos.
// Positions are stored as fractions of the cover image so they scale to any size.
// Persisted to Supabase (brand-assets storage + overlay_patterns table) when a
// dealerId is present; falls back to localStorage in demo mode.

interface OverlayItem {
  id: string;
  src: string; // data URL (new) or signed storage URL (loaded)
  path?: string; // storage path once uploaded — lets us re-save without re-upload
  ratio: number; // natural height / width, to keep aspect on export
  xPct: number; // center X, 0..1 of cover width
  yPct: number; // center Y, 0..1 of cover height
  widthPct: number; // width as fraction of cover width
  opacity: number; // 0..1
}

export interface Pattern {
  id: string;
  name: string;
  items: OverlayItem[];
  frame?: Frame | null;
}

// A car to which a finished cover can be attached (loaded from inventory).
export interface VehicleOption {
  id: string;
  label: string;
}

// Photo adjustments applied to the base image only (CSS filter + canvas filter).
interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  hue: number;
}
const DEFAULT_ADJUST: Adjust = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  hue: 0,
};
function filterString(a: Adjust): string {
  return `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) sepia(${a.warmth}%) hue-rotate(${a.hue}deg)`;
}

// A border/frame drawn over the finished image (and saved with a template).
export interface Frame {
  style: string;
  color: string;
}
const FRAME_STYLES: { key: string; label: string }[] = [
  { key: "none", label: "None" },
  { key: "solid", label: "Solid" },
  { key: "double", label: "Double" },
  { key: "rounded", label: "Rounded" },
  { key: "corners", label: "Corners" },
  { key: "banner", label: "Bottom bar" },
];

// Draw the chosen border into a canvas sized w×h.
function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, frame: Frame) {
  if (!frame || frame.style === "none") return;
  const c = frame.color || "#ffffff";
  const t = Math.max(4, Math.round(Math.min(w, h) * 0.022));
  const inset = t / 2;
  ctx.save();
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = t;
  ctx.lineJoin = "miter";
  switch (frame.style) {
    case "solid":
      ctx.strokeRect(inset, inset, w - t, h - t);
      break;
    case "double": {
      ctx.lineWidth = Math.max(2, t * 0.35);
      ctx.strokeRect(inset, inset, w - t, h - t);
      const g = t * 1.4;
      ctx.strokeRect(inset + g, inset + g, w - t - g * 2, h - t - g * 2);
      break;
    }
    case "rounded":
      ctx.beginPath();
      ctx.roundRect(inset, inset, w - t, h - t, Math.min(w, h) * 0.06);
      ctx.stroke();
      break;
    case "corners": {
      const len = Math.min(w, h) * 0.12;
      const corners: [number, number, number, number][] = [
        [inset, inset, 1, 1],
        [w - inset, inset, -1, 1],
        [inset, h - inset, 1, -1],
        [w - inset, h - inset, -1, -1],
      ];
      for (const [x, y, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * len);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx * len, y);
        ctx.stroke();
      }
      break;
    }
    case "banner": {
      const bh = h * 0.14;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, h - bh, w, bh);
      break;
    }
  }
  ctx.restore();
}

// Load any image URL (incl. cross-origin signed URLs) into a same-origin data
// URL, so later canvas exports never taint and re-improving stays same-origin.
function urlToDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, 0, 0);
      try {
        resolve(c.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

// AI preset buttons — cost credits, never auto-publish (draft-first).
interface AiPreset {
  key: string;
  label: string;
  hint: string;
  cost: number;
}
const aiPresets: AiPreset[] = [
  { key: "enhance", label: "Auto enhance", hint: "Lighting & clarity", cost: 1 },
  { key: "white", label: "White studio", hint: "Clean white backdrop", cost: 2 },
  { key: "showroom", label: "Showroom", hint: "Indoor showroom", cost: 2 },
  { key: "outdoor", label: "Forecourt", hint: "Outdoor forecourt", cost: 2 },
];

// Round trust seals, drawn on the fly — generic & trademark-free.
interface SealPreset {
  key: string;
  top: string;
  big: string;
  sub?: string;
  color: string;
}
const sealPresets: SealPreset[] = [
  { key: "nct", top: "NCT", big: "VALID", color: "#0284c7" },
  { key: "roadtax", top: "ROAD TAX", big: "PAID", color: "#7c3aed" },
  { key: "w3", top: "WARRANTY", big: "3", sub: "MONTHS", color: "#0d9488" },
  { key: "w6", top: "WARRANTY", big: "6", sub: "MONTHS", color: "#0d9488" },
  { key: "w12", top: "WARRANTY", big: "12", sub: "MONTHS", color: "#0d9488" },
  { key: "w2y", top: "WARRANTY", big: "2", sub: "YEARS", color: "#b45309" },
  { key: "w3y", top: "WARRANTY", big: "3", sub: "YEARS", color: "#b45309" },
  { key: "w5y", top: "WARRANTY", big: "5", sub: "YEARS", color: "#b45309" },
  { key: "w7y", top: "WARRANTY", big: "7", sub: "YEARS", color: "#b45309" },
  { key: "w10y", top: "WARRANTY", big: "10", sub: "YEARS", color: "#b45309" },
];

function renderSeal(s: SealPreset): { url: string; ratio: number } {
  const size = 320;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 34px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(s.top, cx, cy - (s.sub ? 74 : 52));
  ctx.font = `800 ${s.big.length > 2 ? 88 : 112}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(s.big, cx, cy + (s.sub ? 6 : 22));
  if (s.sub) {
    ctx.font = "700 40px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(s.sub, cx, cy + 82);
  }
  return { url: canvas.toDataURL("image/png"), ratio: 1 };
}

const STORAGE_KEY = "autonexus.overlayPatterns";

function loadLocalPatterns(): Pattern[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function imageRatio(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth || 1);
    img.onerror = () => resolve(1);
    img.src = src;
  });
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());

// Starter badges are drawn to a PNG on the fly, so there are no image assets to
// ship and the upload path (fetch(src)->blob) gets a real image/png.
interface BadgeStarter {
  label: string;
  bg1: string;
  bg2: string;
}
const badgeStarters: BadgeStarter[] = [
  { label: "REDUCED", bg1: "#fb7185", bg2: "#e11d48" },
  { label: "JUST ARRIVED", bg1: "#38bdf8", bg2: "#0284c7" },
  { label: "FINANCE AVAILABLE", bg1: "#34d399", bg2: "#059669" },
];

function renderBadge({ label, bg1, bg2 }: BadgeStarter): { url: string; ratio: number } {
  const fontSize = 64;
  const padX = 56;
  const padY = 32;
  const font = `800 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const textW = measure.measureText(label).width;
  const w = Math.ceil(textW + padX * 2);
  const h = Math.ceil(fontSize + padY * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, bg1);
  grad.addColorStop(1, bg2);
  ctx.fillStyle = grad;
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.fill();
  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2 + 2);
  return { url: canvas.toDataURL("image/png"), ratio: h / w };
}

export function OverlayStudio({
  dealerId,
  initialPatterns,
  vehicles,
  credits,
  canSetCover,
  backgrounds,
}: {
  dealerId: string | null;
  initialPatterns: Pattern[];
  vehicles: VehicleOption[];
  credits: number;
  canSetCover: boolean;
  backgrounds: BackgroundTemplate[];
}) {
  const [cover, setCover] = useState<string | null>(null);
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>(initialPatterns);
  const [patternName, setPatternName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [adjust, setAdjust] = useState<Adjust>(DEFAULT_ADJUST);
  const [frame, setFrame] = useState<Frame>({ style: "none", color: "#ffffff" });

  const [creditsLeft, setCreditsLeft] = useState(credits);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiPreset, setAiPreset] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  // Saved background templates (dealer's standard backdrops).
  const [bgList, setBgList] = useState<BackgroundTemplate[]>(backgrounds);
  const [bgName, setBgName] = useState("");
  const [bgDesc, setBgDesc] = useState("");
  const [bgSaving, setBgSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverMsg, setCoverMsg] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState("photo");
  const [resizeTick, setResizeTick] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragId = useRef<string | null>(null);

  // Demo mode (no dealer): patterns live in localStorage.
  useEffect(() => {
    if (!dealerId) setPatterns(loadLocalPatterns());
  }, [dealerId]);

  const persistLocal = useCallback((next: Pattern[]) => {
    setPatterns(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // Keep the border preview in sync with the stage size and chosen frame.
  useEffect(() => {
    const canvas = frameCanvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    drawFrame(ctx, w, h, frame);
  }, [cover, frame, items, resizeTick]);

  // Redraw the border when the layout changes width.
  useEffect(() => {
    const onResize = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function onCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCover(await fileToDataUrl(file));
  }

  async function onAddOverlay(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const src = await fileToDataUrl(file);
      const ratio = await imageRatio(src);
      const item: OverlayItem = {
        id: uid(),
        src,
        ratio,
        xPct: 0.5,
        yPct: 0.5,
        widthPct: 0.25,
        opacity: 1,
      };
      setItems((prev) => [...prev, item]);
      setSelectedId(item.id);
    }
    e.target.value = "";
  }

  function updateItem(id: string, patch: Partial<OverlayItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function addBadge(preset: BadgeStarter) {
    const b = renderBadge(preset);
    const item: OverlayItem = {
      id: uid(),
      src: b.url,
      ratio: b.ratio,
      xPct: 0.5,
      yPct: 0.14,
      widthPct: 0.34,
      opacity: 1,
    };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
  }

  function addSeal(preset: SealPreset) {
    const s = renderSeal(preset);
    const item: OverlayItem = {
      id: uid(),
      src: s.url,
      ratio: s.ratio,
      xPct: 0.82,
      yPct: 0.78,
      widthPct: 0.18,
      opacity: 1,
    };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
  }

  function resetAdjust() {
    setAdjust(DEFAULT_ADJUST);
  }

  // Improve the current base photo with an AI preset (draft-first, costs credits).
  // A saved background template passes its own prompt via bgPromptText.
  function improve(preset: AiPreset, bgPromptText?: string) {
    if (!cover || aiPending || preset.cost > creditsLeft) return;
    setAiNote(null);
    setAiPreset(preset.key);
    startAi(async () => {
      try {
        const blob = await (await fetch(cover)).blob();
        const fd = new FormData();
        fd.set("preset", preset.key);
        if (bgPromptText) fd.set("bgPrompt", bgPromptText);
        fd.set("image", blob, "cover.png");
        const res = await enhanceCoverImage({}, fd);
        if (typeof res.remaining === "number") setCreditsLeft(res.remaining);
        if (res.error) {
          setAiNote(res.error);
          return;
        }
        if (res.note) setAiNote(res.note);
        if (res.url) {
          try {
            setCover(await urlToDataUrl(res.url));
          } catch {
            setAiNote("Could not load the improved image.");
          }
        }
      } catch {
        setAiNote("The AI improvement failed. Please try again.");
      } finally {
        setAiPreset(null);
      }
    });
  }

  // Apply a saved background template to the current photo (background op, 2 credits).
  function applyBg(bg: BackgroundTemplate) {
    improve({ key: "template", label: bg.name, hint: "", cost: 2 }, bg.prompt);
  }

  async function saveBg() {
    const name = bgName.trim();
    const prompt = bgDesc.trim();
    if (name.length < 2 || prompt.length < 3 || bgSaving) return;
    setBgSaving(true);
    const res = await saveBackgroundTemplate({ name, prompt });
    setBgSaving(false);
    if (res.id) {
      setBgList((prev) => [{ id: res.id!, name, prompt }, ...prev]);
      setBgName("");
      setBgDesc("");
    } else if (res.error) {
      setAiNote(res.error);
    }
  }

  async function removeBg(id: string) {
    setBgList((prev) => prev.filter((b) => b.id !== id));
    await deleteBackgroundTemplate(id);
  }

  // Render the full composite (base + adjustments + overlays + frame) at the
  // base photo's natural resolution. Shared by export and save-as-cover.
  async function composeCanvas(): Promise<HTMLCanvasElement | null> {
    if (!cover) return null;
    const base = new Image();
    base.crossOrigin = "anonymous";
    base.src = cover;
    await base.decode().catch(() => {});
    const canvas = document.createElement("canvas");
    canvas.width = base.naturalWidth || 1200;
    canvas.height = base.naturalHeight || 900;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.filter = filterString(adjust);
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";
    for (const it of items) {
      const overlay = new Image();
      overlay.crossOrigin = "anonymous";
      overlay.src = it.src;
      await overlay.decode().catch(() => {});
      const w = it.widthPct * canvas.width;
      const h = w * it.ratio;
      const x = it.xPct * canvas.width - w / 2;
      const y = it.yPct * canvas.height - h / 2;
      ctx.globalAlpha = it.opacity;
      ctx.drawImage(overlay, x, y, w, h);
    }
    ctx.globalAlpha = 1;
    drawFrame(ctx, canvas.width, canvas.height, frame);
    return canvas;
  }

  // Upload the composite as a vehicle's cover (owner/admin only).
  async function saveAsCover() {
    if (!vehicleId || !cover || coverSaving) return;
    setCoverSaving(true);
    setCoverMsg(null);
    try {
      const canvas = await composeCanvas();
      const blob: Blob | null = canvas
        ? await new Promise((r) => canvas.toBlob((b) => r(b), "image/png"))
        : null;
      if (!blob) {
        setCoverMsg("Could not build the image.");
        return;
      }
      if (!dealerId) {
        setCoverMsg("Saved as cover (demo).");
        return;
      }
      const supabase = createClient();
      const path = `${dealerId}/${vehicleId}/${uid()}.png`;
      const { error } = await supabase.storage
        .from("vehicle-photos")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (error) {
        setCoverMsg("Upload failed. Please try again.");
        return;
      }
      const fd = new FormData();
      fd.set("vehicleId", vehicleId);
      fd.set("path", path);
      const res = await attachCoverToVehicle({}, fd);
      setCoverMsg(res.error ?? "Set as cover ✓");
    } catch {
      setCoverMsg("Something went wrong. Please try again.");
    } finally {
      setCoverSaving(false);
    }
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    dragId.current = id;
    setSelectedId(id);
    setActiveTool("layers");
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragId.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    updateItem(dragId.current, { xPct: x, yPct: y });
  }

  function onPointerUp() {
    dragId.current = null;
  }

  async function savePattern() {
    const name = patternName.trim();
    if (!name || items.length === 0 || saving) return;
    setSaveError(null);

    // Demo mode: keep everything in localStorage (data URLs included).
    if (!dealerId) {
      const existing = patterns.find((p) => p.name === name);
      const pattern: Pattern = { id: existing?.id ?? uid(), name, items, frame };
      persistLocal(
        existing
          ? patterns.map((p) => (p.id === existing.id ? pattern : p))
          : [...patterns, pattern]
      );
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      // Upload any overlay that isn't in storage yet, then reference it by path.
      const uploaded: OverlayItem[] = [];
      for (const it of items) {
        let path = it.path;
        if (!path) {
          const blob = await (await fetch(it.src)).blob();
          path = `${dealerId}/overlays/${uid()}.png`;
          const { error } = await supabase.storage
            .from("brand-assets")
            .upload(path, blob, { contentType: "image/png", upsert: false });
          if (error) throw error;
        }
        uploaded.push({ ...it, path });
      }

      const existing = patterns.find((p) => p.name === name);
      const res = await saveOverlayPattern({
        id: existing?.id,
        name,
        items: uploaded.map((it) => ({
          path: it.path!,
          ratio: it.ratio,
          xPct: it.xPct,
          yPct: it.yPct,
          widthPct: it.widthPct,
          opacity: it.opacity,
        })),
        frame,
      });
      if (res.error || !res.id) {
        setSaveError(res.error ?? "Could not save the pattern.");
        return;
      }

      setItems(uploaded);
      const pattern: Pattern = { id: res.id, name, items: uploaded, frame };
      setPatterns((prev) =>
        prev.some((p) => p.id === res.id)
          ? prev.map((p) => (p.id === res.id ? pattern : p))
          : [pattern, ...prev]
      );
    } catch {
      setSaveError("Upload failed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function applyPattern(p: Pattern) {
    setItems(p.items.map((it) => ({ ...it, id: uid() })));
    setPatternName(p.name);
    setFrame(p.frame ?? { style: "none", color: frame.color });
    setSelectedId(null);
  }

  async function deletePattern(id: string) {
    if (!dealerId) {
      persistLocal(patterns.filter((p) => p.id !== id));
      return;
    }
    setPatterns((prev) => prev.filter((p) => p.id !== id));
    await deleteOverlayPattern(id);
  }

  async function exportImage() {
    const canvas = await composeCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "cover.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const selected = items.find((it) => it.id === selectedId) ?? null;

  const tools: { key: string; label: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
    { key: "photo", label: "Photo", icon: PhotoIcon },
    { key: "adjust", label: "Adjust", icon: SlidersIcon },
    { key: "ai", label: "AI", icon: SparkIcon },
    { key: "badges", label: "Badges", icon: PromoIcon },
    { key: "seals", label: "Seals", icon: ReadyIcon },
    { key: "border", label: "Border", icon: FrameIcon },
    { key: "layers", label: "Layers", icon: LayersIcon },
    { key: "templates", label: "Templates", icon: CampaignIcon },
    ...(canSetCover
      ? [{ key: "cover", label: "Set cover", icon: InventoryIcon }]
      : []),
  ];
  const activeLabel = tools.find((t) => t.key === activeTool)?.label ?? "";

  return (
    <StudioShell
      title="Cover Photo Studio"
      subtitle={
        cover
          ? "Adjust, add seals & a border, improve with AI, then set it as a car's cover."
          : "Upload a photo to start — everything else layers on top of it."
      }
      backHref="/marketing"
      icon={PhotoIcon}
      tools={tools}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      rightActions={
        <>
          <span className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 sm:inline-flex">
            <SparkIcon size={13} /> {creditsLeft} credits
          </span>
          <button
            onClick={exportImage}
            disabled={!cover}
            className="rounded-lg border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-40"
          >
            Export PNG
          </button>
        </>
      }
    >
      {/* Canvas */}
      <div className="relative flex min-h-[60vh] items-center justify-center bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.06),transparent_70%)] p-4 lg:p-8">
          {cover ? (
            <div
              ref={stageRef}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="relative select-none overflow-hidden rounded-lg shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt="Cover"
                className="block max-h-[74vh] w-auto max-w-full"
                draggable={false}
                style={{ filter: filterString(adjust) }}
              />
              {items.map((it) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={it.id}
                  src={it.src}
                  alt=""
                  crossOrigin="anonymous"
                  draggable={false}
                  onPointerDown={(e) => onPointerDown(e, it.id)}
                  style={{
                    position: "absolute",
                    left: `${it.xPct * 100}%`,
                    top: `${it.yPct * 100}%`,
                    width: `${it.widthPct * 100}%`,
                    transform: "translate(-50%, -50%)",
                    opacity: it.opacity,
                    cursor: "grab",
                    outline: it.id === selectedId ? "2px solid #0ea5e9" : "none",
                    touchAction: "none",
                  }}
                />
              ))}
              {/* Border preview sits above the overlays. */}
              <canvas
                ref={frameCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            </div>
          ) : (
            <label className="flex aspect-video w-full max-w-md cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 text-slate-400 transition hover:border-sky-500 hover:text-slate-200">
              <PhotoIcon size={28} />
              <span className="mt-2 text-sm">Upload the cover photo</span>
              <span className="mt-1 text-xs text-slate-500">
                Everything else layers on top of it
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={onCover} />
            </label>
          )}
        </div>

        {/* Properties */}
        <StudioProperties>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">{activeLabel}</h2>
            {cover && activeTool !== "photo" && (
              <span className="text-[11px] text-slate-500">{items.length} layer(s)</span>
            )}
          </div>

          {/* Photo source */}
          {activeTool === "photo" && (
            <div className="space-y-3 text-sm">
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-slate-300 transition hover:border-sky-500">
                {cover ? "Change cover photo" : "Upload cover photo"}
                <input type="file" accept="image/*" className="hidden" onChange={onCover} />
              </label>
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-slate-300 transition hover:border-sky-500 aria-disabled:opacity-40">
                Add overlay PNG
                <input
                  type="file"
                  accept="image/png,image/*"
                  multiple
                  className="hidden"
                  onChange={onAddOverlay}
                />
              </label>
              <p className="text-xs text-slate-500">
                Upload your own logo or badge PNGs (AA, DoneDeal, etc.), then drag
                them on the photo.
              </p>
            </div>
          )}

          {/* Manual adjustments */}
          {activeTool === "adjust" && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-end">
                <button
                  onClick={resetAdjust}
                  disabled={!cover}
                  className="text-xs text-slate-500 hover:text-white disabled:opacity-40"
                >
                  Reset
                </button>
              </div>
              {([
                ["Brightness", "brightness", 50, 150],
                ["Contrast", "contrast", 50, 150],
                ["Saturation", "saturation", 0, 200],
                ["Warmth", "warmth", 0, 100],
                ["Hue", "hue", 0, 360],
              ] as [string, keyof Adjust, number, number][]).map(([label, key, min, max]) => (
                <label key={key} className="block text-slate-300">
                  {label} ({adjust[key]})
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={adjust[key]}
                    disabled={!cover}
                    onChange={(e) =>
                      setAdjust((a) => ({ ...a, [key]: Number(e.target.value) }))
                    }
                    className="mt-1 w-full accent-sky-500 disabled:opacity-40"
                  />
                </label>
              ))}
              {!cover && <p className="text-xs text-slate-500">Upload a cover photo first.</p>}
            </div>
          )}

          {/* AI improve */}
          {activeTool === "ai" && (
            <div>
              <p className="text-xs text-slate-500">
                Pick an option — each costs credits and updates the photo. Nothing
                is published; you stay in control.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {aiPresets.map((p) => {
                  const busy = aiPending && aiPreset === p.key;
                  const disabled = !cover || aiPending || p.cost > creditsLeft;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => improve(p)}
                      disabled={disabled}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-left transition hover:bg-white/10 disabled:opacity-40"
                    >
                      <span className="flex items-center justify-between text-xs font-medium text-slate-100">
                        {p.label}
                        <span className="text-[10px] text-sky-300">{p.cost}c</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {busy ? "Working…" : p.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">{creditsLeft} credits left</p>
              {aiNote && <p className="mt-1 text-xs text-amber-300">{aiNote}</p>}

              {/* Saved background templates — the dealer's standard backdrops. */}
              <div className="mt-5 border-t border-white/5 pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Your backgrounds
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Apply your standard backdrop to this photo (2c). The car is never
                  altered — only the background behind it.
                </p>
                {bgList.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {bgList.map((bg) => {
                      const disabled = !cover || aiPending || 2 > creditsLeft;
                      return (
                        <div
                          key={bg.id}
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2"
                        >
                          <button
                            type="button"
                            onClick={() => applyBg(bg)}
                            disabled={disabled}
                            className="min-w-0 flex-1 text-left disabled:opacity-40"
                            title={bg.prompt}
                          >
                            <span className="block truncate text-xs font-medium text-slate-100">
                              {bg.name}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {bg.prompt}
                            </span>
                          </button>
                          <span className="text-[10px] text-sky-300">2c</span>
                          {dealerId && (
                            <button
                              type="button"
                              onClick={() => removeBg(bg.id)}
                              className="text-[11px] text-slate-500 transition hover:text-rose-400"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 grid gap-2">
                  <input
                    value={bgName}
                    onChange={(e) => setBgName(e.target.value)}
                    placeholder="Name — e.g. My forecourt"
                    className="studio-input text-sm"
                  />
                  <textarea
                    value={bgDesc}
                    onChange={(e) => setBgDesc(e.target.value)}
                    rows={2}
                    placeholder="Describe the backdrop — e.g. clean grey studio wall with soft lighting"
                    className="studio-input text-sm"
                  />
                  <button
                    type="button"
                    onClick={saveBg}
                    disabled={bgSaving || bgName.trim().length < 2 || bgDesc.trim().length < 3}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    {bgSaving ? "Saving…" : "Save background"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick badges */}
          {activeTool === "badges" && (
            <div>
              <p className="text-xs text-slate-500">
                Ready-made overlays — add one, then drag and resize it on the photo.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {badgeStarters.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => addBadge(b)}
                    disabled={!cover}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    + {b.label}
                  </button>
                ))}
              </div>
              {!cover && <p className="mt-2 text-xs text-slate-500">Upload a cover photo first.</p>}
            </div>
          )}

          {/* Trust seals */}
          {activeTool === "seals" && (
            <div>
              <p className="text-xs text-slate-500">
                Generic badges — add one, then drag it into place. For official AA
                or DoneDeal logos, upload your PNG from the Photo tool.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sealPresets.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => addSeal(s)}
                    disabled={!cover}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    + {s.top} {s.big}
                    {s.sub ? ` ${s.sub}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Border */}
          {activeTool === "border" && (
            <div>
              <p className="text-xs text-slate-500">
                Add a frame, then pick its colour. Saved with the template.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {FRAME_STYLES.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFrame((prev) => ({ ...prev, style: f.key }))}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      frame.style === f.key
                        ? "border-sky-400 bg-sky-500/20 text-white"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                Colour
                <input
                  type="color"
                  value={frame.color}
                  onChange={(e) => setFrame((prev) => ({ ...prev, color: e.target.value }))}
                  className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                />
              </label>
            </div>
          )}

          {/* Selected layer */}
          {activeTool === "layers" && (
            <div>
              {selected ? (
                <div className="space-y-3 text-sm">
                  <label className="block text-slate-300">
                    Size ({Math.round(selected.widthPct * 100)}%)
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={Math.round(selected.widthPct * 100)}
                      onChange={(e) =>
                        updateItem(selected.id, { widthPct: Number(e.target.value) / 100 })
                      }
                      className="mt-1 w-full accent-sky-500"
                    />
                  </label>
                  <label className="block text-slate-300">
                    Opacity ({Math.round(selected.opacity * 100)}%)
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(selected.opacity * 100)}
                      onChange={(e) =>
                        updateItem(selected.id, { opacity: Number(e.target.value) / 100 })
                      }
                      className="mt-1 w-full accent-sky-500"
                    />
                  </label>
                  <button
                    onClick={() => removeItem(selected.id)}
                    className="text-xs text-slate-500 hover:text-red-400"
                  >
                    Remove layer
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Click a badge or seal on the photo to select it, then adjust it here.
                </p>
              )}
              {items.length > 0 && (
                <div className="mt-4 space-y-1">
                  {items.map((it, i) => (
                    <button
                      key={it.id}
                      onClick={() => setSelectedId(it.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                        it.id === selectedId
                          ? "border-sky-400/50 bg-sky-500/10 text-white"
                          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.src} alt="" className="h-6 w-6 rounded object-contain" crossOrigin="anonymous" />
                      Layer {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Templates */}
          {activeTool === "templates" && (
            <div>
              <div className="flex gap-2">
                <input
                  value={patternName}
                  onChange={(e) => setPatternName(e.target.value)}
                  placeholder="Template name"
                  className="studio-input py-1.5 text-sm"
                />
                <button
                  onClick={savePattern}
                  disabled={!patternName.trim() || items.length === 0 || saving}
                  className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
              {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
              <div className="mt-3 space-y-2">
                {patterns.length === 0 && (
                  <p className="text-xs text-slate-500">No saved templates yet.</p>
                )}
                {patterns.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
                  >
                    <span className="truncate text-sm text-slate-200">{p.name}</span>
                    <span className="text-xs text-slate-500">{p.items.length} item(s)</span>
                    <button
                      onClick={() => applyPattern(p)}
                      className="ml-auto text-xs text-sky-400 hover:text-sky-300"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => deletePattern(p.id)}
                      className="text-xs text-slate-500 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {dealerId
                  ? "Templates save the overlays and border. Reuse one on any car — just swap the background photo."
                  : "Templates are saved in this browser for now. Build one, reuse it on any cover photo."}
              </p>
            </div>
          )}

          {/* Set as vehicle cover */}
          {activeTool === "cover" && canSetCover && (
            <div>
              <p className="text-xs text-slate-500">
                Save this finished image as the cover photo of a car in your inventory.
              </p>
              <div className="mt-3 space-y-2">
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  disabled={!cover}
                  className="studio-input py-1.5 text-sm disabled:opacity-40"
                >
                  <option value="">Choose a vehicle…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={saveAsCover}
                  disabled={!cover || !vehicleId || coverSaving}
                  className="w-full rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
                >
                  {coverSaving ? "Saving…" : "Save as cover"}
                </button>
              </div>
              {coverMsg && <p className="mt-2 text-xs text-slate-300">{coverMsg}</p>}
              {vehicles.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  No vehicles found in your inventory yet.
                </p>
              )}
            </div>
          )}
        </StudioProperties>
    </StudioShell>
  );
}
