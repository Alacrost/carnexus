"use client";

import { useActionState } from "react";
import { saveBusinessProfile, type BusinessProfileState } from "../actions";

export interface BusinessValues {
  opening_hours: string;
  warranty_info: string;
  whats_included: string;
  extra_services: string;
  phone: string;
  whatsapp: string;
  email: string;
  website_url: string;
  social_links: string;
  finance_available: boolean;
  finance_details: string;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="studio-surface p-6">
      <h2 className="font-medium text-slate-100">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
      <div className="mt-4 grid gap-4">{children}</div>
    </div>
  );
}

function Area({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="text-sm">
      <span className="text-slate-300">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 studio-input"
      />
    </label>
  );
}

function Text({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-sm">
      <span className="text-slate-300">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 studio-input"
      />
    </label>
  );
}

export function BusinessForm({ initial }: { initial: BusinessValues }) {
  const [state, formAction, pending] = useActionState<BusinessProfileState, FormData>(
    saveBusinessProfile,
    {}
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.saved && (
        <p className="rounded-xl border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-300">
          Business setup saved.
        </p>
      )}
      {state.error && (
        <p className="rounded-xl border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <Section
        title="Hours & the deal"
        hint="What buyers get and when you're open. The AI weaves this into ads."
      >
        <Area
          label="Opening hours"
          name="opening_hours"
          defaultValue={initial.opening_hours}
          placeholder="Mon–Fri 9am–6pm · Sat 10am–5pm · Sun closed"
        />
        <Area
          label="Warranty offered"
          name="warranty_info"
          defaultValue={initial.warranty_info}
          placeholder="e.g. 12-month comprehensive warranty on all cars; 24-month available on selected models."
        />
        <Area
          label="What's included / not charged"
          name="whats_included"
          defaultValue={initial.whats_included}
          placeholder="e.g. Full valet, fresh NCT, service history check. No admin or documentation fees."
        />
        <Area
          label="Extra services & benefits on the sale"
          name="extra_services"
          defaultValue={initial.extra_services}
          placeholder="e.g. Nationwide delivery, part-exchange welcome, aftercare bookings."
        />
      </Section>

      <Section
        title="Contact & social"
        hint="How buyers reach you. Included in ads and posts where relevant."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Text
            label="Phone"
            name="phone"
            defaultValue={initial.phone}
            placeholder="+353 1 555 0100"
          />
          <Text
            label="WhatsApp"
            name="whatsapp"
            defaultValue={initial.whatsapp}
            placeholder="+353 86 555 0100"
          />
          <Text
            label="Email"
            name="email"
            type="email"
            defaultValue={initial.email}
            placeholder="sales@yourdealership.ie"
          />
          <Text
            label="Website"
            name="website_url"
            type="url"
            defaultValue={initial.website_url}
            placeholder="https://yourdealership.ie"
          />
        </div>
        <Area
          label="Social pages"
          name="social_links"
          defaultValue={initial.social_links}
          placeholder={"facebook.com/yourdealership\ninstagram.com/yourdealership"}
          rows={3}
        />
      </Section>

      <Section
        title="Finance"
        hint="If you arrange finance, describe the basics and requirements."
      >
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            name="finance_available"
            defaultChecked={initial.finance_available}
            className="h-4 w-4 accent-sky-500"
          />
          We offer / arrange finance
        </label>
        <Area
          label="Finance rules & requirements"
          name="finance_details"
          defaultValue={initial.finance_details}
          placeholder="e.g. From €59/week, all credit situations considered. Requires: over 21, valid Irish licence, proof of income and address. Terms 12–60 months."
          rows={4}
        />
      </Section>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500 to-sky-600 px-5 py-2.5 font-medium text-white shadow-[0_10px_30px_-12px_var(--glow)] transition hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save business setup"}
      </button>
    </form>
  );
}
