-- PO-backed stock provenance and canonical vendor/lender payables.

alter table public.vehicles
  add column originating_po_id uuid references public.purchase_orders(id) on delete restrict,
  add column provenance_status text not null default 'legacy_unresolved'
    check(provenance_status in ('verified','legacy_unresolved'));
create unique index vehicle_one_originating_po on public.vehicles(originating_po_id)
  where originating_po_id is not null;

-- Link only where the database already contains exactly one current, non-cancelled PO.
-- Ambiguous or absent evidence stays visible as unresolved legacy stock.
with evidenced as (
  select vehicle_id,(array_agg(id order by created_at desc))[1] po_id
  from public.purchase_orders
  where vehicle_id is not null and status<>'cancelled'
  group by vehicle_id having count(*)=1
)
update public.vehicles v set originating_po_id=e.po_id,provenance_status='verified'
from evidenced e where e.vehicle_id=v.id;

create function public.guard_vehicle_provenance() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.originating_po_id is distinct from old.originating_po_id then
    if new.originating_po_id is null then raise exception 'vehicle_origin_immutable';end if;
    if not exists(select 1 from public.purchase_orders po where po.id=new.originating_po_id and po.vehicle_id=new.id and po.dealer_id=new.dealer_id) then raise exception 'invalid_vehicle_origin';end if;
    if old.originating_po_id is not null and not exists(
      select 1 from public.purchase_orders replacement join public.purchase_orders original on original.id=old.originating_po_id
      where replacement.id=new.originating_po_id and replacement.replaces_po_id=original.id
        and replacement.vehicle_id=new.id and replacement.dealer_id=new.dealer_id and original.status='cancelled'
    ) then raise exception 'vehicle_origin_immutable';end if;
  end if;
  if (new.originating_po_id is null and new.provenance_status<>'legacy_unresolved')
    or (new.originating_po_id is not null and new.provenance_status<>'verified') then raise exception 'invalid_provenance_status';end if;
  return new;
end $$;
create trigger guard_vehicle_provenance before update of originating_po_id,provenance_status on public.vehicles
  for each row execute function public.guard_vehicle_provenance();

-- Stock creation/deletion/status transitions are owned by acquisition, preparation and
-- Deal commands. Existing public presentation remains select-only.
revoke insert,update,delete on public.vehicles from authenticated,anon;
grant select(originating_po_id,provenance_status) on public.vehicles to authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v050;
revoke all on function public.commercial_command_v050(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;vehicle_id uuid;po_id uuid;
begin
  result:=public.commercial_command_v050(p_dealer,p_command,p_id,p_input,p_request);
  if p_command in ('purchase','trade') then
    vehicle_id:=(result->>'vehicleId')::uuid;po_id:=(result->>'id')::uuid;
    update public.vehicles set originating_po_id=po_id,provenance_status='verified',status='preparation'
      where id=vehicle_id and dealer_id=p_dealer and originating_po_id is null;
    if not found and not exists(select 1 from public.vehicles where id=vehicle_id and dealer_id=p_dealer and originating_po_id=po_id) then raise exception 'purchase_vehicle_provenance_failed';end if;
  elsif p_command='return_trade_sale' then
    vehicle_id:=(result->>'retainedTradeVehicleId')::uuid;po_id:=(result->>'replacementPoId')::uuid;
    update public.vehicles set originating_po_id=po_id,provenance_status='verified',status='preparation'
      where id=vehicle_id and dealer_id=p_dealer and originating_po_id is distinct from po_id;
    if not found and not exists(select 1 from public.vehicles where id=vehicle_id and dealer_id=p_dealer and originating_po_id=po_id) then raise exception 'replacement_vehicle_provenance_failed';end if;
  end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create function public.purchase_payable_rows(p_dealer uuid)
returns table(
  id uuid,po_no text,status text,source text,created_at timestamptz,due_on date,
  vendor text,vehicle_id uuid,car text,vehicle_status text,total numeric,trade_credit numeric,
  vendor_due numeric,finance_due numeric,vendor_paid numeric,finance_paid numeric,
  paid numeric,outstanding numeric,vendor_outstanding numeric,finance_outstanding numeric,to_be_paid numeric,payment_state text,
  finance_company text,finance_reference text
) language sql stable security definer set search_path=public as $$
  select po.id,po.po_no,po.status,case when po.deal_id is null then 'direct' else 'trade_in' end,po.created_at,po.due_on,
    coalesce(c.name,'—'),v.id,concat_ws(' ',v.year,v.make,v.model,nullif(v.registration,'')),v.status::text,
    coalesce(lines.total,0),po.trade_credit,
    greatest(coalesce(lines.total,0)-po.trade_credit-po.settlement_due,0),po.settlement_due,
    coalesce(pay.vendor,0),coalesce(pay.finance,0),
    coalesce(pay.vendor,0)+coalesce(pay.finance,0),
    case when po.status='cancelled' then 0 else greatest(coalesce(lines.total,0)-po.trade_credit-coalesce(pay.vendor,0)-coalesce(pay.finance,0),0) end,
    case when po.status='cancelled' then 0 else greatest(coalesce(lines.total,0)-po.trade_credit-po.settlement_due-coalesce(pay.vendor,0),0) end,
    case when po.status='cancelled' then 0 else greatest(po.settlement_due-coalesce(pay.finance,0),0) end,
    case when po.status='cancelled' then 0 else greatest(coalesce(lines.total,0)-po.trade_credit-coalesce(pay.vendor,0)-coalesce(pay.finance,0),0) end,
    case when po.status='cancelled' then 'reversed'
      when greatest(coalesce(lines.total,0)-po.trade_credit-coalesce(pay.vendor,0)-coalesce(pay.finance,0),0)=0 then 'paid'
      when po.due_on is not null and po.due_on<current_date then 'overdue'
      when coalesce(pay.vendor,0)+coalesce(pay.finance,0)>0 then 'partially_paid'
      else 'unpaid' end,
    po.finance_company,po.finance_reference
  from public.purchase_orders po
  left join public.customers c on c.id=po.vendor_id and c.dealer_id=po.dealer_id
  left join public.vehicles v on v.id=po.vehicle_id and v.dealer_id=po.dealer_id
  left join lateral(select sum(gross) total from public.po_lines where po_id=po.id) lines on true
  left join lateral(select
    sum(case when entry_kind='reversal' then -amount else amount end) filter(where recipient='vendor') vendor,
    sum(case when entry_kind='reversal' then -amount else amount end) filter(where recipient='finance') finance
    from public.po_payments where po_id=po.id) pay on true
  where po.dealer_id=p_dealer;
$$;
revoke all on function public.purchase_payable_rows(uuid) from public,anon,authenticated;

create or replace function public.purchase_balances(p_dealer uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then raise exception 'commercial_not_allowed';end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.due_on nulls last,r.po_no) from public.purchase_payable_rows(p_dealer) r where r.status<>'cancelled'),'[]'::jsonb);
end $$;

