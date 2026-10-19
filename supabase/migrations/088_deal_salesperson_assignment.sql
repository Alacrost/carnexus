-- Reuse the explicit assignment capability; labels on CRM profiles confer nothing.
create function public.guard_deal_salesperson()
returns trigger language plpgsql security definer set search_path=public as $$
declare inherited boolean:=false;
begin
  if auth.uid() is null then return new; end if;
  if TG_OP='UPDATE' and new.salesperson_id is not distinct from old.salesperson_id then return new; end if;
  if new.salesperson_id is null or not exists(select 1 from public.dealer_members m
    where m.dealer_id=new.dealer_id and m.user_id=new.salesperson_id and m.status='active'
      and m.role in ('owner','admin','sales')) then raise exception 'invalid_assignee'; end if;
  if TG_OP='INSERT' then
    -- Conversion may preserve the responsible person on a real, current quote.
    if new.source_quote_id is not null then
      if not exists(select 1 from public.sales_quotes q where q.id=new.source_quote_id
        and q.dealer_id=new.dealer_id and q.customer_id=new.customer_id
        and q.status='open' and q.valid_until>=current_date) then raise exception 'quote_parties_changed'; end if;
      select exists(select 1 from public.sales_quotes q where q.id=new.source_quote_id
        and q.dealer_id=new.dealer_id and q.customer_id=new.customer_id
        and q.salesperson_id=new.salesperson_id and q.status='open' and q.valid_until>=current_date)
        into inherited;
    end if;
    if new.source_quote_id is null and new.salesperson_id=auth.uid() then return new; end if;
    if inherited and public.commercial_allowed(new.dealer_id,'work') then return new; end if;
  end if;
  if not public.commercial_allowed(new.dealer_id,'assign') then raise exception 'assignment_not_allowed'; end if;
  return new;
end $$;
revoke all on function public.guard_deal_salesperson() from public,anon,authenticated;
create trigger guard_deal_salesperson before insert or update of salesperson_id on public.deals
  for each row execute function public.guard_deal_salesperson();

-- Attach the explicit source at insertion so the guard can verify inheritance.
-- Private legacy functions remain inaccessible to API users.
do $$
declare body text; original text;
begin
  select prosrc into body from pg_proc where oid='public.commercial_command_v041(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'insert into deals(dealer_id,deal_no,so_no,customer_id,retail_price,salesperson_id,lead_id,source,currency,notes,created_by)',
    'insert into deals(dealer_id,deal_no,so_no,customer_id,retail_price,salesperson_id,lead_id,source,currency,notes,created_by,source_quote_id)');
  body:=replace(body,'left(p_input->>''notes'',1000),auth.uid()) returning * into d;',
    'left(p_input->>''notes'',1000),auth.uid(),nullif(p_input->>''sourceQuoteId'','''')::uuid) returning * into d;');
  if body=original or position('created_by,source_quote_id)' in body)=0 then raise exception 'sale_assignment_patch_missing'; end if;
  execute format('create or replace function public.commercial_command_v041(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
end $$;

-- Prevent direct sale commands from claiming an unrelated quote's assignee.
create function public.guard_deal_quote_vehicle()
returns trigger language plpgsql security definer set search_path=public as $$
declare source_id uuid;
begin
  if new.kind='sale' then
    select source_quote_id into source_id from public.deals where id=new.deal_id and dealer_id=new.dealer_id;
    if source_id is not null and not exists(select 1 from public.sales_quotes q where q.id=source_id
      and q.dealer_id=new.dealer_id and q.vehicle_id=new.vehicle_id) then raise exception 'quote_parties_changed'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_deal_quote_vehicle() from public,anon,authenticated;
create trigger guard_deal_quote_vehicle before insert or update of vehicle_id,deal_id on public.deal_orders
  for each row execute function public.guard_deal_quote_vehicle();

create function public.assign_deal_salesperson(p_dealer uuid,p_deal uuid,p_salesperson uuid,p_version integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.deals; cached public.commercial_requests; payload jsonb; result jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'assign') then raise exception 'assignment_not_allowed'; end if;
  if p_deal is null or p_salesperson is null or p_version is null or p_request is null then raise exception 'invalid_request'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  payload:=jsonb_build_object('id',p_deal,'salespersonId',p_salesperson,'version',p_version);
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'assign_deal_salesperson' or cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into d from public.deals where dealer_id=p_dealer and id=p_deal for update;
  if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
  if d.version is distinct from p_version then raise exception 'stale_deal'; end if;
  if not exists(select 1 from public.dealer_members m where m.dealer_id=p_dealer and m.user_id=p_salesperson
    and m.status='active' and m.role in ('owner','admin','sales')) then raise exception 'invalid_assignee'; end if;
  if d.salesperson_id is distinct from p_salesperson then
    update public.deals set salesperson_id=p_salesperson,version=version+1,updated_at=now() where id=d.id;
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
      values(p_dealer,d.id,'salesperson_changed',jsonb_build_object('message','Deal responsible person updated',
        'before',d.salesperson_id,'after',p_salesperson),auth.uid());
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
      values(p_dealer,auth.uid(),'deal_salesperson_changed','deal',d.id,
        jsonb_build_object('before',d.salesperson_id,'after',p_salesperson));
    d.version:=d.version+1;
  end if;
  result:=jsonb_build_object('id',d.id,'version',d.version,'salespersonId',p_salesperson);
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,'assign_deal_salesperson',payload,result);
  return result;
end $$;
revoke all on function public.assign_deal_salesperson(uuid,uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.assign_deal_salesperson(uuid,uuid,uuid,integer,uuid) to authenticated;
