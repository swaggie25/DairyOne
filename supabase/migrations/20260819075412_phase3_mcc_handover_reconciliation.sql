-- PHASE 3 — MCC Handover + Reconciliation
--
-- One row per completed trip, capturing the Agent's declared collection
-- total against what the MCC operator actually receives. Variance is a
-- generated column so it can never drift from the two source numbers.
--
-- Writes only ever happen through the phase3_mcc_handover_rpcs functions
-- (create_mcc_handover / record_mcc_handover_receipt /
-- acknowledge_handover_variance) — this table has no direct-write policy,
-- see mcc_handovers_no_direct_write below.

create table if not exists public.mcc_handovers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.route_trips(id),
  agent_id uuid not null references public.agents(id),
  mcc_id uuid not null references public.mcc_centres(id),
  trip_date date not null,
  session text not null default 'morning',

  declared_quantity_litres numeric not null,
  declared_collection_count integer not null default 0,

  received_quantity_litres numeric,
  variance_litres numeric generated always as
    (received_quantity_litres - declared_quantity_litres) stored,

  status text not null default 'declared'
    check (status = any (array['declared', 'received', 'variance_flagged', 'acknowledged'])),

  received_by uuid references auth.users(id),
  received_at timestamptz,
  receipt_notes text,

  variance_acknowledged_by uuid references auth.users(id),
  variance_acknowledged_at timestamptz,
  variance_reason text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcc_handovers_mcc_status_idx on public.mcc_handovers (mcc_id, status);

-- Configurable per centre: litres of Agent-declared vs MCC-received variance
-- allowed before a handover is flagged and requires acknowledgement.
alter table public.mcc_centres
  add column if not exists handover_variance_tolerance_litres numeric not null default 2;

-- Phase 3 exception types: a handover variance needs its own structured type
-- (not lumped under "other") so it shows up distinctly in the exceptions
-- list and report. Widened idempotently in case this runs against a fresh
-- DB that only has the Phase 1 base set.
alter table public.trip_exceptions drop constraint if exists trip_exceptions_type_check;
alter table public.trip_exceptions add constraint trip_exceptions_type_check
  check (type = any (array[
    'farmer_unavailable', 'farmer_skipped', 'route_issue', 'other',
    'quality_issue', 'quantity_mismatch'
  ]));

alter table public.mcc_handovers enable row level security;

-- All writes go through SECURITY DEFINER RPCs so business rules (auth,
-- status transitions, variance detection) can't be bypassed by a raw
-- insert/update from the client.
create policy mcc_handovers_no_direct_write on public.mcc_handovers
  for all to authenticated using (false) with check (false);

create policy mcc_handovers_select on public.mcc_handovers
  for select to authenticated using (
    public.has_role(auth.uid(), 'owner')
    or mcc_id in (select public.user_mcc_ids(auth.uid()))
    or agent_id in (select id from public.agents where profile_id = auth.uid())
  );
