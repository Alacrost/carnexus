import "server-only";
import {createClient as createSupabaseClient} from "@/lib/supabase/server";
import {isDemoMode,demoSession,demoVehicles,demoCustomers,demoStaff,demoLeads} from "@/lib/demo";
import type {openDemoDatabase} from "./demo-database.mjs";
type DemoClient=Awaited<ReturnType<typeof openDemoDatabase>>;
const runtime=globalThis as typeof globalThis & {autonexusDemoDatabase?:Promise<DemoClient>;autonexusDemoAdapterVersion?:number};
// Reload the local adapter so existing dev sessions load purchase-defined VAT 095.
const adapterVersion=6;

export async function createSalesClient(){
  if(!isDemoMode())return createSupabaseClient();
  if(!runtime.autonexusDemoDatabase||runtime.autonexusDemoAdapterVersion!==adapterVersion){
    const previous=runtime.autonexusDemoDatabase;
    runtime.autonexusDemoAdapterVersion=adapterVersion;
    runtime.autonexusDemoDatabase=(async()=>{
      // Replace an older hot-reloaded adapter without opening the files twice.
      if(previous)await (await previous).close();
      const {openDemoDatabase}=await import("./demo-database.mjs");
      const {resolve}=await import("node:path");
      return openDemoDatabase({dataDir:resolve(process.cwd(),".autonexus-demo","postgres"),migrationsDir:resolve(process.cwd(),"supabase","migrations"),seed:{ownerId:demoSession.userId,dealerId:demoSession.dealer.id,vehicles:demoVehicles,customers:demoCustomers,staff:demoStaff,leads:demoLeads}});
    })().catch(error=>{delete runtime.autonexusDemoDatabase;throw error;});
  }
  // The adapter is deliberately limited to parameterized reads and existing RPCs.
  // Unsupported operations fail locally; there is no remote fallback in demo mode.
  return await runtime.autonexusDemoDatabase as unknown as Awaited<ReturnType<typeof createSupabaseClient>>;
}
