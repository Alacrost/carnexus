-- Internal idempotency and identity tables are used only by guarded definer RPCs.
-- Keep their existing revoked API grants and add deny-by-default row protection.
alter table public.customer_intake_requests enable row level security;
alter table public.deal_sheet_requests enable row level security;
alter table public.deal_sheet_trade_requests enable row level security;
alter table public.location_requests enable row level security;
alter table public.new_deal_sessions enable row level security;
alter table public.open_deal_pairs enable row level security;
alter table public.sales_quote_requests enable row level security;

-- Hosted defaults can grant EXECUTE to anon explicitly. Revoking PUBLIC alone
-- does not remove that grant; preserve the authenticated, guarded payment path.
revoke execute on function public.remove_deal_payment(uuid,uuid,uuid) from public, anon;
grant execute on function public.remove_deal_payment(uuid,uuid,uuid) to authenticated;
