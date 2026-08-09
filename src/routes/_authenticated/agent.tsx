import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Navigation, WifiOff, Milk, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { getCoords } from "@/lib/geo";
import { formatCurrency } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/agent")({
  head: () => ({
    meta: [
      { title: "Agent home — DairyOne field collection" },
      {
        name: "description",
        content:
          "Punch GPS attendance, start your milk collection trip and track today's litres — works offline.",
      },
      { property: "og:title", content: "Agent home — DairyOne field collection" },
      {
        property: "og:description",
        content: "GPS attendance, route trips and offline milk entry for collection agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentHome,
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function AgentHome() {
  const { data: user } = useCurrentUser();
  const { data: agent, isLoading: agentLoading } = useAgentContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pending, online, flush } = useOfflineQueue();

  const { data: attendance } = useQuery({
    queryKey: ["attendance-today", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("id, punch_in_at, punch_out_at")
        .eq("agent_id", agent!.agentId)
        .gte("punch_in_at", `${today()}T00:00:00Z`)
        .order("punch_in_at", { ascending: false })
        .maybeSingle();
      return data;
    },
  });

  const { data: trip } = useQuery({
    queryKey: ["active-trip", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("route_trips")
        .select("id, status, route_id")
        .eq("agent_id", agent!.agentId)
        .eq("trip_date", today())
        .order("created_at", { ascending: false })
        .maybeSingle();
      return data;
    },
  });

  const { data: totals } = useQuery({
    queryKey: ["agent-today-totals", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select("quantity_litres, total_amount")
        .eq("agent_id", agent!.agentId)
        .gte("collected_at", `${today()}T00:00:00Z`);
      return {
        litres: (data ?? []).reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0),
        amount: (data ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
        entries: data?.length ?? 0,
      };
    },
  });

  const punch = useMutation({
    mutationFn: async () => {
      const coords = await getCoords();
      if (attendance && !attendance.punch_out_at) {
        const { error } = await supabase
          .from("attendance")
          .update({
            punch_out_at: new Date().toISOString(),
            punch_out_lat: coords.lat,
            punch_out_lng: coords.lng,
          })
          .eq("id", attendance.id);
        if (error) throw error;
        return "out" as const;
      }
      const { error } = await supabase.from("attendance").insert({
        agent_id: agent!.agentId,
        mcc_id: agent!.mccId,
        route_id: agent!.routeId,
        punch_in_lat: coords.lat,
        punch_in_lng: coords.lng,
      });
      if (error) throw error;
      return "in" as const;
    },
    onSuccess: async (kind) => {
      toast.success(kind === "in" ? "Punched in with GPS" : "Punched out. Have a good day!");
      await queryClient.invalidateQueries({ queryKey: ["attendance-today"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startTrip = useMutation({
    mutationFn: async () => {
      if (!agent?.routeId) throw new Error("No route assigned yet.");
      if (trip?.status === "in_progress") return trip.id;
      const { data, error } = await supabase
        .from("route_trips")
        .insert({
          agent_id: agent.agentId,
          mcc_id: agent.mccId,
          route_id: agent.routeId,
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["active-trip"] });
      navigate({ to: "/trip" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const punchedIn = Boolean(attendance && !attendance.punch_out_at);

  return (
    <AppShell mobileFirst>
      <PageHeading
        title={`Namaste${user?.fullName ? `, ${user.fullName}` : ""}`}
        subtitle={
          agent?.routeName
            ? `Route: ${agent.routeName}`
            : "Punch in, then start your route."
        }
      />

      {!agentLoading && !agent && (
        <div className="surface-card mb-4 p-4 text-sm text-muted-foreground">
          Your agent profile isn't linked yet. Ask your Centre Manager to add you as an agent.
        </div>
      )}

      <div className="grid gap-3">
        <Button
          size="lg"
          className="touch-tile h-16 text-base"
          disabled={!agent || punch.isPending}
          onClick={() => punch.mutate()}
        >
          {punchedIn ? <CheckCircle2 className="h-5 w-5" /> : <Fingerprint className="h-5 w-5" />}
          {punchedIn ? "Punch out" : "Punch attendance"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="touch-tile h-16 text-base"
          disabled={!agent || !punchedIn || startTrip.isPending}
          onClick={() => (trip?.status === "in_progress" ? navigate({ to: "/trip" }) : startTrip.mutate())}
        >
          <Navigation className="h-5 w-5" />
          {trip?.status === "in_progress" ? "Continue trip" : "Start trip"}
        </Button>
        <Button asChild size="lg" variant="ghost" className="h-12 text-base">
          <Link to="/collections">My collections</Link>
        </Button>
        {!punchedIn && agent && (
          <p className="text-center text-xs text-muted-foreground">
            Punch attendance first to unlock your trip.
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="Litres today" value={(totals?.litres ?? 0).toFixed(1)} />
        <StatCard label="Entries" value={totals?.entries ?? 0} />
        <StatCard label="Value" value={formatCurrency(totals?.amount ?? 0)} />
      </div>

      <div className="surface-card mt-5 flex items-center gap-3 p-4">
        <WifiOff className={`h-5 w-5 ${online ? "text-muted-foreground" : "text-accent"}`} />
        <p className="flex-1 text-sm text-muted-foreground">
          {online
            ? pending > 0
              ? `${pending} entries syncing…`
              : "All entries synced. Offline capture is ready if network drops."
            : `Offline — ${pending} entries saved on this phone.`}
        </p>
        {pending > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void flush()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!agent?.routeId && agent && (
        <div className="surface-card mt-5 flex flex-col items-center p-8 text-center">
          <Milk className="h-7 w-7 text-primary" />
          <p className="mt-2 text-sm text-muted-foreground">
            No route assigned yet. Your Centre Manager will assign one.
          </p>
        </div>
      )}
    </AppShell>
  );
}
