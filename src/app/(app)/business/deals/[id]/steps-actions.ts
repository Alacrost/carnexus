"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireSession} from "@/lib/auth";
import { createSalesClient as createClient } from "@/lib/sales-client";
export async function removeInterest(input:{id:string;version:number}):Promise<{error?:string}>{
  const session=await requireSession();
  if(!z.object({id:z.string().uuid(),version:z.number().int().positive()}).safeParse(input).success)return {error:"Invalid interest reference."};
  const db=await createClient();const {error}=await db.rpc("remove_vehicle_interest",{p_dealer:session.dealer.id,p_deal:input.id,p_version:input.version});
  if(error)return {error:error.code==="23503"?"Linked tasks, appointments or quotes prevent deletion. Keep the record and use Cancel Deal.":error.message==="stale_deal"?"The Deal changed. Reload before removing it.":"Only Vehicle Interest without financial history can be removed. Check access and migration 082."};
  revalidatePath('/business/deals');return {};
}
const schema=z.object({dealId:z.string().uuid(),id:z.string().uuid().nullable(),version:z.number().int().positive(),date:z.iso.date(),followUpDate:z.union([z.literal(""),z.iso.date()]),status:z.enum(['Initial Contact','Test Drive','Proposal','Negotiation','After Sales Service','Deal Canceled','Vehicle Interests','Closing']),note:z.string().max(4000),action:z.string().max(4000),requestId:z.string().uuid()});
export async function saveFollowUpStep(input:z.infer<typeof schema>):Promise<{error?:string}>{
  const session=await requireSession();

  const parsed=schema.safeParse(input);if(!parsed.success)return {error:"Check the date, status and text (maximum 4,000 characters per field)."};
  const {dealId,id,version,requestId,...data}=parsed.data;const db=await createClient();
  const {error}=await db.rpc("save_deal_follow_up_step",{p_dealer:session.dealer.id,p_deal:dealId,p_id:id,p_version:version,p_input:data,p_request:requestId});
  if(error)return {error:error.message==="stale_step"?"This step changed. Reload before editing again.":"Could not save the step. Check your access and migration 079."};
  revalidatePath(`/business/deals/${dealId}`);return {};
}
