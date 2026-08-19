-- PHASE 3 — MCC handover RPCs
--
-- create_mcc_handover: called once a trip is completed. Idempotent — if a
-- handover already exists for the trip it's returned as-is, so a retried
-- "Proceed to MCC" tap can never create a duplicate. Declared quantity and
-- count are computed from milk_collections (the same source of truth as
-- every other total in the app), not re-entered by the Agent.
--
-- record_mcc_handover_receipt: manager/owner at the receiving centre only.
-- Flags variance_flagged automatically when the |declared - received| gap
-- exceeds the centre's configured tolerance, and opens a structured
-- quantity_mismatch trip_exception so it can't sit hidden in a note.
--
-- acknowledge_handover_variance: requires a reason, records who
-- acknowledged it and when, and resolves the linked exception.

create or replace function public.create_mcc_handover(p_trip_id uuid)
returns public.mcc_handovers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip record;
  v_agent record;
  v_existing public.mcc_handovers;
  v_row public.mcc_handovers;
  v_qty numeric;
  v_count integer;
begin
  select * into v_existing from public.mcc_handovers where trip_id = p_trip_id;
  if found then
    return v_existing;
  end if;

  select * into v_trip from public.route_trips where id = p_trip_id;
  if not found then
    raise exception 'Trip not found.';
  end if;

  select a.* into v_agent from public.agents a where a.id = v_trip.agent_id;

  if not (
    public.has_role(v_uid, 'owner')
    or (v_agent.profile_id = v_uid)
    or (v_trip.mcc_id in (select public.user_mcc_ids(v_uid)))
  ) then
    raise exception 'Not authorized to hand over this trip.';
  end if;

  if v_trip.status <> 'completed' then
    raise exception 'Complete the route before handing over at the MCC.';
  end if;

  select coalesce(sum(quantity_litres), 0), count(*)
    into v_qty, v_count
    from public.milk_collections
    where trip_id = p_trip_id;

  insert into public.mcc_handovers (
    trip_id, agent_id, mcc_id, trip_date, session,
    declared_quantity_litres, declared_collection_count, created_by
  ) values (
    p_trip_id, v_trip.agent_id, v_trip.mcc_id, v_trip.trip_date, v_trip.session,
    v_qty, v_count, v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.record_mcc_handover_receipt(
  p_handover_id uuid,
  p_received_quantity_litres numeric,
  p_notes text default null
)
returns public.mcc_handovers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.mcc_handovers;
  v_tolerance numeric;
  v_variance numeric;
begin
  if p_received_quantity_litres is null or p_received_quantity_litres < 0 then
    raise exception 'Received quantity must be zero or greater.';
  end if;

  select * into v_row from public.mcc_handovers where id = p_handover_id;
  if not found then
    raise exception 'Handover not found.';
  end if;

  if not (
    public.has_role(v_uid, 'owner')
    or (v_row.mcc_id in (select public.user_mcc_ids(v_uid)))
  ) then
    raise exception 'Only a manager or owner at this centre can record the receipt.';
  end if;

  if v_row.status not in ('declared') then
    raise exception 'This handover has already been receipted.';
  end if;

  select handover_variance_tolerance_litres into v_tolerance
    from public.mcc_centres where id = v_row.mcc_id;

  v_variance := abs(p_received_quantity_litres - v_row.declared_quantity_litres);

  update public.mcc_handovers set
    received_quantity_litres = p_received_quantity_litres,
    received_by = v_uid,
    received_at = now(),
    receipt_notes = p_notes,
    status = case when v_variance > coalesce(v_tolerance, 2) then 'variance_flagged' else 'received' end
  where id = p_handover_id
  returning * into v_row;

  if v_row.status = 'variance_flagged' then
    insert into public.trip_exceptions (trip_id, agent_id, mcc_id, type, reason, status, created_by)
    values (
      v_row.trip_id, v_row.agent_id, v_row.mcc_id, 'quantity_mismatch',
      format(
        'MCC handover variance: declared %s L, received %s L (%s L difference).',
        v_row.declared_quantity_litres, v_row.received_quantity_litres, v_row.variance_litres
      ),
      'open', v_uid
    );
  end if;

  return v_row;
end;
$$;

create or replace function public.acknowledge_handover_variance(p_handover_id uuid, p_reason text)
returns public.mcc_handovers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.mcc_handovers;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to acknowledge this variance.';
  end if;

  select * into v_row from public.mcc_handovers where id = p_handover_id;
  if not found then
    raise exception 'Handover not found.';
  end if;

  if not (
    public.has_role(v_uid, 'owner')
    or (v_row.mcc_id in (select public.user_mcc_ids(v_uid)))
  ) then
    raise exception 'Only a manager or owner at this centre can acknowledge variance.';
  end if;

  if v_row.status <> 'variance_flagged' then
    raise exception 'This handover has no open variance to acknowledge.';
  end if;

  update public.mcc_handovers set
    status = 'acknowledged',
    variance_acknowledged_by = v_uid,
    variance_acknowledged_at = now(),
    variance_reason = trim(p_reason)
  where id = p_handover_id
  returning * into v_row;

  update public.trip_exceptions set
    status = 'resolved',
    resolved_by = v_uid,
    resolved_at = now()
  where trip_id = v_row.trip_id and type = 'quantity_mismatch' and status = 'open';

  return v_row;
end;
$$;
