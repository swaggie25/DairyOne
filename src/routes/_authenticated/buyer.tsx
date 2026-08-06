import { createFileRoute } from "@tanstack/react-router";
import { Truck, FlaskConical } from "lucide-react";
import { AppShell, PageHeading, PhaseCard, StatCard } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/buyer")({
  component: BuyerDashboard,
});

function BuyerDashboard() {
  return (
    <AppShell>
      <PageHeading
        title="Incoming transfers"
        subtitle="Milk dispatched to your plant from connected collection centres."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Transfers today" value={0} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Litres received" value={0} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Avg fat %" value="—" icon={<FlaskConical className="h-4 w-4" />} />
      </div>
      <div className="mt-6">
        <PhaseCard
          phase="Phase 3"
          title="Buyer workspace"
          items={[
            "Incoming transfer list with tanker/vehicle reference",
            "Quantity and fat/SNF quality summary per transfer",
            "Confirm receipt and flag discrepancies",
          ]}
        />
      </div>
    </AppShell>
  );
}