create function public.purchase_payable_report(p_dealer uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare summary jsonb;positions jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'cost') then raise exception 'commercial_not_allowed';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'invalid_report_period';end if;
  select jsonb_build_object(
    'acquisitionValue',coalesce(sum(total) filter(where status<>'cancelled' and created_at::date between p_from and p_to),0),
    'vendorPaid',coalesce((select sum(case when pp.entry_kind='reversal' then -pp.amount else pp.amount end) from public.po_payments pp join public.purchase_orders po on po.id=pp.po_id where po.dealer_id=p_dealer and pp.recipient='vendor' and pp.paid_on between p_from and p_to),0),
    'financePaid',coalesce((select sum(case when pp.entry_kind='reversal' then -pp.amount else pp.amount end) from public.po_payments pp join public.purchase_orders po on po.id=pp.po_id where po.dealer_id=p_dealer and pp.recipient='finance' and pp.paid_on between p_from and p_to),0),
    'vendorOutstanding',coalesce(sum(vendor_outstanding),0),'financeOutstanding',coalesce(sum(finance_outstanding),0),
    'toBePaid',coalesce(sum(to_be_paid),0),
    'overdue',coalesce(sum(to_be_paid) filter(where payment_state='overdue'),0),
    'dueSoon',coalesce(sum(to_be_paid) filter(where due_on between current_date and current_date+30),0),
    'stockValue',coalesce(sum(total) filter(where status<>'cancelled' and vehicle_status<>'sold'),0),
    'stockUnpaidLiability',coalesce(sum(to_be_paid) filter(where status<>'cancelled' and vehicle_status<>'sold'),0)
  ) into summary from public.purchase_payable_rows(p_dealer);
  select coalesce(jsonb_agg(to_jsonb(r) order by case r.payment_state when 'overdue' then 0 when 'unpaid' then 1 when 'partially_paid' then 2 else 3 end,r.due_on nulls last,r.po_no),'[]'::jsonb)
    into positions from public.purchase_payable_rows(p_dealer) r where r.status<>'cancelled';
  return jsonb_build_object('summary',summary,'positions',positions,'period',jsonb_build_object('from',p_from,'to',p_to));
end $$;
revoke all on function public.purchase_payable_report(uuid,date,date) from public,anon;
grant execute on function public.purchase_payable_report(uuid,date,date) to authenticated;
