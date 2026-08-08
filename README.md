# Milk Flow

Build DairyOne, a mobile-first SaaS web app (PWA, installable on Android/iOS home screen) for running a Milk Collection Centre (MCC) network in India. Think "Blinkit/Zepto-style live operations" but for dairy procurement: an Owner runs multiple MCCs, each MCC has a Manager who oversees Collection Agents who visit Farmers on fixed routes, collect milk, run quality tests, and settle payments — all the way through to the Buyer (dairy plant) receiving the transferred milk.

Use React + TypeScript + Tailwind CSS + shadcn/ui for the frontend, and Supabase for auth, Postgres database, storage (photos/signatures), and row-level security. Use Supabase Realtime for live location/collection updates on the tracking map.

Roles & Access

Implement role-based auth and routing for six roles, each with its own dashboard and permission scope:

Owner — full access across all MCCs, can add/edit Managers and Agents, sees consolidated reports and live map

Centre Manager — scoped to their MCC(s): manages agents, routes, farmer records, verifies/confirms collections, views MCC-level reports

Collection Agent — mobile-first field view: today's route, farmer list per stop, milk entry form, offline mode, GPS tracking

Buyer (Dairy Plant) — sees incoming transfers from MCCs, quantities, fat/SNF quality, transfer confirmations

Seller (Farmer) — sees their own milk history, today's rate, payment status, complaint system

Accountant — full access to financial module: ledgers, payments, receipts, cash/bank, settlements, P&L, no access to route/HR settings

Use MSG91 OTP-based phone authentication for all roles (no passwords). Set up a Supabase Edge Function to call the MSG91 API for OTP send/verify.

Core Data Model

Design normalized Postgres tables (with RLS policies per role) for:

owners, mcc_centres, managers, agents, farmers, buyers, accountants

routes (owner/manager-defined, named, has ordered route_points)

route_points (named collection stops, ordered sequence, GPS lat/lng, linked farmers)

farmer_animals (per-farmer animal details: type, count, health notes)

milk_collections (farmer_id, agent_id, route_point_id, session: morning/evening, quantity_litres, fat_pct, snf_pct, clr, water_adulteration_flag, temperature, acidity, antibiotic_test_result, rate_per_litre auto-calculated, total_amount, timestamp, gps_location, offline_synced_at)

quality_tests (linked to a collection, sample_id for traceability)

attendance (agent_id, punch_in/out, route_id, gps_at_punch)

route_trips (agent_id, route_id, date, status: not_started/in_progress/completed, current_route_point_id for live tracking, started_at, ended_at)

payments (farmer_id/agent_id, type: cash/bank/upi, amount, period: daily/weekly/biweekly, status, transaction_ref)

ledgers (double-entry style: debit/credit, account_type: cash/bank/sale/purchase, linked entity)

transfers (mcc_id, buyer_id, quantity, quality_summary, vehicle/tanker_id, status)

qr_cards (farmer_id or agent_id, qr_code_value, card_type, issued_at)

complaints (farmer_id, category, status, resolution_notes)

Screens & Flows to build

1. MCC Workflow (Owner/Manager side)

Owner dashboard: add/edit Managers, list of MCCs, consolidated live map of all active agent trips

Manager dashboard: Collect Milk queue split into "From Agent" (agent workflow results feeding in) and "From Farmers at Centre" (walk-in farmers the Manager weighs and enters directly at the centre)

The Manager gets the same milk-entry form as the Agent (quantity, fat %, SNF, CLR, auto rate/amount, QR scan-to-lookup) for centre walk-ins — Manager is a first-class collector at the centre, not just an approver

"Verify/Confirm Collection" screen for the Manager to review and approve Agent-submitted entries (from the field) before they count toward MCC totals — this approval step applies only to Agent collections, not to the Manager's own centre entries, which post directly

Manager oversight of Agents: live status of each assigned Agent's trip (not started / in progress / completed), route-point progress, attendance punch times, and a flag list of any Agent submissions awaiting verification

"Transfer for Dairy Plant" screen: manager batches collected milk (from both Agents and centre walk-ins) into a transfer record and hands off to a selected Buyer

2. Agent Workflow (mobile, field-first)

Owner/Manager screen to add/edit Agents and assign them to Routes

