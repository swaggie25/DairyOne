import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LiveCoords = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

const MIN_PING_INTERVAL_MS = 15_000;
const MIN_MOVE_METERS = 25;

function haversineMeters(a: LiveCoords, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Continuously tracks the agent's device location while a trip is active
 * (like a delivery partner app), writing throttled breadcrumbs to
 * `gps_pings` so the manager's live map updates in near real time, while
 * returning the freshest coords locally for in-app route/ETA rendering.
 */
export function useLiveLocation(params: {
  enabled: boolean;
  tripId: string | null;
  agentId: string | null;
  mccId: string | null;
  routePointId?: string | null;
}) {
  const { enabled, tripId, agentId, mccId, routePointId } = params;
  const [coords, setCoords] = useState<LiveCoords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const lastSentRef = useRef<{ at: number; coords: LiveCoords } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;

    const handlePosition = (position: GeolocationPosition) => {
      const next: LiveCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        heading: position.coords.heading ?? null,
        speed: position.coords.speed ?? null,
      };
      setCoords(next);

      const now = Date.now();
      const last = lastSentRef.current;
      const movedEnough = !last || haversineMeters(last.coords, next) >= MIN_MOVE_METERS;
      const timeElapsed = !last || now - last.at >= MIN_PING_INTERVAL_MS;
      if (!agentId || !mccId || (!movedEnough && !timeElapsed)) return;

      lastSentRef.current = { at: now, coords: next };
      void supabase.from("gps_pings").insert({
        trip_id: tripId,
        agent_id: agentId,
        mcc_id: mccId,
        route_point_id: routePointId ?? null,
        event_type: "ping",
        lat: next.lat,
        lng: next.lng,
        accuracy: next.accuracy,
      });
    };

    const handleError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setPermissionDenied(true);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    });

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [enabled, tripId, agentId, mccId, routePointId]);

  return { coords, permissionDenied };
}
