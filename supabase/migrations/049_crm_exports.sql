-- Bounded, audited CRM exports. Output is a strict allowlist and deliberately excludes
-- purchase costs, margins, document snapshots and commercial finance internals.

create function public.crm_export(p_dealer uuid,p_type text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rows jsonb;row_count integer;safe_filters jsonb;
begin
  if auth.uid() is null or not public.crm_allowed(p_dealer,'report') then raise exception 'crm_report_not_allowed';end if;
  if p_filters is null or jsonb_typeof(p_filters)<>'object' or octet_length(p_filters::text)>8000 then raise exception 'invalid_filters';end if;

  if p_type='leads' then
    with result as (select l.id,l.title,l.stage::text stage,l.source::text source,l.score::text score,c.name customer,c.email,c.phone,l.next_action,l.next_action_at,l.created_at
      from public.leads l left join public.customers c on c.id=l.customer_id and c.dealer_id=l.dealer_id
      where l.dealer_id=p_dealer
        and (nullif(trim(p_filters->>'q'),'') is null or l.title ilike '%'||replace(replace(trim(p_filters->>'q'),'\','\\'),'%','\%')||'%' escape '\')
        and (nullif(p_filters->>'stage','') is null or l.stage::text=p_filters->>'stage')
        and (coalesce((p_filters->>'mine')::boolean,false)=false or l.assigned_to=auth.uid())
        and (coalesce((p_filters->>'overdue')::boolean,false)=false or (l.next_action_at<now() and l.stage::text not in ('sold','after_sales','lost')))
      order by l.created_at desc,l.id limit 5001)
    select jsonb_agg(to_jsonb(result)),count(*) into rows,row_count from result;
  elsif p_type='customers' then
    with result as (select c.id,c.name,c.type,c.business_name,c.email,c.phone,c.mobile,c.city,c.county,c.eircode,c.created_at
      from public.customers c where c.dealer_id=p_dealer and c.deleted_at is null
        and (nullif(trim(p_filters->>'q'),'') is null or concat_ws(' ',c.name,c.business_name,c.email,c.phone) ilike '%'||replace(replace(trim(p_filters->>'q'),'\','\\'),'%','\%')||'%' escape '\')
      order by c.name,c.id limit 5001)
    select jsonb_agg(to_jsonb(result)),count(*) into rows,row_count from result;
  elsif p_type='tasks' then
    with result as (select t.id,t.title,t.type,t.status,t.priority,t.due_at,t.completed_at,l.title lead,c.name customer,t.created_at
      from public.crm_tasks t left join public.leads l on l.id=t.lead_id and l.dealer_id=t.dealer_id left join public.customers c on c.id=coalesce(t.customer_id,l.customer_id) and c.dealer_id=t.dealer_id
      where t.dealer_id=p_dealer
        and (nullif(p_filters->>'status','') is null or t.status=p_filters->>'status')
        and (nullif(p_filters->>'priority','') is null or t.priority=p_filters->>'priority')
        and (coalesce((p_filters->>'mine')::boolean,false)=false or t.assigned_to=auth.uid())
      order by t.due_at,t.id limit 5001)
    select jsonb_agg(to_jsonb(result)),count(*) into rows,row_count from result;
  elsif p_type='appointments' then
    with result as (select v.id,v.lead_name,v.phone,v.vehicle_label,v.scheduled_for,v.status,v.responsible,v.created_at
      from public.viewings v where v.dealer_id=p_dealer
        and (nullif(p_filters->>'status','') is null or v.status=p_filters->>'status')
        and (nullif(p_filters->>'from','') is null or v.scheduled_for>=(p_filters->>'from')::timestamptz)
        and (nullif(p_filters->>'to','') is null or v.scheduled_for<(p_filters->>'to')::timestamptz+interval '1 day')
      order by v.scheduled_for,v.id limit 5001)
    select jsonb_agg(to_jsonb(result)),count(*) into rows,row_count from result;
  else raise exception 'invalid_export_type';end if;

  if row_count>5000 then raise exception 'export_too_large';end if;
  safe_filters:=jsonb_strip_nulls(jsonb_build_object(
    'stage',nullif(p_filters->>'stage',''),'status',nullif(p_filters->>'status',''),
    'priority',nullif(p_filters->>'priority',''),'mine',coalesce((p_filters->>'mine')::boolean,false),
    'overdue',coalesce((p_filters->>'overdue')::boolean,false),'from',nullif(p_filters->>'from',''),
    'to',nullif(p_filters->>'to',''),'hasSearch',nullif(trim(p_filters->>'q'),'') is not null
  ));
  insert into public.audit_logs(dealer_id,user_id,action,entity,meta)
  values(p_dealer,auth.uid(),'crm_exported','crm_export',jsonb_build_object('type',p_type,'row_count',row_count,'filters',safe_filters));
  return coalesce(rows,'[]'::jsonb);
end;
$$;
revoke all on function public.crm_export(uuid,text,jsonb) from public,anon;
grant execute on function public.crm_export(uuid,text,jsonb) to authenticated;
