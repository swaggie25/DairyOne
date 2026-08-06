import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fingerprint, Navigation, WifiOff, Milk } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, PhaseCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated/agent")({
  component: AgentHome,
});

function AgentHome() {
  const { data: user } = useCurrentUser();
  const { data: routes } = useQuery({
    queryKey: ["agent-routes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, description, route_points(id, name, sequence)")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  return (
    <AppShell mobileFirst>
      <PageHeading
        title={`Namaste${user?.fullName ? `, ${user.fullName}` : ""}`}
        subtitle="Punch in, then start your route."
      />

      <div className="grid gap-3">
        <Button size="lg" className="touch-tile h-16 text-base">
          <Fingerprint className="h-5 w-5" /> Punch attendance
        </Button>
        <Button size="lg" variant="outline" className="touch-tile h-16 text-base">
          <Navigation className="h-5 w-5" /> Start trip
        </Button>
      </div>

      <div className="surface-card mt-5 flex items-center gap-3 p-4">
        <WifiOff className="h-5 w-5 text-accent" />
        <p className="text-sm text-muted-foreground">
          Offline mode with a local sync queue arrives in the field-flow phase — entries will never
          be lost in low network.
        </p>
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        My routes
      </h2>
      <div className="mt-3 space-y-3">
        {routes && routes.length > 0 ? (
          routes.map((r) => (
            <div key={r.id} className="surface-card p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{r.name}</p>
                <span className="text-xs text-muted-foreground">
                  {r.route_points?.length ?? 0} stops
                </span>
              </div>
              {r.description && (
                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
              )}
            </div>
          ))
        ) : (
          <div className="surface-card flex flex-col items-center p-8 text-center">
            <Milk className="h-7 w-7 text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">
              No routes assigned yet. Your Centre Manager will assign one.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <PhaseCard
          phase="Phase 2"
          title="Coming to your field app"
          items={[
            "Route points expanding into farmer lists",
            "Milk entry: quantity, fat %, SNF, CLR with auto rate and amount",
            "Digital signature capture and Bluetooth receipt printing",
            "GPS ping history and route-point arrival/departure log",
          ]}
        />
      </div>
    </AppShell>
  );
}
