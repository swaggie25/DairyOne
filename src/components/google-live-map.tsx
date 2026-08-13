import { useEffect, useMemo, useRef, useState } from "react";
import { decodePolyline, loadGoogleMaps } from "@/lib/google-maps-loader";
import type { LiveCollection, LivePing, LiveRoutePoint, LiveTrip } from "@/hooks/useLiveOps";

export type MapProps = {
  centre: { name: string; lat: number | null; lng: number | null } | null | undefined;
  trips: LiveTrip[];
  pings: LivePing[];
  points: LiveRoutePoint[];
  collections: LiveCollection[];
  focusAgentId: string | null;
  /** Encoded polyline of a computed driving route to overlay. */
  directionsPolyline?: string | null;
};

const TRAIL_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#ea580c", "#be123c", "#0891b2"];
const DEFAULT_CENTRE = { lat: 22.3072, lng: 73.1812 };

export default function GoogleLiveMap({
  centre,
  trips,
  pings,
  points,
  collections,
  focusAgentId,
  directionsPolyline,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<google.maps.Marker | google.maps.Polyline>>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: DEFAULT_CENTRE,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        infoRef.current = new maps.InfoWindow();
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const trailsByAgent = useMemo(() => {
    const map = new Map<string, google.maps.LatLngLiteral[]>();
    for (const p of pings) {
      if (p.lat == null || p.lng == null) continue;
      const list = map.get(p.agent_id) ?? [];
      list.push({ lat: p.lat, lng: p.lng });
      map.set(p.agent_id, list);
    }
    return map;
  }, [pings]);

  const shownAgents = useMemo(() => {
    if (focusAgentId) return [focusAgentId];
    return trips
      .filter((t) => t.status === "in_progress")
      .map((t) => t.agent_id)
      .filter((id, i, arr) => arr.indexOf(id) === i);
  }, [trips, focusAgentId]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = typeof window !== "undefined" ? window.google?.maps : undefined;
    if (!ready || !map || !maps) return;

    for (const o of overlaysRef.current) o.setMap(null);
    overlaysRef.current = [];

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;

    const dot = (color: string, scale: number, stroke = "#ffffff") => ({
      path: maps.SymbolPath.CIRCLE,
      scale,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: stroke,
      strokeWeight: 2,
    });

    const addMarker = (
      position: google.maps.LatLngLiteral,
      title: string,
      icon: google.maps.Symbol,
      zIndex = 1,
    ) => {
      const marker = new maps.Marker({ map, position, icon, title, zIndex });
      marker.addListener("click", () => {
        infoRef.current?.setContent(`<div style="font-size:13px">${title}</div>`);
        infoRef.current?.open({ map, anchor: marker });
      });
      overlaysRef.current.push(marker);
      bounds.extend(position);
      hasBounds = true;
    };

    if (centre?.lat != null && centre.lng != null) {
      addMarker({ lat: centre.lat, lng: centre.lng }, `${centre.name} (centre)`, dot("#0f172a", 9), 5);
    }

    for (const p of points) {
      if (p.lat == null || p.lng == null) continue;
      addMarker({ lat: p.lat, lng: p.lng }, `Stop ${p.sequence}: ${p.name}`, dot("#94a3b8", 6));
    }

    for (const c of collections) {
      if (c.gps_lat == null || c.gps_lng == null) continue;
      const risky = Number(c.risk_score ?? 0) >= 40;
      addMarker(
        { lat: c.gps_lat, lng: c.gps_lng },
        `${c.farmers?.full_name ?? "Farmer"} · ${Number(c.quantity_litres).toFixed(1)} L`,
        dot(risky ? "#dc2626" : "#16a34a", 5),
      );
    }

    shownAgents.forEach((agentId, i) => {
      const trail = trailsByAgent.get(agentId) ?? [];
      if (trail.length === 0) return;
      const color = TRAIL_COLORS[i % TRAIL_COLORS.length]!;
      if (trail.length > 1) {
        const line = new maps.Polyline({
          map,
          path: trail,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 4,
        });
        overlaysRef.current.push(line);
        for (const p of trail) {
          bounds.extend(p);
          hasBounds = true;
        }
      }
      const trip = trips.find((t) => t.agent_id === agentId);
      addMarker(trail[trail.length - 1]!, trip?.agents?.full_name ?? "Agent", dot(color, 8), 10);
    });

    if (directionsPolyline) {
      const path = decodePolyline(directionsPolyline);
      const line = new maps.Polyline({
        map,
        path,
        strokeColor: "#1d4ed8",
        strokeOpacity: 0.55,
        strokeWeight: 7,
      });
      overlaysRef.current.push(line);
      for (const p of path) {
        bounds.extend(p);
        hasBounds = true;
      }
    }

    if (hasBounds) {
      map.fitBounds(bounds, 48);
      const listener = maps.event.addListenerOnce(map, "idle", () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
      });
      return () => maps.event.removeListener(listener);
    }
    return;
  }, [ready, centre, points, collections, trips, trailsByAgent, shownAgents, directionsPolyline]);

  if (error) {
    return (
      <div className="flex h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground lg:h-[560px]">
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className="h-[420px] w-full rounded-xl lg:h-[560px]" />;
}