Agent home screen: "Punch Attendance" button → GPS-stamped check-in → "Start Trip" button

Live trip screen: shows ordered Route Points (e.g. Point A, Point B) each expanding to its assigned Farmers (e.g. Farmer A, B, C under Point A)

Per-farmer milk entry form: quantity (L/kg), fat %, SNF, CLR, auto-calculated rate and amount, digital signature capture, Bluetooth receipt printing option, works fully offline with a sync queue that pushes to Supabase when connectivity returns

Full audit trail: every GPS ping and route-point arrival/departure timestamp logged for a complete "location history" like a delivery app

"Return to MCC" step closes out the trip

3. QR Cards

Auto-generate a QR code per farmer and per agent tied to their ID

Web-viewable "digital card" page (shareable link) plus a printable physical card layout

Scan-to-lookup flow: agent scans a farmer's QR at a route point to instantly pull up their profile and start a collection entry

4. Financial Module (Accountant + Owner)

Ledgers: cash, bank, sale, purchase, per-farmer and per-MCC views

Payments: daily earnings view, weekly/biweekly settlement runs, UPI/bank payout initiation, outstanding balances per farmer

Reports: collection by village, collection by agent, fat/SNF trend charts, farmer-wise report, profit/loss, collection losses, payment history — use Recharts for all charts

5. Quality & Smart Alerts

Quality test entry (fat, SNF, water adulteration %, temperature, acidity, antibiotic test) attached to each collection, with sample ID tracking

Rule-based (not ML-required for MVP) alert system: flag a collection as suspect if fat/SNF falls outside the farmer's historical range or water-adulteration % exceeds a threshold — surface these as red flags on the Manager and Owner dashboards

Leave clear extension points (a risk_score column, a forecasts table) so production-forecasting / disease-alert / voice-assistant features can be added later without a schema rewrite — do not build the AI features themselves in this pass

6. Farmer View

Today's milk collected, current rate per litre, payment status

Personal history/reports, vaccination reminders (manually entered by manager for now), feed ordering request form, complaint submission

7. Admin/Owner Dashboard

Live map (Supabase Realtime + Mapbox or Leaflet) showing every agent's current position and route-point progress across all active trips today, styled like a delivery-tracking app

Revenue dashboard, agent monitoring (on-time %, collection accuracy), notifications center, audit log viewer

Design direction

Clean, high-contrast, large-touch-target mobile UI (agents will use this one-handed in the field, often in bright sunlight or low connectivity). Use a fresh dairy-appropriate palette (whites, soft blue/green accents) — avoid a generic dark "tech startup" theme. Hindi-friendly typography (agents and farmers may prefer Hindi labels) — structure text as translatable strings even if only English ships first. Owner/Manager/Accountant/Buyer dashboards can be denser, desktop-first web layouts; Agent and Farmer views must be mobile-first.

Non-negotiable technical requirements

Full offline support for the Agent milk-entry flow with a local queue + background sync (this is the most important reliability requirement — agents work in low-network rural areas)

Row-level security in Supabase so each role only ever queries data it's authorized to see

All monetary calculations (rate × quantity based on fat/SNF slabs) done via a single shared pricing-calculation function, not duplicated per screen

Every collection, payment, and route event timestamped and attributable to a user for the audit trail

Suggested build order (paste as separate follow-up prompts, in this order)

Phase 1 — Foundation: Auth (MSG91 OTP) + role routing + Owner/Manager/Agent/Farmer/Buyer/Accountant shells + core tables (owners, mcc_centres, managers, agents, farmers, routes, route_points)

Phase 2 — Agent field flow: Attendance, route trip screen, per-farmer milk entry form, offline sync queue, GPS tracking

Phase 3 — Manager workflow: Collect Milk queue, Verify/Confirm Collection, Transfer to Buyer

Phase 4 — QR cards: generation, digital card page, scan-to-lookup

Phase 5 — Financial module: ledgers, payments, settlements, reports & charts

Phase 6 — Quality testing + rule-based alerts

Phase 7 — Admin live map + dashboards + notifications

Phase 8 (later): AI features — adulteration risk model, forecasting, Disease alerts
NOTE: USE THEME AS IN MY SHARED IMAGE

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8d556fc2-d4e2-4655-bced-1ac9b85d5efe).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
