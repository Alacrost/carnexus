-- Agreement status and pipeline stage are separate. Confirmed funds or an actual
-- trade move an open negotiation to closing before its agreement snapshot is issued.
create function public.set_qualified_deal_closing_stage()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('app.automatic_deal_closing',true)='true'
    and new.status not in ('completed','cancelled','reversed') and new.stage<>'after_sales'
    and public.deal_agreement_triggered(new.dealer_id,new.id) then new.stage:='closing'; end if;
  return new;
end $$;
revoke all on function public.set_qualified_deal_closing_stage() from public,anon,authenticated;
create trigger set_qualified_deal_closing_stage before update on public.deals
  for each row execute function public.set_qualified_deal_closing_stage();

create function public.record_automatic_deal_closing_stage()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('app.automatic_deal_closing',true)='true'
    and new.stage='closing' and old.stage is distinct from new.stage
    and public.deal_agreement_triggered(new.dealer_id,new.id) then
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
      values(new.dealer_id,new.id,'automatic_closing',jsonb_build_object(
        'message','Deal moved to closing after confirmed deposit or trade-in',
        'before',old.stage,'after',new.stage),auth.uid());
  end if;
  return null;
end $$;
revoke all on function public.record_automatic_deal_closing_stage() from public,anon,authenticated;
create trigger record_automatic_deal_closing_stage after update on public.deals
  for each row execute function public.record_automatic_deal_closing_stage();

-- Only a new received deposit, actual trade command or deposit confirmation
-- enables automatic stage advancement. Later manual stage edits remain editable.
alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v089;
revoke all on function public.commercial_command_v089(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; advance boolean:=false; previous_flag text;
begin
  if p_command in ('payment','trade','clear_receipt') then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    if not exists(select 1 from public.commercial_requests where dealer_id=p_dealer and request_id=p_request) then
      advance:=p_command='trade' or (p_command='payment' and p_input->>'kind'='deposit'
        and (p_input->>'method' in ('cash','card','finance') or coalesce((p_input->>'fundsConfirmed')::boolean,false)))
        or (p_command='clear_receipt' and exists(select 1 from public.payments where id=p_id and dealer_id=p_dealer
          and kind='deposit' and clearance_status='pending'));
    end if;
  end if;
  previous_flag:=coalesce(current_setting('app.automatic_deal_closing',true),'');
  if advance then perform set_config('app.automatic_deal_closing','true',true); end if;
  result:=public.commercial_command_v089(p_dealer,p_command,p_id,p_input,p_request);
  if advance then perform set_config('app.automatic_deal_closing',previous_flag,true); end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

-- The non-autosave sheet creation is also a transaction; use the same scoped
-- signal while its newly received deposits and final agreement are written.
alter function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) rename to create_deal_from_sheet_v089;
revoke all on function public.create_deal_from_sheet_v089(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
create function public.create_deal_from_sheet(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_finance jsonb,p_mode text,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; advance boolean:=false; previous_flag text;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  if not exists(select 1 from public.deal_sheet_requests where dealer_id=p_dealer and request_id=p_request) then
    advance:=exists(select 1 from jsonb_array_elements(coalesce(p_sale->'deposits','[]')) item
      where (item->>'amount')::numeric>0 and (item->>'method' in ('cash','card','finance')
        or coalesce((item->>'fundsConfirmed')::boolean,false)))
      or (coalesce((p_sale->>'depositAmount')::numeric,0)>0 and (p_sale->>'depositMethod' in ('cash','card','finance')
        or coalesce((p_sale->>'fundsConfirmed')::boolean,false)));
  end if;
  previous_flag:=coalesce(current_setting('app.automatic_deal_closing',true),'');
  if advance then perform set_config('app.automatic_deal_closing','true',true); end if;
  result:=public.create_deal_from_sheet_v089(p_dealer,p_sale,p_terms,p_finance,p_mode,p_request);
  if advance then perform set_config('app.automatic_deal_closing',previous_flag,true); end if;
  return result;
end $$;
revoke all on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) to authenticated;

-- Enrich fresh and cached autosave responses from the persisted Deal, without
-- repeating a financial write, stage transition, version increment or event.
alter function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) rename to autosave_new_deal_v089;
revoke all on function public.autosave_new_deal_v089(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
create function public.autosave_new_deal(p_dealer uuid,p_session uuid,p_revision integer,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; actual_stage text; actual_id uuid;
begin
  result:=public.autosave_new_deal_v089(p_dealer,p_session,p_revision,p_input,p_request);
  actual_id:=coalesce((result->>'id')::uuid,(result->'existingDeal'->>'id')::uuid);
  select stage into actual_stage from public.deals where id=actual_id and dealer_id=p_dealer;
  if actual_stage is not null then
    result:=result||jsonb_build_object('stage',actual_stage);
    if result ? 'existingDeal' then result:=jsonb_set(result,'{existingDeal,stage}',to_jsonb(actual_stage)); end if;
  end if;
  return result;
end $$;
revoke all on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) to authenticated;
