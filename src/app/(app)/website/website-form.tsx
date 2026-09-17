"use client";

import { useActionState } from "react";
import { saveWebsiteSettings, type WebsiteState } from "./actions";

interface Values {
  enabled: boolean;
  headline: string | null;
  subheadline: string | null;
  about: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  theme_color: string | null;
  donedeal_seller_url: string | null;
}

export function WebsiteForm({ values }: { values: Values }) {
  const [state, action] = useActionState<WebsiteState, FormData>(saveWebsiteSettings, {});
  const inp = "mt-1 studio-input";

  return (
    <form action={action} className="mt-4 space-y-4">
      <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <input type="checkbox" name="enabled" defaultChecked={values.enabled} className="h-4 w-4" />
        <span className="text-sm text-slate-200">Publish the website (visible to the public)</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2"><span className="text-slate-300">Headline</span>
          <input name="headline" defaultValue={values.headline ?? ""} className={inp} placeholder="Quality used cars in Dublin" /></label>
        <label className="text-sm sm:col-span-2"><span className="text-slate-300">Subheadline</span>
          <input name="subheadline" defaultValue={values.subheadline ?? ""} className={inp} /></label>
        <label className="text-sm sm:col-span-2"><span className="text-slate-300">About</span>
          <textarea name="about" rows={3} defaultValue={values.about ?? ""} className={inp} /></label>
        <label className="text-sm"><span className="text-slate-300">Phone</span>
          <input name="phone" defaultValue={values.phone ?? ""} className={inp} /></label>
        <label className="text-sm"><span className="text-slate-300">WhatsApp</span>
          <input name="whatsapp" defaultValue={values.whatsapp ?? ""} className={inp} /></label>
        <label className="text-sm"><span className="text-slate-300">Email</span>
          <input name="email" defaultValue={values.email ?? ""} className={inp} /></label>
        <label className="text-sm"><span className="text-slate-300">Theme colour</span>
          <input name="theme_color" type="text" defaultValue={values.theme_color ?? "#0ea5e9"} className={inp} placeholder="#0ea5e9" /></label>
        <label className="text-sm sm:col-span-2"><span className="text-slate-300">DoneDeal seller URL</span>
          <input name="donedeal_seller_url" defaultValue={values.donedeal_seller_url ?? ""} className={inp} placeholder="https://donedeal.ie/dealer/…" /></label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-gradient">Save website</button>
        {state.saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
        {state.error && <span className="text-sm text-rose-400">{state.error}</span>}
      </div>
    </form>
  );
}
