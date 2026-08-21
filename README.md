# DairyOne — Live Tracking Phase 3 & 4 changes

Every file changed/added for Phase 3 (Continuous GPS + Location Storage) and
Phase 4 (Realtime Live Map), same folder paths as `swaggie25/DairyOne`. Drop
these into your working copy (they will overwrite the matching files), or
apply `PHASE3_PHASE4_CHANGES.patch` from your repo root with:

    git apply PHASE3_PHASE4_CHANGES.patch

## Files

**New:**
- `src/lib/tracking-quality.ts` — fix-quality classification (good/weak/stale),
  adaptive sampling interval, and LIVE/STALE status helpers.
- `src/hooks/useActiveTrackingSession.ts` — resolves an agent's current
  tracking session from the DB so trip/route-marking pages can link GPS
  writes to it without relying on agent.tsx's local state.
- `supabase/migrations/20260821090000_livetrack_phase3_continuous_gps.sql` —
  already applied live to project `uuhhyzxagzswcjfhngom`. Included so your
  local repo/migration history matches the database.

**Changed:**
- `src/hooks/useLiveLocation.ts` — adaptive sampling, quality classification,
  heading/altitude, tracking-session linkage, idempotent `client_id` writes.
- `src/hooks/useLiveOps.ts` — `speed_kmh`/`accuracy`/`quality` on live pings,
  new `useRoutePointFarmers`, and an incremental (non-full-refetch) realtime
  patch for GPS pings.
- `src/integrations/supabase/types.ts` — regenerated types for the new
  `gps_pings` columns.
- `src/routes/_authenticated/agent.tsx` — GPS collection now starts at Punch
  In (tracking session ACTIVE), not only once a trip exists.
- `src/routes/_authenticated/trip.tsx`, `route-marking.tsx` — pass
  `trackingSessionId` through to `useLiveLocation`.
- `src/routes/_authenticated/live.tsx` — LIVE/STALE badges, Agent Detail
  panel (current/next farmer, speed, distance to next stop, farmers
  completed/remaining, milk collected).
- `src/components/google-live-map.tsx` — split static overlays (stops,
  collections, directions) from per-agent marker/trail updates, which are
  now updated in place instead of the whole map being cleared and redrawn
  on every GPS ping.

## Database

The migration is **already applied** to your live Supabase project
(`uuhhyzxagzswcjfhngom`). You do not need to run it again — it's included
only so `git log` / `supabase migration list` reflect what's actually in
the database. If you ever rebuild a fresh local Postgres from these
migration files, run them in filename order alongside your existing ones.
