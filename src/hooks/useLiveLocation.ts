import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  classifyQuality,
  getBatteryLevel,
  nextSampleIntervalMs,
  type FixQuality,
} from "@/lib/tracking-quality";

export type LiveCoords = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  quality: FixQuality;
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** m/s (what the Geolocation API gives us) → km/h. */
function speedToKmh(speedMs: number | null): number | null {
  return speedMs == null ? null : speedMs * 3.6;
}

/**
 * LIVE TRACKING PLAN — PHASE 3: Continuous GPS + Location Storage
 *
 * Continuously watches the device position (like a delivery-partner app)
 * whenever `enabled`, writing breadcrumbs to `gps_pings` so the manager's
 * live map (Phase 4) updates in near real time, while returning the
 * freshest coords locally for in-app route/ETA rendering.
 *
 * What changed from the pre-Phase-3 version:
 *  - Sampling is adaptive (`nextSampleIntervalMs`) instead of a flat
 *    15s/25m throttle: tighter while moving, backed off while stationary,
 *    weak-signal, offline, or on low battery.
 *  - Every fix is classified `good` | `weak` | `stale` and stored as such
 *    (never silently treated as exact) — see tracking-quality.ts.
 *  - Writes now carry `tracking_session_id` (so tracking starts at Punch
 *    In per Phase 2, not only once a trip exists) alongside the existing
 *    `trip_id`, plus heading/altitude, and a client-generated `client_id`
 *    so a duplicate watchPosition fire or retry can never double-insert.
 *
 * Still direct/online writes — the local retry queue + "Pending
 * Sync"/"Sync Failed" states are Phase 8 scope; a write that fails here
 * today is simply skipped (never queued yet, never faked as sent).
 */
export function useLiveLocation(params: {
  enabled: boolean;
  tripId: string | null;
  trackingSessionId: string | null;
  agentId: string | null;
  mccId: string | null;
  routePointId?: string | null;
}) {
  const { enabled, tripId, trackingSessionId, agentId, mccId, routePointId } = params;
  const [coords, setCoords] = useState<LiveCoords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const lastSentRef = useRef<{ at: number; coords: { lat: number; lng: number } } | null>(null);
  const batteryRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    void getBatteryLevel().then((level) => {
      if (!cancelled) batteryRef.current = level;
    });
    // Battery level can change materially over a multi-hour shift; refresh
    // occasionally rather than trusting the value read at mount forever.
    const batteryPoll = setInterval(() => {
      void getBatteryLevel().then((level) => {
        if (!cancelled) batteryRef.current = level;
      });
    }, 5 * 60_000);

    const handlePosition = (position: GeolocationPosition) => {
      const ageMs = Math.max(0, Date.now() - position.timestamp);
      const quality = classifyQuality(position.coords.accuracy ?? null, ageMs);
      const next: LiveCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        heading: position.coords.heading ?? null,
        speed: position.coords.speed ?? null,
        quality,
      };
      setCoords(next);

      // Always update local state (for in-app ETA/map) even for stale/weak
      // fixes, but decide independently whether THIS fix is worth writing.
      const now = Date.now();
      const last = lastSentRef.current;
      const distanceSinceLastM = last ? haversineMeters(last.coords, next) : Infinity;
      const dueByInterval =
        !last ||
        now - last.at >=
          nextSampleIntervalMs({
            distanceSinceLastM,
            speedKmh: speedToKmh(next.speed),
            quality,
            online: typeof navigator !== "undefined" ? navigator.onLine : true,
            batteryLevel: batteryRef.current,
          });

      if (!agentId || !mccId || !dueByInterval) return;

      lastSentRef.current = { at: now, coords: { lat: next.lat, lng: next.lng } };
      const clientId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${agentId}-${now}-${Math.random()}`;

      void supabase.from("gps_pings").insert({
        trip_id: tripId,
        tracking_session_id: trackingSessionId,
        agent_id: agentId,
        mcc_id: mccId,
        route_point_id: routePointId ?? null,
        event_type: "ping",
        lat: next.lat,
        lng: next.lng,
        accuracy: next.accuracy,
        heading: next.heading,
        altitude: position.coords.altitude ?? null,
        speed_kmh: speedToKmh(next.speed),
        quality: next.quality,
        client_id: clientId,
        recorded_at: new Date(position.timestamp).toISOString(),
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
      cancelled = true;
      clearInterval(batteryPoll);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [enabled, tripId, trackingSessionId, agentId, mccId, routePointId]);

  return { coords, permissionDenied };
}
