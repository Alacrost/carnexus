create function public.save_deal_internal_notes(p_dealer uuid,p_deal uuid,p_version integer,p_notes text)
returns void language plpgsql security definer set search_path=public as $$
declare d public.deals;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_notes is null or length(p_notes)>4000 then raise exception 'invalid_notes'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into d from public.deals where id=p_deal and dealer_id=p_dealer for update;
  if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
  if d.version is distinct from p_version then raise exception 'stale_deal'; end if;
  if coalesce(d.notes,'')=p_notes then return; end if;
  update public.deals set notes=nullif(p_notes,''),version=version+1,updated_at=now() where id=p_deal;
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,p_deal,'internal_notes_updated',jsonb_build_object('message','Additional internal notes updated','before',d.notes,'after',p_notes),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'internal_notes_updated','deal',p_deal,jsonb_build_object('before',d.notes,'after',p_notes));
end $$;
revoke all on function public.save_deal_internal_notes(uuid,uuid,integer,text) from public,anon;
grant execute on function public.save_deal_internal_notes(uuid,uuid,integer,text) to authenticated;
