import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ChevronDown, MapPin, Home, QrCode } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { MilkEntryForm, type MilkEntryTarget } from "@/components/milk-entry-form";

import { useAgentContext } from "@/hooks/useAgentContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { getCoords } from "@/lib/geo";
import { QrScanner } from "@/components/qr-scanner";
import { cardCodeFor } from "@/lib/qr";

export const Route = createFileRoute("/_authenticated/trip")({
  head: () => ({
    meta: [
      { title: "Live trip — DairyOne field collection" },
      {
        name: "description",
        content: "Work your route stop by stop: farmer lists, milk entry with auto rate, GPS log and offline sync.",
      },
    ],
  }),
  component: TripScreen,
});

type Farmer = {
  id: string;
  full_name: string;
  farmer_code: string;
  village: string | null;
};

type RoutePoint = {
  id: string;
  name: string;
  sequence: number;
};

type Assignment = {
  id: string;
  route_point_id: string;
  farmer_id: string;
  sequence: number;
};

type PointWithFarmers = RoutePoint & {
  farmers: Farmer[];
};

function TripScreen() {
  const { data: agent } = useAgentContext();

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { pending, online } = useOfflineQueue();

  const [openPoint, setOpenPoint] = useState<string | null>(null);

  const [target, setTarget] = useState<MilkEntryTarget | null>(null);

  const [scanOpen, setScanOpen] = useState(false);

  /*
   * ACTIVE TRIP
   */

  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
  } = useQuery({
    queryKey: ["active-trip", agent?.agentId],

    enabled: Boolean(agent?.agentId),

    queryFn: async () => {
      if (!agent?.agentId) return null;

      const { data, error } = await supabase
        .from("route_trips")
        .select(
          `
          id,
          route_id,
          status,
          current_route_point_id,
          started_at
        `,
        )
        .eq("agent_id", agent.agentId)
        .eq("status", "in_progress")
        .order("created_at", {
          ascending: false,
        })
        .maybeSingle();

      if (error) {
        console.error("ACTIVE TRIP ERROR:", error);
        throw error;
      }

      return data;
    },
  });

  /*
   * ROUTE POINTS
   *
   * We fetch ONLY points here.
   * Do not depend on nested Supabase relations.
   */

  const {
    data: routePoints = [],
    isLoading: pointsLoading,
    error: pointsError,
  } = useQuery({
    queryKey: ["trip-route-points", trip?.route_id],

    enabled: Boolean(trip?.route_id),

    queryFn: async () => {
      if (!trip?.route_id) return [];

      const { data, error } = await supabase
        .from("route_points")
        .select(
          `
          id,
          name,
          sequence
        `,
        )
        .eq("route_id", trip.route_id)
        .order("sequence");

      if (error) {
        console.error("ROUTE POINTS ERROR:", error);
        throw error;
      }

      return (data ?? []) as RoutePoint[];
    },
  });

  /*
   * FARMER ASSIGNMENTS
   *
   * Fetch all farmer <-> route point mappings separately.
   */

  const pointIds = routePoints.map((point) => point.id);

  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery({
    queryKey: ["trip-farmer-assignments", trip?.route_id, pointIds],

    enabled: pointIds.length > 0,

    queryFn: async () => {
      if (pointIds.length === 0) return [];

      const { data, error } = await supabase
        .from("route_point_farmers")
        .select(
          `
          id,
          route_point_id,
          farmer_id,
          sequence
        `,
        )
        .in("route_point_id", pointIds)
        .order("sequence");

      if (error) {
        console.error("ROUTE POINT FARMERS ERROR:", error);

        throw error;
      }

      return (data ?? []) as Assignment[];
    },
  });

  /*
   * FARMERS
   *
   * Fetch farmer records separately.
   */

  const farmerIds = assignments.map((assignment) => assignment.farmer_id);

  const {
    data: farmers = [],
    isLoading: farmersLoading,
    error: farmersError,
  } = useQuery({
    queryKey: ["trip-farmers", farmerIds],

    enabled: farmerIds.length > 0,

    queryFn: async () => {
      if (farmerIds.length === 0) return [];

      const { data, error } = await supabase
        .from("farmers")
        .select(
          `
          id,
          full_name,
          farmer_code,
          village
        `,
        )
        .in("id", farmerIds)
        .eq("status", "active")
        .order("full_name");

      if (error) {
        console.error("FARMERS ERROR:", error);
        throw error;
      }

      return (data ?? []) as Farmer[];
    },
  });

  /*
   * BUILD POINT + FARMERS STRUCTURE
   */

  const points: PointWithFarmers[] = routePoints.map((point) => {
    const pointAssignments = assignments
      .filter((assignment) => assignment.route_point_id === point.id)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    const pointFarmers = pointAssignments
      .map((assignment) => farmers.find((farmer) => farmer.id === assignment.farmer_id))
      .filter((farmer): farmer is Farmer => Boolean(farmer));

    return {
      ...point,
      farmers: pointFarmers,
    };
  });

  /*
   * TODAY COLLECTIONS
   */

  const { data: todayCollections = [] } = useQuery({
    queryKey: ["trip-collections", trip?.id],

    enabled: Boolean(trip?.id),

    queryFn: async () => {
      if (!trip?.id) return [];

      const { data, error } = await supabase
        .from("milk_collections")
        .select(
          `
          id,
          farmer_id,
          quantity_litres,
          total_amount
        `,
        )
        .eq("trip_id", trip.id);

      if (error) {
        console.error("TRIP COLLECTION ERROR:", error);
        throw error;
      }

      return data ?? [];
    },
  });

  const collectedFarmers = new Set(todayCollections.map((collection) => collection.farmer_id));

  const totalLitres = todayCollections.reduce((sum, collection) => sum + Number(collection.quantity_litres ?? 0), 0);

  /*
   * ALL FARMERS FOR QR SCANNING
   */

  const allFarmers = points.flatMap((point) =>
    point.farmers.map((farmer) => ({
      id: farmer.id,
      full_name: farmer.full_name,
      farmer_code: farmer.farmer_code,
      pointId: point.id,
    })),
  );

  /*
   * GPS PING
   */

  useEffect(() => {
    if (!trip?.id || !agent) return;

    const ping = async () => {
      const coords = await getCoords();

      if (coords.lat == null) return;

      const { error } = await supabase.from("gps_pings").insert({
        trip_id: trip.id,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        event_type: "ping",
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
      });

      if (error) {
        console.error("GPS PING ERROR:", error);
      }
    };

    void ping();

    const timer = window.setInterval(() => void ping(), 120000);

    return () => window.clearInterval(timer);
  }, [trip?.id, agent]);

  /*
   * ARRIVE AT POINT
   */

  const arrive = useMutation({
    mutationFn: async (pointId: string) => {
      if (!trip || !agent) return;

      const coords = await getCoords();

      const { error: gpsError } = await supabase.from("gps_pings").insert({
        trip_id: trip.id,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        route_point_id: pointId,
        event_type: "arrival",
        lat: coords.lat,
        lng: coords.lng,
      });

      if (gpsError) {
        console.error("ARRIVAL GPS ERROR:", gpsError);
      }

      const { error } = await supabase
        .from("route_trips")
        .update({
          current_route_point_id: pointId,
        })
        .eq("id", trip.id);

      if (error) throw error;
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["active-trip"],
      });
    },

    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  /*
   * END TRIP
   */

  const endTrip = useMutation({
    mutationFn: async () => {
      if (!trip || !agent) return;

      const coords = await getCoords();

      const { error: gpsError } = await supabase.from("gps_pings").insert({
        trip_id: trip.id,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        event_type: "return_to_mcc",
        lat: coords.lat,
        lng: coords.lng,
      });

      if (gpsError) {
        console.error("RETURN GPS ERROR:", gpsError);
      }

      const { error } = await supabase
        .from("route_trips")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
        })
        .eq("id", trip.id);

      if (error) throw error;
    },

    onSuccess: async () => {
      toast.success("Trip closed. Milk handed over at the centre.");

      await queryClient.invalidateQueries({
        queryKey: ["active-trip"],
      });

      navigate({
        to: "/agent",
      });
    },

    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  /*
   * LOADING
   */

  if (tripLoading) {
    return (
      <AppShell mobileFirst>
        <PageHeading title="Loading trip..." subtitle="Please wait." />
      </AppShell>
    );
  }

  /*
   * ERROR DISPLAY
   */

  if (tripError || pointsError || assignmentsError || farmersError) {
    const error = tripError || pointsError || assignmentsError || farmersError;

    console.error("TRIP SCREEN ERROR:", error);

    return (
      <AppShell mobileFirst>
        <PageHeading
          title="Unable to load route"
          subtitle={error instanceof Error ? error.message : "Unknown database error"}
        />

        <Button
          onClick={() => {
            void queryClient.invalidateQueries({
              queryKey: ["active-trip"],
            });

            void queryClient.invalidateQueries({
              queryKey: ["trip-route-points"],
            });

            void queryClient.invalidateQueries({
              queryKey: ["trip-farmer-assignments"],
            });

            void queryClient.invalidateQueries({
              queryKey: ["trip-farmers"],
            });
          }}
        >
          Try again
        </Button>
      </AppShell>
    );
  }

  /*
   * NO ACTIVE TRIP
   */

  if (!trip) {
    return (
      <AppShell mobileFirst>
        <PageHeading title="No active trip" subtitle="Start a trip from your home screen." />

        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link to="/agent">
            <ArrowLeft className="h-5 w-5" />
            Back to home
          </Link>
        </Button>
      </AppShell>
    );
  }

  const loadingFarmers = pointsLoading || assignmentsLoading || farmersLoading;

  return (
    <AppShell mobileFirst>
      <PageHeading
        title={agent?.routeName ?? "Today's route"}
        subtitle={`${collectedFarmers.size} farmers done · ${totalLitres.toFixed(1)} L collected`}
      />

      {!online && (
        <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          Offline — {pending} entr
          {pending === 1 ? "y" : "ies"} waiting to sync.
        </div>
      )}

      <Button variant="outline" className="mb-4 h-12 w-full" onClick={() => setScanOpen(true)}>
        <QrCode className="h-4 w-4" />
        Scan farmer QR card
      </Button>

      {loadingFarmers && <div className="mb-4 text-center text-sm text-muted-foreground">Loading farmers...</div>}

      <div className="space-y-3">
        {points.map((point) => {
          const open = openPoint === point.id;

          return (
            <div key={point.id} className="surface-card overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
                onClick={() => {
                  const next = open ? null : point.id;

                  setOpenPoint(next);

                  if (next) {
                    arrive.mutate(point.id);
                  }
                }}
              >
                <span className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-primary" />

                  <span>
                    <span className="block font-semibold">{point.name}</span>

                    <span className="text-xs text-muted-foreground">{point.farmers.length} farmers</span>
                  </span>
                </span>

                <ChevronDown
                  className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && (
                <ul className="divide-y divide-border border-t border-border">
                  {point.farmers.map((farmer) => (
                    <li key={farmer.id} className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium">{farmer.full_name}</p>

                        <p className="text-xs text-muted-foreground">
                          {farmer.farmer_code}

                          {farmer.village ? ` · ${farmer.village}` : ""}
                        </p>
                      </div>

                      {collectedFarmers.has(farmer.id) ? (
                        <Badge variant="secondary">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Done
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            setTarget({
                              farmerId: farmer.id,

                              farmerName: farmer.full_name,

                              farmerCode: farmer.farmer_code,

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

                  {point.farmers.length === 0 && (
                    <li className="p-4 text-sm text-muted-foreground">No farmers linked to this stop yet.</li>
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
        <Home className="h-5 w-5" />
        Return to MCC & close trip
      </Button>

      {/* QR SCANNER */}

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan farmer card</DialogTitle>
          </DialogHeader>

          <QrScanner
            onResult={(code) => {
              const normalizedCode = code.toUpperCase();

              const match = allFarmers.find(
                (farmer) => cardCodeFor("farmer", farmer.farmer_code).toUpperCase() === normalizedCode,
              );

              if (!match) {
                toast.error("No farmer on this route matches that card.");

                return;
              }

              setScanOpen(false);

              setTarget({
                farmerId: match.id,

                farmerName: match.full_name,

                farmerCode: match.farmer_code,

                mccId: agent!.mccId,

                agentId: agent!.agentId,

                routePointId: match.pointId,

                tripId: trip.id,

                source: "agent",
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* MILK ENTRY */}

      <Dialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{target?.farmerName}</DialogTitle>
          </DialogHeader>

          {target && (
            <MilkEntryForm
              target={target}
              onSaved={() => {
                setTarget(null);

                void queryClient.invalidateQueries({
                  queryKey: ["trip-collections"],
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
