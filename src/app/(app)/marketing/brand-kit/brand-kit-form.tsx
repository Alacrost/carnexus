"use client";

import { useActionState } from "react";
import { saveBrandKit, type BrandKitState } from "../actions";

const inputCls =
  "mt-1 studio-input";

interface BrandKitValues {
  tone_of_voice: string;
  website_url: string;
  primary_color: string;
  logo_position: string;
  logo_size_pct: number;
  logo_opacity_pct: number;
  frame_style: string;
}

export function BrandKitForm({ initial }: { initial: BrandKitValues }) {
  const [state, formAction, pending] = useActionState<BrandKitState, FormData>(
    saveBrandKit,
    {}
  );

  return (
    <form
      action={formAction}
      className="studio-surface max-w-2xl p-6"
    >
      {state.saved && (
        <p className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-300">
          Brand kit saved.
        </p>
      )}
      {state.error && (
        <p className="mb-4 rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="tone_of_voice" className="text-sm text-slate-300">
            Tone of voice (used by the AI)
          </label>
          <input
            id="tone_of_voice"
            name="tone_of_voice"
            defaultValue={initial.tone_of_voice}
            required
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="website_url" className="text-sm text-slate-300">
            Website
          </label>
          <input
            id="website_url"
            name="website_url"
            type="url"
            placeholder="https://..."
            defaultValue={initial.website_url}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="primary_color" className="text-sm text-slate-300">
            Primary colour
          </label>
          <input
            id="primary_color"
            name="primary_color"
            type="color"
            defaultValue={initial.primary_color}
            className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-[var(--line)] bg-white/[0.05]"
          />
        </div>

        <div>
          <label htmlFor="logo_position" className="text-sm text-slate-300">
            Logo position on photos
          </label>
          <select
            id="logo_position"
            name="logo_position"
            defaultValue={initial.logo_position}
            className={inputCls}
          >
            <option value="bottom_right">Bottom right</option>
            <option value="bottom_left">Bottom left</option>
            <option value="top_right">Top right</option>
            <option value="top_left">Top left</option>
            <option value="center">Center (watermark)</option>
          </select>
        </div>

        <div>
          <label htmlFor="frame_style" className="text-sm text-slate-300">
            Frame style
          </label>
          <select
            id="frame_style"
            name="frame_style"
            defaultValue={initial.frame_style}
            className={inputCls}
          >
            <option value="none">None</option>
            <option value="banner_bottom">Banner (bottom)</option>
            <option value="banner_top">Banner (top)</option>
            <option value="border">Border</option>
          </select>
        </div>

        <div>
          <label htmlFor="logo_size_pct" className="text-sm text-slate-300">
            Logo size (% of image width)
          </label>
          <input
            id="logo_size_pct"
            name="logo_size_pct"
            type="number"
            min={4}
            max={40}
            defaultValue={initial.logo_size_pct}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="logo_opacity_pct" className="text-sm text-slate-300">
            Logo opacity (%)
          </label>
          <input
            id="logo_opacity_pct"
            name="logo_opacity_pct"
            type="number"
            min={10}
            max={100}
            defaultValue={initial.logo_opacity_pct}
            className={inputCls}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 rounded-lg bg-sky-500 px-5 py-2.5 font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save brand kit"}
      </button>
      <p className="mt-3 text-xs text-slate-500">
        Logo upload arrives with photo enhancement. These rules control where and
        how your logo is applied to every enhanced photo.
      </p>
    </form>
  );
}
