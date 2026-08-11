import { Suspense, lazy, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, MapPinned, Milk, Users } from "lucide-react";
import { ClientOnly } from "@tanstack/react-router";
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
  useRoutePoints,
} from "@/hooks/useLiveOps";
import { formatCurrency } from "@/lib/pricing";
import { MANAGER_NAV } from "@/lib/nav";

const LiveMap = lazy(() => import("@/components/live-map"));

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
  const { data: collections } = useLiveCollections(mccId);
  const { data: centre } = useCentreLocation(mccId);

  const tripList = trips ?? [];
  const pingList = pings ?? [];
  const collectionList = collections ?? [];
  const active = tripList.filter((t) => t.status === "in_progress");
  const litres = collectionList.reduce((s, c) => s + Number(c.quantity_litres ?? 0), 0);
  const value = collectionList.reduce((s, c) => s + Number(c.total_amount ?? 0), 0);

  const lastPingFor = (agentId: string) =>
    [...pingList].reverse().find((p) => p.agent_id === agentId) ?? null;

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
        <StatCard label="Agents on route" value={active.length} icon={<Users className="h-4 w-4" />} />
        <StatCard label="GPS pings today" value={pingList.length} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Litres collected" value={litres.toFixed(1)} icon={<Milk className="h-4 w-4" />} />
        <StatCard label="Value today" value={formatCurrency(value)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="surface-card overflow-hidden p-2">
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
                      {stop ? `At ${stop.name}` : "No stop marked"} · last ping{" "}
                      {timeAgo(ping?.recorded_at ?? null)}
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
