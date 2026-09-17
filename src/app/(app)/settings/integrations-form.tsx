"use client";

import { useActionState } from "react";
import { saveIntegrations, type IntegrationsState } from "./actions";

export interface IntegrationsValues {
  facebook_url: string;
  instagram_url: string;
  website_url: string;
  donedealConfigured: boolean;
}

function Field({
  label,
  name,
  type = "url",
  defaultValue,
  placeholder,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="text-sm">
      <span className="text-slate-300">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 studio-input disabled:opacity-50"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function IntegrationsForm({
  values,
  secretEnabled,
}: {
  values: IntegrationsValues;
  secretEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<IntegrationsState, FormData>(
    saveIntegrations,
    {}
  );

  return (
    <form action={action} className="mt-4 grid gap-5">
      <div className="grid gap-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Social & website
        </p>
        <Field
          label="Facebook page URL"
          name="facebook_url"
          defaultValue={values.facebook_url}
          placeholder="https://facebook.com/yourdealership"
        />
        <Field
          label="Instagram URL"
          name="instagram_url"
          defaultValue={values.instagram_url}
          placeholder="https://instagram.com/yourdealership"
        />
        <Field
          label="Website URL"
          name="website_url"
          defaultValue={values.website_url}
          placeholder="https://yourdealership.ie"
        />
        <span className="text-xs text-slate-500">
          Used by the Social Media Studio and your public promotion pages.
        </span>
      </div>

      <div className="grid gap-4 border-t border-white/5 pt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          DoneDeal
        </p>
        <Field
          label="DoneDeal API key"
          name="donedeal_api_key"
          type="password"
          placeholder={
            secretEnabled
              ? values.donedealConfigured
                ? "•••••••• stored securely — leave blank to keep"
                : "Paste your DoneDeal API key"
              : "Server storage not configured"
          }
          disabled={!secretEnabled}
          hint={
            secretEnabled
              ? "Stored encrypted (AES-256). Live stock sync arrives with the DoneDeal connection — you can save the key now."
              : "Set INTEGRATIONS_ENCRYPTION_KEY on the server to enable secure key storage."
          }
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-gradient disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save integrations"}
        </button>
        {state.saved && <span className="text-sm text-emerald-400">Saved.</span>}
        {state.error && <span className="text-sm text-rose-400">{state.error}</span>}
      </div>
    </form>
  );
}
