-- One safe, tenant-scoped customer history. The RPC intentionally projects a small
-- DTO: commercial outcomes are visible, acquisition cost/margin and frozen document
-- snapshots are never returned.

create function public.customer_timeline(
  p_dealer uuid,
  p_customer uuid,
  p_before timestamptz default null,
  p_before_id text default null,
  p_limit integer default 50,
  p_kinds text[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_count integer;
  v_last_time timestamptz;
  v_last_id text;
begin
  if auth.uid() is null or not public.crm_allowed(p_dealer, 'read') then
    raise exception 'crm_not_allowed';
  end if;
  if not exists (
    select 1 from public.customers
    where id = p_customer and dealer_id = p_dealer and deleted_at is null
  ) then
    raise exception 'customer_not_found';
  end if;
  if (p_before is null) <> (p_before_id is null) then
    raise exception 'invalid_cursor';
  end if;

  with timeline as (
    select
      'activity:' || a.id::text as source_id,
      a.created_at as occurred_at,
      'activity'::text as category,
      a.type::text as kind,
      case a.type::text
        when 'call' then 'Call recorded'
        when 'email' then 'Email recorded'
        when 'sms' then 'Message recorded'
        when 'meeting' then 'Meeting recorded'
        else 'CRM note added'
      end as title,
      jsonb_strip_nulls(jsonb_build_object('body', nullif(a.body, ''))) as detail,
      '/leads/' || l.id::text as href
    from public.lead_activities a
    join public.leads l on l.id = a.lead_id and l.dealer_id = a.dealer_id
    where a.dealer_id = p_dealer and l.customer_id = p_customer

    union all
    select
      'task-event:' || event.id::text,
      event.created_at,
      'task',
      event.kind,
      case when event.kind = 'created' then t.title else t.title || ' status changed' end,
      jsonb_build_object(
        'status', t.status,
        'priority', t.priority,
        'dueAt', t.due_at,
        'completedAt', t.completed_at,
        'before', event.detail->>'before',
        'after', event.detail->>'after'
      ),
      '/leads/tasks'
    from public.crm_work_events event
    join public.crm_tasks t on t.id = event.task_id and t.dealer_id = event.dealer_id
    left join public.leads l on l.id = t.lead_id and l.dealer_id = t.dealer_id
    where event.dealer_id = p_dealer
      and coalesce(t.customer_id, l.customer_id) = p_customer

    union all
    select
      'appointment-event:' || event.id::text,
      event.created_at,
      'appointment',
      event.kind,
      case when event.kind = 'created' then coalesce(nullif(v.vehicle_label, ''), 'Customer appointment') else 'Appointment status changed' end,
      jsonb_build_object(
        'status', v.status,
        'scheduledFor', v.scheduled_for,
        'before', event.detail->>'before',
        'after', event.detail->>'after'
      ),
      '/leads/viewings'
    from public.crm_work_events event
    join public.viewings v on v.id = event.viewing_id and v.dealer_id = event.dealer_id
    left join public.leads l on l.id = v.lead_id and l.dealer_id = v.dealer_id
    where event.dealer_id = p_dealer
      and coalesce(v.customer_id, l.customer_id) = p_customer

    union all
    select
      'deal:' || e.id::text,
      e.created_at,
      'deal',
      e.kind,
      case e.kind
        when 'created' then 'Deal created'
        when 'stage_changed' then 'Deal stage changed'
        when 'agreement_printed' then 'Agreement generated'
        when 'so_created' then 'Sales order created'
        when 'cancelled' then 'Deal cancelled'
        else 'Deal updated'
      end,
      jsonb_build_object('dealNo', d.deal_no, 'status', d.status, 'stage', d.stage),
      '/business/deals/' || d.id::text
    from public.deal_events e
    join public.deals d on d.id = e.deal_id and d.dealer_id = e.dealer_id
    where e.dealer_id = p_dealer and d.customer_id = p_customer

    union all
    select
      'document:' || doc.id::text,
      doc.created_at,
      'document',
      doc.kind,
      case doc.kind
        when 'invoice' then 'Invoice ' || doc.number
        when 'credit_note' then 'Credit note ' || doc.number
        when 'agreement' then 'Agreement ' || doc.number
        when 'quote' then 'Quote ' || doc.number
        else 'Purchase receipt ' || doc.number
      end,
      jsonb_build_object('number', doc.number, 'status', doc.status),
      '/business/deals/' || d.id::text
    from public.deal_documents doc
    join public.deals d on d.id = doc.deal_id and d.dealer_id = doc.dealer_id
    where doc.dealer_id = p_dealer and d.customer_id = p_customer

    union all
    select
      'payment:' || pay.id::text,
      pay.created_at,
      'payment',
      pay.kind,
      case pay.kind
        when 'refund' then 'Refund recorded'
        when 'deposit' then 'Deposit received'
        when 'balance' then 'Balance payment received'
        when 'finance_payout' then 'Finance payout recorded'
        else 'Trade allowance recorded'
      end,
      jsonb_build_object(
        'amount', pay.amount,
        'currency', pay.currency,
        'paidOn', pay.paid_on,
        'method', pay.method
      ),
      '/business/deals/' || d.id::text
    from public.payments pay
    join public.deals d on d.id = pay.deal_id and d.dealer_id = pay.dealer_id
    where pay.dealer_id = p_dealer and d.customer_id = p_customer
  ), filtered as (
    select * from timeline
    where (p_kinds is null or cardinality(p_kinds) = 0 or category = any(p_kinds))
      and (
        p_before is null
        or occurred_at < p_before
        or (occurred_at = p_before and source_id < p_before_id)
      )
  ), page as (
    select * from filtered order by occurred_at desc, source_id desc limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', source_id,
      'occurredAt', occurred_at,
      'category', category,
      'kind', kind,
      'title', title,
      'detail', detail,
      'href', href
    ) order by occurred_at desc, source_id desc), '[]'::jsonb),
    count(*)::integer
  into v_items, v_count
  from page;

  if v_count = v_limit then
    select (item->>'occurredAt')::timestamptz, item->>'id'
      into v_last_time, v_last_id
    from jsonb_array_elements(v_items) with ordinality as x(item, position)
    order by position desc limit 1;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', case when v_last_time is null then null else jsonb_build_object(
      'before', v_last_time,
      'id', v_last_id
    ) end
  );
end;
$$;

revoke all on function public.customer_timeline(uuid,uuid,timestamptz,text,integer,text[]) from public, anon;
grant execute on function public.customer_timeline(uuid,uuid,timestamptz,text,integer,text[]) to authenticated;
