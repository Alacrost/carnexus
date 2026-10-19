"use server";
import {z} from "zod";
import {requireSession} from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
import {revalidatePath} from "next/cache";
export async function saveInternalNotes(input:{dealId:string;version:number;notes:string}):Promise<{error?:string}>{
  const session=await requireSession();
  const parsed=z.object({dealId:z.string().uuid(),version:z.number().int().positive(),notes:z.string().max(4000)}).safeParse(input);if(!parsed.success)return {error:"Review the notes (maximum 4,000 characters)."};
  const db=await createClient();const {error}=await db.rpc("save_deal_internal_notes",{p_dealer:session.dealer.id,p_deal:input.dealId,p_version:input.version,p_notes:input.notes});
  if(error)return{error:error.message==="stale_deal"?"The Deal changed. Reload before saving.":"Could not save. Check access and migration 081."};
  revalidatePath(`/business/deals/${input.dealId}`,"layout");return {};
}
