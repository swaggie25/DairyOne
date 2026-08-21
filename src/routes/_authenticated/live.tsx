import { Suspense, lazy, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Gauge, MapPinned, Milk, Navigation, Radio, Users } from "lucide-react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import {
  useCentreLocation,
  useLiveCollections,
  useLiveOpsRealtime,
  useLivePings,
  useLiveTrips,
  useRoutePointFarmers,
  useRoutePoints,
} from "@/hooks/useLiveOps";
import { computeRoute } from "@/lib/maps.functions";
import { formatCurrency } from "@/lib/pricing";
import { MANAGER_NAV } from "@/lib/nav";
import { haversineMeters } from "@/lib/geo";
import { classifyLiveStatus } from "@/lib/tracking-quality";

const LiveMap = lazy(() => import("@/components/google-live-map"));

export const Route = createFileRoute("/_authenticated/live")({
  head: () => ({
    meta: [
      { title: "Live operations map — DairyOne" },
      {
        name: "description",
        content:
          "Track every active collection agent, route-point progress and incoming milk entries live on one map.",
      },
      { property: "og:title", content: "Live operations map — DairyOne" },
      {
        property: "og:description",
        content: "Realtime agent GPS trails, trip status and collection feed for your centre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveOpsScreen,
});

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function LiveOpsScreen() {
  const { data: mcc } = useStaffMcc();
  const mccId = mcc?.mccId;
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);

  useLiveOpsRealtime(mccId);
  const { data: trips } = useLiveTrips(mccId);
  const { data: pings } = useLivePings(mccId);
  const { data: points } = useRoutePoints(mccId);
  const { data: pointFarmers } = useRoutePointFarmers(mccId);
  const { data: collections } = useLiveCollections(mccId);
  const { data: centre } = useCentreLocation(mccId);

  const tripList = trips ?? [];
  const pingList = pings ?? [];
  const collectionList = useMemo(() => collections ?? [], [collections]);
  const active = tripList.filter((t) => t.status === "in_progress");
  const litres = collectionList.reduce((s, c) => s + Number(c.quantity_litres ?? 0), 0);
  const value = collectionList.reduce((s, c) => s + Number(c.total_amount ?? 0), 0);

  const lastPingFor = (agentId: string) =>
    [...pingList].reverse().find((p) => p.agent_id === agentId) ?? null;

  /*
   * LIVE TRACKING PLAN — PHASE 4: Agent detail
   *
   * Everything here is derived from data already on this page (pings,
   * points, point-farmers, collections) — no new per-click query. ETA,
   * scheduled time, delay and MCC ETA are deliberately NOT computed here:
   * those need real road routing and centre-configured timing rules,
   * which is Phase 5 scope. Showing a straight-line/fixed-speed guess for
   * them now would be exactly the "fake ETA" the plan says never to ship.
   */
  const focusedTrip = focusAgentId
    ? (tripList.find((t) => t.agent_id === focusAgentId) ?? null)
    : null;
  const focusedPing = focusAgentId ? lastPingFor(focusAgentId) : null;
  const focusedLive = classifyLiveStatus(focusedPing?.recorded_at ?? null);

  const routePointsForFocusedRoute = useMemo(() => {
    if (!focusedTrip) return [];
    return (points ?? [])
      .filter((p) => p.route_id === focusedTrip.route_id)
      .sort((a, b) => a.sequence - b.sequence);
  }, [points, focusedTrip]);

  const farmersForFocusedRoute = useMemo(() => {
    const pointIds = new Set(routePointsForFocusedRoute.map((p) => p.id));
    return (pointFarmers ?? [])
      .filter((f) => pointIds.has(f.route_point_id))
      .sort((a, b) => a.sequence - b.sequence);
  }, [pointFarmers, routePointsForFocusedRoute]);

  const tripCollections = useMemo(
    () =>
      focusedTrip
        ? collectionList.filter((c) => c.agents?.full_name === focusedTrip.agents?.full_name)
        : [],
    [collectionList, focusedTrip],
  );
  // Collections don't carry farmer_id on this feed, only farmer name — match
  // on name (same limitation as the rest of this feed, which already keys
  // collection→agent by name for display).
  const collectedFarmerNames = useMemo(
    () => new Set(tripCollections.map((c) => c.farmers?.full_name).filter(Boolean)),
    [tripCollections],
  );

  const nextUncollectedFarmer = farmersForFocusedRoute.find(
    (f) => !collectedFarmerNames.has(f.full_name),
  );
  const nextFarmerIndex = nextUncollectedFarmer
    ? farmersForFocusedRoute.findIndex((f) => f.farmer_id === nextUncollectedFarmer.farmer_id)
    : -1;
  const currentFarmer = nextFarmerIndex >= 0 ? nextUncollectedFarmer : null;
  const upcomingFarmer =
    nextFarmerIndex >= 0 && nextFarmerIndex + 1 < farmersForFocusedRoute.length
      ? farmersForFocusedRoute[nextFarmerIndex + 1]
      : null;

  const farmersTotal = farmersForFocusedRoute.length;
  const farmersCompleted = farmersForFocusedRoute.filter((f) =>
    collectedFarmerNames.has(f.full_name),
  ).length;
  const litresThisTrip = tripCollections.reduce((s, c) => s + Number(c.quantity_litres ?? 0), 0);

  const nextFarmerPoint = upcomingFarmer
    ? (routePointsForFocusedRoute.find((p) => p.id === upcomingFarmer.route_point_id) ?? null)
    : null;
  const distanceToNextM =
    focusedPing?.lat != null &&
    focusedPing?.lng != null &&
    nextFarmerPoint?.lat != null &&
    nextFarmerPoint?.lng != null
      ? haversineMeters(focusedPing.lat, focusedPing.lng, nextFarmerPoint.lat, nextFarmerPoint.lng)
      : null;

  // Stops for the directions request: focused agent's route, else every active stop.
  const focusedRouteId = focusAgentId
    ? (tripList.find((t) => t.agent_id === focusAgentId)?.route_id ?? null)
    : null;

  const [showDirections, setShowDirections] = useState(false);
  const routeStops = useMemo(() => {
    const list = (points ?? [])
      .filter((p) => p.lat != null && p.lng != null)
      .filter((p) => (focusedRouteId ? p.route_id === focusedRouteId : true))
      .sort((a, b) => a.sequence - b.sequence)
      .map((p) => ({ lat: p.lat!, lng: p.lng! }));
    return list.slice(0, 25);
  }, [points, focusedRouteId]);

  const startPoint =
    centre?.lat != null && centre.lng != null
      ? { lat: centre.lat, lng: centre.lng }
      : (routeStops[0] ?? null);

  const runComputeRoute = useServerFn(computeRoute);
  const directions = useQuery({
    queryKey: ["directions", focusedRouteId, routeStops.length, startPoint?.lat, startPoint?.lng],
    enabled: showDirections && Boolean(startPoint) && routeStops.length > 0,
    staleTime: 300_000,
    retry: false,
    queryFn: () =>
      runComputeRoute({
        data: {
          origin: startPoint!,
          destination: routeStops[routeStops.length - 1]!,
          waypoints: routeStops.slice(0, -1),
        },
      }),
  });

  const km = directions.data ? (directions.data.distanceMeters / 1000).toFixed(1) : null;
  const mins = directions.data ? Math.round(directions.data.durationSeconds / 60) : null;

  return (
    <AppShell nav={MANAGER_NAV}>
      <PageHeading
        title="Live operations"
        subtitle={
          mcc
            ? `${mcc.name} · ${mcc.code} — agent positions and collections update in realtime.`
            : "No collection centre assigned to you yet."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Agents on route"
          value={active.length}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="GPS pings today"
          value={pingList.length}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Litres collected"
          value={litres.toFixed(1)}
          icon={<Milk className="h-4 w-4" />}
        />
        <StatCard label="Value today" value={formatCurrency(value)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="surface-card overflow-hidden p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1">
            <p className="text-sm text-muted-foreground">
              {focusedRouteId ? "Route for selected agent" : "All active route stops"} ·{" "}
              {routeStops.length} stops
            </p>
            <div className="flex items-center gap-2">
              {directions.data && (
                <Badge variant="secondary">
                  {km} km · {mins} min drive
                </Badge>
              )}
              <Button
                size="sm"
                variant={showDirections ? "default" : "outline"}
                disabled={routeStops.length === 0}
                onClick={() => setShowDirections((v) => !v)}
              >
                <Navigation className="mr-1 h-4 w-4" />
                {showDirections ? "Hide directions" : "Show directions"}
              </Button>
            </div>
          </div>
          {showDirections && directions.isError && (
            <p className="px-2 pb-2 text-xs text-destructive">
              {(directions.error as Error).message}
            </p>
          )}
          <ClientOnly
            fallback={
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground lg:h-[560px]">
                Loading map…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground lg:h-[560px]">
                  Loading map…
                </div>
              }
            >
              <LiveMap
                centre={centre ?? null}
                trips={tripList}
                pings={pingList}
                points={points ?? []}
                collections={collectionList}
                focusAgentId={focusAgentId}
                directionsPolyline={showDirections ? (directions.data?.polyline ?? null) : null}
              />
            </Suspense>
          </ClientOnly>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Agents today</h2>
              {focusAgentId && (
                <Button size="sm" variant="ghost" onClick={() => setFocusAgentId(null)}>
                  Show all
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {tripList.map((trip) => {
                const ping = lastPingFor(trip.agent_id);
                const stop = (points ?? []).find((p) => p.id === trip.current_route_point_id);
                const live = classifyLiveStatus(ping?.recorded_at ?? null);
                return (
                  <li
                    key={trip.id}
                    className={`cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-secondary ${
                      focusAgentId === trip.agent_id ? "bg-primary-soft" : ""
                    }`}
                    onClick={() =>
                      setFocusAgentId(focusAgentId === trip.agent_id ? null : trip.agent_id)
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{trip.agents?.full_name ?? "Agent"}</p>
                      <Badge variant={trip.status === "in_progress" ? "default" : "secondary"}>
                        {trip.status === "in_progress" ? "On route" : trip.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trip.routes?.name ?? "Route"} · {trip.session} · started{" "}
                      {timeAgo(trip.started_at)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPinned className="h-3 w-3" />
                      {stop ? `At ${stop.name}` : "No stop marked"}
                    </p>
                    <p
                      className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                        live.isLive ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      <Radio className="h-3 w-3" />
                      {live.isLive ? "LIVE" : "LOCATION STALE"} · {live.label}
                    </p>
                  </li>
                );
              })}
              {tripList.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No trips started today.
                </li>
              )}
            </ul>
          </div>

          {focusedTrip && (
            <div className="surface-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{focusedTrip.agents?.full_name ?? "Agent"}</h2>
                <span
                  className={`flex items-center gap-1 text-xs font-semibold ${
                    focusedLive.isLive ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  <Radio className="h-3 w-3" />
                  {focusedLive.isLive ? "LIVE" : "STALE"}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Route</dt>
                <dd className="text-right font-medium">{focusedTrip.routes?.name ?? "—"}</dd>

                <dt className="text-muted-foreground">Current location</dt>
                <dd className="text-right font-medium">
                  {focusedPing?.lat != null && focusedPing?.lng != null
                    ? `${focusedPing.lat.toFixed(4)}, ${focusedPing.lng.toFixed(4)}`
                    : "—"}
                </dd>

                <dt className="text-muted-foreground">Current farmer</dt>
                <dd className="text-right font-medium">{currentFarmer?.full_name ?? "—"}</dd>

                <dt className="text-muted-foreground">Next farmer</dt>
                <dd className="text-right font-medium">{upcomingFarmer?.full_name ?? "—"}</dd>

                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Gauge className="h-3 w-3" /> Speed
                </dt>
                <dd className="text-right font-medium">
                  {focusedPing?.speed_kmh != null
                    ? `${focusedPing.speed_kmh.toFixed(0)} km/h`
                    : "—"}
                </dd>

                <dt className="text-muted-foreground">Distance to next</dt>
                <dd className="text-right font-medium">
                  {distanceToNextM != null ? `${(distanceToNextM / 1000).toFixed(2)} km` : "—"}
                </dd>

                <dt className="text-muted-foreground">Farmers</dt>
                <dd className="text-right font-medium">
                  {farmersCompleted} / {farmersTotal} done
                </dd>

                <dt className="text-muted-foreground">Milk collected</dt>
                <dd className="text-right font-medium">{litresThisTrip.toFixed(1)} L</dd>

                <dt className="text-muted-foreground">Last update</dt>
                <dd className="text-right font-medium">{focusedLive.label}</dd>

                <dt className="text-muted-foreground">ETA · Delay · MCC ETA</dt>
                <dd className="text-right text-xs text-muted-foreground">Coming in Phase 5</dd>
              </dl>
            </div>
          )}

          <div className="surface-card p-4">
            <h2 className="mb-3 font-semibold">Live collection feed</h2>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {collectionList.slice(0, 25).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{c.farmers?.full_name ?? "Farmer"}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.agents?.full_name ?? "Centre"} · {timeAgo(c.collected_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{Number(c.quantity_litres).toFixed(1)} L</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(c.total_amount ?? 0))}
                    </p>
                  </div>
                  {Number(c.risk_score ?? 0) >= 40 && <Badge variant="destructive">Suspect</Badge>}
                </li>
              ))}
              {collectionList.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No collections recorded today yet.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
