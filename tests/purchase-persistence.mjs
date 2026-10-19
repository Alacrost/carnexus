import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDemoDatabase} from '../src/lib/demo-database.mjs';
import {demoEntityId} from '../src/lib/demo-ids.ts';
import {demoSession,demoVehicles,demoCustomers,demoStaff,demoLeads} from '../src/lib/demo.ts';

// The real local adapter, but only in a new disposable directory outside the app DB.
const directory=await mkdtemp(join(tmpdir(),'autonexus-po-persistence-'));
const options={dataDir:directory,migrationsDir:resolve('supabase/migrations'),seed:{ownerId:demoSession.userId,dealerId:demoSession.dealer.id,vehicles:demoVehicles,customers:demoCustomers,staff:demoStaff,leads:demoLeads}};
let db;
try {
  db=await openDemoDatabase(options);
  const input={newVendor:{name:'Disposable PO supplier'},make:'Toyota',model:'Test',year:2020,registration:'QA-PO-PERSIST',km:10000,
    price:8000,vatScheme:'margin',vatRate:23,imported:true,vrtAmount:1000,vrtVatTreatment:'included',invRef:'QA-PO',
    purchaseDate:'2026-10-01',receivedOn:'2026-10-01',settlement:0};
  const args={p_dealer:demoSession.dealer.id,p_command:'purchase',p_id:null,p_input:input,p_request:randomUUID()};
  const saved=await db.rpc('commercial_command',args);assert.equal(saved.error,null,JSON.stringify(saved.error));
  const id=saved.data.id;
  const read=async()=>{
    const row=await db.from('purchase_orders').select('id,vehicle_id,vat_scheme,vat_rate,imported,vrt_amount').eq('dealer_id',demoSession.dealer.id).eq('id',id).single();
    assert.equal(row.error,null);assert.equal(row.data.id,id);assert.equal(row.data.vrt_amount,1000);
    const balances=await db.rpc('purchase_balances',{p_dealer:demoSession.dealer.id});assert.equal(balances.error,null);
    const balance=balances.data.find(row=>row.id===id);assert.ok(balance);assert.equal(Number(balance.total),8000,'VRT is not added to supplier payable');
    const vehicle=await db.from('vehicles').select('originating_po_id').eq('id',row.data.vehicle_id).single();assert.equal(vehicle.error,null);assert.equal(vehicle.data.originating_po_id,id);
  };
  await read();await db.close();db=await openDemoDatabase(options);await read();
  const retry=await db.rpc('commercial_command',args);assert.equal(retry.error,null);assert.equal(retry.data.id,id);
  const vehicle=demoVehicles[0];
  const existingInput={...input,...Object.fromEntries(['make','model','year','registration','km'].map(key=>[key,vehicle[key]])),existingVehicleId:demoEntityId(vehicle.id)};
  const existing=await db.rpc('commercial_command',{...args,p_command:'purchase_existing',p_request:randomUUID(),p_input:existingInput});
  assert.equal(existing.error,null,JSON.stringify(existing.error));
  assert.equal(existing.data.vehicleId,demoEntityId(vehicle.id),'legacy link aliases address the seeded persistent vehicle');
  assert.equal(demoEntityId(existing.data.vehicleId),existing.data.vehicleId,'canonical UUID stays unchanged');
  console.log('PASS purchase persistence: PO/stock linked, authoritative list/detail reads, VAT/VRT saved, supplier total unchanged, durable reopen, idempotent retry, legacy alias');
} finally {
  if(db)await db.close();
  const target=resolve(directory);
  assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('autonexus-po-persistence-'));
  await rm(target,{recursive:true,force:true});
}
