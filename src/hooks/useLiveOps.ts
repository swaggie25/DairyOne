import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LiveTrip = {
  id: string;
  status: string;
  session: string;
  started_at: string | null;
  ended_at: string | null;
  route_id: string;
  agent_id: string;
  current_route_point_id: string | null;
  agents: { full_name: string; employee_code: string } | null;
  routes: { name: string } | null;
};

export type LivePing = {
  id: string;
  agent_id: string;
  trip_id: string | null;
  event_type: string;
  lat: number | null;
  lng: number | null;
  recorded_at: string;
};

export type LiveCollection = {
  id: string;
  quantity_litres: number;
  total_amount: number;
  status: string;
  collected_at: string;
  risk_score: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  farmers: { full_name: string; farmer_code: string } | null;
  agents: { full_name: string } | null;
};

export type LiveRoutePoint = {
  id: string;
  route_id: string;
  name: string;
  sequence: number;
  lat: number | null;
  lng: number | null;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Today's trips for a centre, newest first. */
export function useLiveTrips(mccId: string | undefined) {
  return useQuery<LiveTrip[]>({
    queryKey: ["live-trips", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("route_trips")
        .select(
          "id, status, session, started_at, ended_at, route_id, agent_id, current_route_point_id, agents(full_name, employee_code), routes(name)",
        )
        .eq("mcc_id", mccId!)
        .gte("created_at", startOfToday())
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as LiveTrip[];
    },
  });
}

/** Today's GPS breadcrumbs for a centre. */
export function useLivePings(mccId: string | undefined) {
  return useQuery<LivePing[]>({
    queryKey: ["live-pings", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("gps_pings")
        .select("id, agent_id, trip_id, event_type, lat, lng, recorded_at")
        .eq("mcc_id", mccId!)
        .gte("recorded_at", startOfToday())
        .order("recorded_at", { ascending: true })
        .limit(1000);
      return (data ?? []) as LivePing[];
    },
  });
}

/** Today's collections feed for a centre. */
export function useLiveCollections(mccId: string | undefined) {
  return useQuery<LiveCollection[]>({
    queryKey: ["live-collections", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select(
          "id, quantity_litres, total_amount, status, collected_at, risk_score, gps_lat, gps_lng, farmers(full_name, farmer_code), agents(full_name)",
        )
        .eq("mcc_id", mccId!)
        .gte("collected_at", startOfToday())
        .order("collected_at", { ascending: false })
        .limit(60);
      return (data ?? []) as unknown as LiveCollection[];
    },
  });
}

export function useRoutePoints(mccId: string | undefined) {
  return useQuery<LiveRoutePoint[]>({
    queryKey: ["live-route-points", mccId],
    enabled: Boolean(mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data: routes } = await supabase
        .from("routes")
        .select("id")
        .eq("mcc_id", mccId!)
        .eq("active", true);
      const ids = (routes ?? []).map((r) => r.id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("route_points")
        .select("id, route_id, name, sequence, lat, lng")
        .in("route_id", ids)
        .order("sequence");
      return (data ?? []) as LiveRoutePoint[];
    },
  });
}

export function useCentreLocation(mccId: string | undefined) {
  return useQuery({
    queryKey: ["centre-location", mccId],
    enabled: Boolean(mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("name, lat, lng")
        .eq("id", mccId!)
        .maybeSingle();
      return data;
    },
  });
}

/** Refreshes live queries the moment a ping, trip change or collection lands. */
export function useLiveOpsRealtime(mccId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!mccId) return;
    const invalidate = (key: string) => void queryClient.invalidateQueries({ queryKey: [key] });
    const channel = supabase
      .channel(`live-ops-${mccId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gps_pings", filter: `mcc_id=eq.${mccId}` },
        () => invalidate("live-pings"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_trips", filter: `mcc_id=eq.${mccId}` },
        () => invalidate("live-trips"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "milk_collections", filter: `mcc_id=eq.${mccId}` },
        () => invalidate("live-collections"),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mccId, queryClient]);
}
