import { z } from "zod";

// Vendors and buyers share the same contact record. These keys match customers.
export const purchaseVendorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["individual", "business"]).default("business"),
  business_name: z.string().trim().max(120).optional(),
  title: z.string().trim().max(20).optional(),
  first_name: z.string().trim().max(80).optional(),
  last_name: z.string().trim().max(80).optional(),
  job_title: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  mobile: z.string().trim().max(40).optional(),
  ddi_phone: z.string().trim().max(40).optional(),
  fax: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional(),
  address_line1: z.string().trim().max(500).optional(),
  address_line2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  county: z.string().trim().max(80).optional(),
  eircode: z.string().trim().max(16).optional(),
  country: z.enum(["IE", "GB", "CA"]).optional(),
  vat_number: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type PurchaseVendorInput = z.input<typeof purchaseVendorSchema>;
