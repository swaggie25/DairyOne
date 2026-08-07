import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ChevronDown, MapPin, Home } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MilkEntryForm, type MilkEntryTarget } from "@/components/milk-entry-form";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { getCoords } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/trip")({
  head: () => ({
    meta: [
      { title: "Live trip — DairyOne field collection" },
      {
        name: "description",
        content:
          "Work your route stop by stop: farmer lists, milk entry with auto rate, GPS log and offline sync.",
      },
      { property: "og:title", content: "Live trip — DairyOne field collection" },
      {
        property: "og:description",
        content: "Route points, farmer milk entry, offline-first sync for collection agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TripScreen,
});

function TripScreen() {
  const { data: agent } = useAgentContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pending, online } = useOfflineQueue();
  const [openPoint, setOpenPoint] = useState<string | null>(null);
  const [target, setTarget] = useState<MilkEntryTarget | null>(null);

  const { data: trip } = useQuery({
    queryKey: ["active-trip", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("route_trips")
        .select("id, route_id, status, current_route_point_id, started_at")
        .eq("agent_id", agent!.agentId)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .maybeSingle();
      return data;
    },
  });

  const { data: points } = useQuery({
    queryKey: ["trip-points", trip?.route_id],
    enabled: Boolean(trip?.route_id),
    queryFn: async () => {
      const { data } = await supabase
        .from("route_points")
        .select(
          "id, name, sequence, route_point_farmers(id, sequence, farmers(id, full_name, farmer_code, village))",
        )
        .eq("route_id", trip!.route_id)
        .order("sequence");
      return data ?? [];
    },
  });

  const { data: todayCollections } = useQuery({
    queryKey: ["trip-collections", trip?.id],
    enabled: Boolean(trip?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select("id, farmer_id, quantity_litres, total_amount")
        .eq("trip_id", trip!.id);
      return data ?? [];
    },
  });

  const collectedFarmers = new Set((todayCollections ?? []).map((c) => c.farmer_id));
  const totalLitres = (todayCollections ?? []).reduce(
    (sum, c) => sum + Number(c.quantity_litres ?? 0),
    0,
  );

  // Log a GPS ping every 2 minutes for the trip audit trail.
  useEffect(() => {
    if (!trip?.id || !agent) return;
    const ping = async () => {
      const coords = await getCoords();
      if (coords.lat == null) return;
      await supabase.from("gps_pings").insert({
        trip_id: trip.id,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        event_type: "ping",
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
      });
    };
    void ping();
    const timer = window.setInterval(() => void ping(), 120_000);
    return () => window.clearInterval(timer);
  }, [trip?.id, agent]);

  const arrive = useMutation({
    mutationFn: async (pointId: string) => {
      const coords = await getCoords();
      await supabase.from("gps_pings").insert({
        trip_id: trip!.id,
        agent_id: agent!.agentId,
        mcc_id: agent!.mccId,
        route_point_id: pointId,
        event_type: "arrival",
        lat: coords.lat,
        lng: coords.lng,
      });
      await supabase
        .from("route_trips")
        .update({ current_route_point_id: pointId })
        .eq("id", trip!.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-trip"] }),
  });

  const endTrip = useMutation({
    mutationFn: async () => {
      const coords = await getCoords();
      await supabase.from("gps_pings").insert({
        trip_id: trip!.id,
        agent_id: agent!.agentId,
        mcc_id: agent!.mccId,
        event_type: "return_to_mcc",
        lat: coords.lat,
        lng: coords.lng,
      });
      await supabase
        .from("route_trips")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", trip!.id);
    },
    onSuccess: async () => {
      toast.success("Trip closed. Milk handed over at the centre.");
      await queryClient.invalidateQueries({ queryKey: ["active-trip"] });
      navigate({ to: "/agent" });
    },
  });

  if (!trip) {
    return (
      <AppShell mobileFirst>
        <PageHeading title="No active trip" subtitle="Start a trip from your home screen." />
        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link to="/agent">
            <ArrowLeft className="h-5 w-5" /> Back to home
          </Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell mobileFirst>
      <PageHeading
        title={agent?.routeName ?? "Today's route"}
        subtitle={`${collectedFarmers.size} farmers done · ${totalLitres.toFixed(1)} L collected`}
      />

      {!online && (
        <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          Offline — {pending} entr{pending === 1 ? "y" : "ies"} waiting to sync.
        </div>
      )}

      <div className="space-y-3">
        {(points ?? []).map((point) => {
          const open = openPoint === point.id;
          const farmers = (point.route_point_farmers ?? [])
            .map((rpf) => rpf.farmers)
            .filter(Boolean);
          return (
            <div key={point.id} className="surface-card overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
                onClick={() => {
                  const next = open ? null : point.id;
                  setOpenPoint(next);
                  if (next) arrive.mutate(point.id);
                }}
              >
                <span className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span>
                    <span className="block font-semibold">{point.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {farmers.length} farmers
                    </span>
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>
              {open && (
                <ul className="divide-y divide-border border-t border-border">
                  {farmers.map((farmer) => (
                    <li key={farmer!.id} className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium">{farmer!.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {farmer!.farmer_code}
                          {farmer!.village ? ` · ${farmer!.village}` : ""}
                        </p>
                      </div>
                      {collectedFarmers.has(farmer!.id) ? (
                        <Badge variant="secondary">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Done
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            setTarget({
                              farmerId: farmer!.id,
                              farmerName: farmer!.full_name,
                              farmerCode: farmer!.farmer_code,
                              mccId: agent!.mccId,
                              agentId: agent!.agentId,
                              routePointId: point.id,
                              tripId: trip.id,
                              source: "agent",
                            })
                          }
                        >
                          Collect
                        </Button>
                      )}
                    </li>
                  ))}
                  {farmers.length === 0 && (
                    <li className="p-4 text-sm text-muted-foreground">
                      No farmers linked to this stop yet.
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <Button
        size="lg"
        variant="outline"
        className="mt-6 h-14 w-full text-base"
        onClick={() => endTrip.mutate()}
        disabled={endTrip.isPending}
      >
        <Home className="h-5 w-5" /> Return to MCC & close trip
      </Button>

      <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{target?.farmerName}</DialogTitle>
          </DialogHeader>
          {target && (
            <MilkEntryForm
              target={target}
              onSaved={() => {
                setTarget(null);
                void queryClient.invalidateQueries({ queryKey: ["trip-collections"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
