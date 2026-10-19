"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";

const commandSchema = z.object({
  command: z.enum(["add_item","set_item","assign","complete"]),
  preparationId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  itemId: z.string().uuid().optional(),
  status: z.enum(["pending","in_progress","done","skipped"]).optional(),
  category: z.enum(["cleaning","photos","service","maintenance","bodywork","other"]).optional(),
  title: z.string().trim().min(2).max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  assignedTo: z.string().uuid().or(z.literal("")).optional(),
  requestId: z.string().uuid(),
});
const errors:Record<string,string>={
  preparation_not_allowed:"You are not a member of the preparation team.",stale_preparation:"This checklist changed. Refresh and review it.",
  preparation_items_pending:"Complete every required item and finish or skip the additional work first.",preparation_photos_required:"Upload at least one real vehicle photo before completing the photo step.",
  preparation_closed:"This preparation is complete and retained as read-only history.",
  invalid_preparation_status:"A required step cannot be skipped.",invalid_preparation_item:"Check the preparation item details.",invalid_preparation_assignee:"Choose an active preparation-team member.",
};
export async function runPreparationCommand(input:z.infer<typeof commandSchema>){
  const parsed=commandSchema.safeParse(input);if(!parsed.success)return {error:"Review the preparation update."};
  if(isDemoMode())return {error:"Preview only — no preparation update was saved."};
  const session=await requireSession();const db=await createClient();
  const {command,preparationId,requestId,expectedVersion,...data}=parsed.data;
  const {data:result,error}=await db.rpc("preparation_command",{p_dealer:session.dealer.id,p_command:command,p_preparation:preparationId,p_input:{expectedVersion,...data},p_request:requestId});
  if(error)return {error:errors[error.message]??"Could not update preparation."};
  revalidatePath("/inventory/preparation");revalidatePath("/inventory","layout");
  return result as {id:string;status?:string};
}
export async function setPreparationTeamMember(userId:string,enabled:boolean){
  const parsed=z.string().uuid().safeParse(userId);if(!parsed.success)return {error:"Invalid team member."};
  if(isDemoMode())return {error:"Preview only."};
  const session=await requireSession();const db=await createClient();
  const {error}=await db.rpc("set_preparation_team_member",{p_dealer:session.dealer.id,p_user:parsed.data,p_enabled:enabled});
  if(error)return {error:errors[error.message]??"Could not update the preparation team."};
  revalidatePath("/inventory/preparation");return {};
}
