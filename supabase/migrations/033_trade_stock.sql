-- Autonexus 033: two stocks (Main vs Trade) + trade-in / part-exchange support.
-- A part-exchange creates a vehicle in TRADE stock and a purchase order line on the deal
-- (is_trade_in). The deal's SIV (net equity) reduces the customer's cost to change.
-- deal_orders already has is_trade_in/settlement_amount/net_equity (migration 026).

alter table public.vehicles
  add column if not exists stock_class text not null default 'main'
    check (stock_class in ('main', 'trade'));

create index if not exists vehicles_dealer_stock_class_idx on public.vehicles (dealer_id, stock_class);
