import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Route as RouteIcon, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, PhaseCard, StatCard } from "@/components/app-shell";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated/manager")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { data: user } = useCurrentUser();
  const { data: counts } = useQuery({
    queryKey: ["manager-counts"],
    queryFn: async () => {
      const [agents, farmers, routes] = await Promise.all([
        supabase.from("agents").select("id", { count: "exact", head: true }),
        supabase.from("farmers").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
      ]);
      return {
        agents: agents.count ?? 0,
        farmers: farmers.count ?? 0,
        routes: routes.count ?? 0,
      };
    },
  });

  return (
    <AppShell>
      <PageHeading
        title="Centre dashboard"
        subtitle={
          user?.mccIds.length
            ? "Your assigned collection centre operations."
            : "No collection centre assigned to you yet — an Owner can assign one."
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Agents at my centre" value={counts?.agents ?? 0} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Farmers" value={counts?.farmers ?? 0} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Routes" value={counts?.routes ?? 0} icon={<RouteIcon className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PhaseCard
          phase="Phase 3"
          title="Collect Milk queue"
          items={[
            "From Agent — field entries flowing in from routes",
            "From Farmers at Centre — walk-in entries you weigh yourself",
            "Same milk-entry form as the agent, with QR scan-to-lookup",
          ]}
        />
        <PhaseCard
          phase="Phase 3"
          title="Verify & transfer"
          items={[
            "Verify/Confirm agent submissions before they count to MCC totals",
            "Live agent trip status, route-point progress and punch times",
            "Batch collected milk into a transfer for the dairy plant",
          ]}
        />
      </div>
      <div className="surface-card mt-4 flex items-center gap-3 p-5">
        <ClipboardCheck className="h-5 w-5 text-accent" />
        <p className="text-sm text-muted-foreground">
          Centre walk-in entries post directly; only agent field entries need your approval.
        </p>
      </div>
    </AppShell>
  );
}
