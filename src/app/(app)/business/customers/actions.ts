"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { createSalesClient } from "@/lib/sales-client";
import { can } from "@/lib/types";
import { commercialPermission } from "@/lib/commercial-server";

export interface CustomerMatch {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  data_consent?: string | null;
  ddi_phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  address?: string | null;
  address2?: string | null;
  town?: string | null;
  county?: string | null;
  post_code?: string | null;
  country?: string | null;
  vat_number?: string | null;
  notes?: string | null;
}

// Autocomplete: find existing parties by name/phone/email.
export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  const session = await requireSession();
  if (!can.manageDeals(session.role) || !(await commercialPermission("read"))) return [];
  const q = query.trim().slice(0,120).replace(/[\\%_(),"]/g," ").trim();
  if (q.length < 2) return [];

  const supabase = await createSalesClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, name, type, phone, email, title, first_name, last_name, business_name, job_title, data_consent, ddi_phone, fax, mobile, address_line1, address_line2, city, county, eircode, country, vat_number, notes",
    )
    .eq("dealer_id", session.dealer.id)
    .is("deleted_at", null)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,business_name.ilike.%${q}%`)
    .order("name")
    .limit(6);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    phone: r.phone,
    email: r.email,
    title: r.title,
    first_name: r.first_name,
    last_name: r.last_name,
    company: r.business_name,
    job_title: r.job_title,
    data_consent: r.data_consent,
    ddi_phone: r.ddi_phone,
    fax: r.fax,
    mobile: r.mobile,
    address: r.address_line1,
    address2: r.address_line2,
    town: r.city,
    county: r.county,
    post_code: r.eircode,
    country: r.country,
    vat_number: r.vat_number,
    notes: r.notes,
  }));
}

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["individual", "business"]).optional(),
  business_name: z.string().trim().max(120).optional(),
  vat_number: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional(),
  address_line1: z.string().trim().max(500).optional(),
  address_line2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  county: z.string().trim().max(80).optional(),
  eircode: z.string().trim().max(16).optional(),
});

export async function createCustomer(input: z.infer<typeof customerSchema>): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  if (!can.manageDeals(session.role) || !(await commercialPermission("work"))) return { error: "Not allowed." };
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least a name." };
  if (isDemoMode()) return { id: crypto.randomUUID() };

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      dealer_id: session.dealer.id,
      name: d.name,
      type: d.type ?? "individual",
      business_name: d.business_name || null,
      vat_number: d.vat_number || null,
      phone: d.phone || null,
      email: d.email || null,
      address_line1: d.address_line1 || null,
      address_line2: d.address_line2 || null,
      city: d.city || null,
      county: d.county || null,
      eircode: d.eircode || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not save the contact." };
  revalidatePath("/business/customers");
  return { id: data.id };
}
