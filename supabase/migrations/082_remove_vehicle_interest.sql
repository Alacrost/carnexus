create function public.remove_vehicle_interest(p_dealer uuid,p_deal uuid,p_version integer) returns void
language plpgsql security definer set search_path=public as $$
declare d public.deals;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into d from public.deals where id=p_deal and dealer_id=p_dealer for update;
  if not found or d.status<>'vehicle_interest' then raise exception 'interest_only_removal'; end if;
  if d.version is distinct from p_version then raise exception 'stale_deal'; end if;
  if exists(select 1 from public.payments where deal_id=p_deal) or exists(select 1 from public.purchase_orders where deal_id=p_deal)
    or exists(select 1 from public.deal_orders where deal_id=p_deal and is_trade_in)
    or exists(select 1 from public.deal_documents where deal_id=p_deal and kind<>'quote')
    or exists(select 1 from public.deal_addons where deal_id=p_deal) then raise exception 'interest_has_financial_history'; end if;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'vehicle_interest_deleted','deal',p_deal,
    jsonb_build_object('deal',to_jsonb(d),'steps',(select jsonb_agg(to_jsonb(s)) from public.deal_follow_up_steps s where deal_id=p_deal),'events',(select jsonb_agg(to_jsonb(e)) from public.deal_events e where deal_id=p_deal)));
  delete from public.deal_follow_up_steps where deal_id=p_deal and dealer_id=p_dealer;
  -- Other linked operations retain their foreign-key protections and block deletion.
  delete from public.deals where id=p_deal and dealer_id=p_dealer;
end $$;
revoke all on function public.remove_vehicle_interest(uuid,uuid,integer) from public,anon;
grant execute on function public.remove_vehicle_interest(uuid,uuid,integer) to authenticated;
