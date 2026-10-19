"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireSession} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {isDemoMode} from "@/lib/demo";

const schema=z.object({kind:z.enum(["warranty","finance"]),id:z.union([z.literal(""),z.string().uuid()]),name:z.string().trim().min(2).max(120),text:z.string().trim().min(5).max(3000),active:z.boolean()});
export async function saveDealReference(input:z.infer<typeof schema>):Promise<{error?:string;saved?:boolean}>{
  const parsed=schema.safeParse(input);
  if(!parsed.success||parsed.data.kind==="warranty"&&parsed.data.name.length>100||parsed.data.kind==="finance"&&parsed.data.text.length>500)return{error:"Review the name and terms/address."};
  const session=await requireSession();
  if(!["owner","admin"].includes(session.role))return{error:"Only an owner or admin can manage business options."};
  if(isDemoMode())return{error:"Preview only — connect Supabase to save."};
  const db=await createClient();
  const {error}=await db.rpc("deal_reference_command",{p_dealer:session.dealer.id,p_kind:parsed.data.kind,p_id:parsed.data.id||null,p_name:parsed.data.name,p_text:parsed.data.text,p_active:parsed.data.active});
  if(error)return{error:"Could not save. Check for a duplicate name and apply the latest database migration."};
  revalidatePath("/business/document-settings");revalidatePath("/business/deals","layout");
  return{saved:true};
}
