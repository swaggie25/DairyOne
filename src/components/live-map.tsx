import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveCollection, LivePing, LiveRoutePoint, LiveTrip } from "@/hooks/useLiveOps";

export type MapProps = {
  centre: { name: string; lat: number | null; lng: number | null } | null | undefined;
  trips: LiveTrip[];
  pings: LivePing[];
  points: LiveRoutePoint[];
  collections: LiveCollection[];
  focusAgentId: string | null;
};

const TRAIL_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#ea580c", "#be123c", "#0891b2"];

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0]!, 14);
      return;
    }
    map.fitBounds(positions, { padding: [40, 40], maxZoom: 15 });
  }, [map, positions]);
  return null;
}

export default function LiveMap({
  centre,
  trips,
  pings,
  points,
  collections,
  focusAgentId,
}: MapProps) {
  const trailsByAgent = useMemo(() => {
    const map = new Map<string, [number, number][]>();
    for (const p of pings) {
      if (p.lat == null || p.lng == null) continue;
      const list = map.get(p.agent_id) ?? [];
      list.push([p.lat, p.lng]);
      map.set(p.agent_id, list);
    }
    return map;
  }, [pings]);

  const activeAgents = useMemo(
    () =>
      trips
        .filter((t) => t.status === "in_progress")
        .map((t) => t.agent_id)
        .filter((id, i, arr) => arr.indexOf(id) === i),
    [trips],
  );

  const shownAgents = focusAgentId ? [focusAgentId] : activeAgents;

  const positions = useMemo(() => {
    const all: [number, number][] = [];
    if (centre?.lat != null && centre.lng != null) all.push([centre.lat, centre.lng]);
    for (const id of shownAgents) all.push(...(trailsByAgent.get(id) ?? []));
    for (const p of points) if (p.lat != null && p.lng != null) all.push([p.lat, p.lng]);
    return all;
  }, [centre, shownAgents, trailsByAgent, points]);

  const fallbackCentre: [number, number] =
    positions[0] ?? [22.3072, 73.1812]; // Gujarat dairy belt default

  return (
    <MapContainer
      center={fallbackCentre}
      zoom={12}
      scrollWheelZoom
      className="h-[420px] w-full rounded-xl lg:h-[560px]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds positions={positions} />

      {centre?.lat != null && centre.lng != null && (
        <CircleMarker
          center={[centre.lat, centre.lng]}
          radius={11}
          pathOptions={{ color: "#0f172a", fillColor: "#0f172a", fillOpacity: 0.85 }}
        >
          <Tooltip direction="top">{centre.name} (centre)</Tooltip>
        </CircleMarker>
      )}

      {points.map((p) =>
        p.lat != null && p.lng != null ? (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={6}
            pathOptions={{ color: "#64748b", fillColor: "#cbd5e1", fillOpacity: 0.9 }}
          >
            <Tooltip direction="top">
              Stop {p.sequence}: {p.name}
            </Tooltip>
          </CircleMarker>
        ) : null,
      )}

      {collections.map((c) =>
        c.gps_lat != null && c.gps_lng != null ? (
          <CircleMarker
            key={c.id}
            center={[c.gps_lat, c.gps_lng]}
            radius={5}
            pathOptions={{
              color: Number(c.risk_score ?? 0) >= 40 ? "#dc2626" : "#16a34a",
              fillOpacity: 0.9,
            }}
          >
            <Tooltip direction="top">
              {c.farmers?.full_name ?? "Farmer"} · {Number(c.quantity_litres).toFixed(1)} L
            </Tooltip>
          </CircleMarker>
        ) : null,
      )}

      {shownAgents.map((agentId, i) => {
        const trail = trailsByAgent.get(agentId) ?? [];
        if (trail.length === 0) return null;
        const color = TRAIL_COLORS[i % TRAIL_COLORS.length]!;
        const last = trail[trail.length - 1]!;
        const trip = trips.find((t) => t.agent_id === agentId);
        return (
          <Fragment key={agentId}>
            {trail.length > 1 && (
              <Polyline positions={trail} pathOptions={{ color, weight: 4, opacity: 0.7 }} />
            )}
            <CircleMarker
              center={last}
              radius={10}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.95 }}
            >
              <Tooltip direction="top" permanent>
                {trip?.agents?.full_name ?? "Agent"}
              </Tooltip>
            </CircleMarker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
