create table public.deal_follow_up_steps (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id),
  deal_id uuid not null references public.deals(id),
  event_date date not null,
  follow_up_date date,
  status text not null check(status in ('Initial Contact','Test Drive','Proposal','Negotiation','After Sales Service','Deal Canceled','Vehicle Interests','Closing')),
  event_note text not null default '' check(length(event_note)<=4000),
  action text not null default '' check(length(action)<=4000),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deal_follow_up_steps_deal on public.deal_follow_up_steps(dealer_id,deal_id,event_date,created_at);
alter table public.deal_follow_up_steps enable row level security;
revoke all on public.deal_follow_up_steps from public,anon,authenticated;
grant select on public.deal_follow_up_steps to authenticated;
create policy deal_follow_up_steps_read on public.deal_follow_up_steps for select using(public.commercial_allowed(dealer_id,'read'));

create function public.save_deal_follow_up_step(p_dealer uuid,p_deal uuid,p_id uuid,p_version integer,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous public.deal_follow_up_steps; saved public.deal_follow_up_steps; cached public.commercial_requests; payload jsonb; result jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>20000 then raise exception 'invalid_step'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  payload:=jsonb_build_object('deal',p_deal,'id',p_id,'version',p_version,'data',p_input);
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'follow_up_step' or cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  if not exists(select 1 from public.deals where id=p_deal and dealer_id=p_dealer) then raise exception 'deal_missing'; end if;
  if p_id is not null then
    select * into previous from public.deal_follow_up_steps where id=p_id and dealer_id=p_dealer and deal_id=p_deal for update;
    if not found then raise exception 'step_missing'; end if;
    if previous.version is distinct from p_version then raise exception 'stale_step'; end if;
    update public.deal_follow_up_steps set event_date=(p_input->>'date')::date,status=p_input->>'status',event_note=coalesce(p_input->>'note',''),action=coalesce(p_input->>'action',''),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into saved;
  else
    insert into public.deal_follow_up_steps(dealer_id,deal_id,event_date,status,event_note,action,created_by,updated_by)
      values(p_dealer,p_deal,(p_input->>'date')::date,p_input->>'status',coalesce(p_input->>'note',''),coalesce(p_input->>'action',''),auth.uid(),auth.uid()) returning * into saved;
  end if;
  update public.deal_follow_up_steps set follow_up_date=nullif(p_input->>'followUpDate','')::date where id=saved.id returning * into saved;
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,p_deal,case when p_id is null then 'step_created' else 'step_updated' end,
    jsonb_build_object('message',case when p_id is null then 'Follow-up step created: ' else 'Follow-up step updated: ' end||saved.status,'step_id',saved.id,'before',case when p_id is null then null else to_jsonb(previous) end,'after',to_jsonb(saved)),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'follow_up_step_saved','deal',p_deal,jsonb_build_object('before',case when p_id is null then null else to_jsonb(previous) end,'after',to_jsonb(saved)));
  result:=jsonb_build_object('id',saved.id,'version',saved.version);
  insert into public.commercial_requests(dealer_id,request_id,command,input,result) values(p_dealer,p_request,'follow_up_step',payload,result);
  return result;
end $$;
revoke all on function public.save_deal_follow_up_step(uuid,uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.save_deal_follow_up_step(uuid,uuid,uuid,integer,jsonb,uuid) to authenticated;
