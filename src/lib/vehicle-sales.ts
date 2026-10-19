import type {createSalesClient} from "./sales-client";

export function isOpenVehicleDeal(status:string){
  return !["completed","cancelled","reversed"].includes(status);
}

/** Simple, dealer-scoped reads work in both Supabase and the local sales demo. */
export async function loadVehicleSales(db:Awaited<ReturnType<typeof createSalesClient>>,dealerId:string,vehicleId:string){
  const orders=await db.from("deal_orders").select("deal_id").eq("dealer_id",dealerId).eq("vehicle_id",vehicleId).eq("kind","sale");
  if(orders.error)throw new Error("Vehicle sales could not load");
  const ids=[...new Set((orders.data??[]).map(order=>order.deal_id))];
  if(!ids.length)return [];
  const deals=await db.from("deals").select("id,deal_no,so_no,status,stage,finance_status,finance_company,salesperson_id,created_at,updated_at,currency,retail_price,customer_id").eq("dealer_id",dealerId).in("id",ids).order("created_at",{ascending:false});
  if(deals.error)throw new Error("Vehicle sales could not load");
  const customerIds=[...new Set((deals.data??[]).map(deal=>deal.customer_id).filter(Boolean))] as string[];
  const customers=customerIds.length?await db.from("customers").select("id,name,phone").eq("dealer_id",dealerId).in("id",customerIds):{data:[],error:null};
  if(customers.error)throw new Error("Vehicle customers could not load");
  const employeeIds=[...new Set((deals.data??[]).map(deal=>deal.salesperson_id).filter(Boolean))] as string[];
  const [employees,trades]=await Promise.all([
    employeeIds.length?db.from("profiles").select("id,full_name").in("id",employeeIds):Promise.resolve({data:[],error:null}),
    db.from("deal_orders").select("deal_id").eq("dealer_id",dealerId).in("deal_id",ids).eq("is_trade_in",true),
  ]);
  const employeeById=new Map((employees.data??[]).map(employee=>[employee.id,employee.full_name]));
  const tradeIds=new Set((trades.data??[]).map(trade=>trade.deal_id));
  const byId=new Map((customers.data??[]).map(customer=>[customer.id,customer]));
  return (deals.data??[]).map(deal=>({...deal,customer:byId.get(deal.customer_id),employee:employees.error?null:employeeById.get(deal.salesperson_id)??null,hasTradeIn:trades.error?null:tradeIds.has(deal.id)}));
}
