"use server";

import { commercialCommand } from "@/lib/commercial-server";
import { revalidatePath } from "next/cache";

export async function saveTaxSettings(input: { defaultVatScheme: string; standardVatRate: number }) {
  const result = await commercialCommand("tax_settings", null, input);
  if (!result.error) revalidatePath("/settings", "layout");
  return result;
}
