import { createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck, IndianRupee, Wallet } from "lucide-react";
import { AppShell, PageHeading, PhaseCard, StatCard } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/accountant")({
  component: AccountantDashboard,
});

function AccountantDashboard() {
  return (
    <AppShell>
      <PageHeading
        title="Finance"
        subtitle="Ledgers, settlements and payouts across the network."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Payable to farmers" value="₹0" icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Cash in hand" value="₹0" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Open ledgers" value={0} icon={<BookOpenCheck className="h-4 w-4" />} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PhaseCard
          phase="Phase 5"
          title="Ledgers & payments"
          items={[
            "Double-entry cash, bank, sale and purchase ledgers",
            "Daily earnings, weekly/biweekly settlement runs",
            "UPI and bank payouts, outstanding balances per farmer",
          ]}
        />
        <PhaseCard
          phase="Phase 5"
          title="Reports"
          items={[
            "Collection by village and by agent",
            "Fat/SNF trend charts",
            "Profit & loss, collection losses, payment history",
          ]}
        />
      </div>
    </AppShell>
  );
}
