import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Droplets, IndianRupee, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { FINANCE_NAV } from "@/lib/nav";
import { formatCurrency } from "@/lib/pricing";
import { isoDaysAgo } from "@/lib/settlement";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports & trends — DairyOne" },
      {
        name: "description",
        content:
          "Daily collection volume, fat and SNF trends, village-wise procurement and payout totals for your milk collection centre.",
      },
      { property: "og:title", content: "Reports & trends — DairyOne" },
      {
        property: "og:description",
        content: "Charts that show where your milk and money are going.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsScreen,
});

type Row = {
  collected_at: string;
  quantity_litres: number | null;
  total_amount: number | null;
  fat_pct: number | null;
  snf_pct: number | null;
  session: string;
  farmers: { village: string | null } | null;
};

function ReportsScreen() {
  const { data: mcc } = useStaffMcc();
  const from = isoDaysAgo(30);

  const { data: rows } = useQuery({
    queryKey: ["report-rows", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select("collected_at, quantity_litres, total_amount, fat_pct, snf_pct, session, farmers(village)")
        .eq("mcc_id", mcc!.mccId)
        .gte("collected_at", `${from}T00:00:00Z`)
        .order("collected_at")
        .limit(3000);
      return (data ?? []) as Row[];
    },
  });

  const daily = useMemo(() => {
    const acc = new Map<string, { day: string; litres: number; amount: number; fat: number[]; snf: number[] }>();
    for (const row of rows ?? []) {
      const day = row.collected_at.slice(0, 10);
      const cur = acc.get(day) ?? { day, litres: 0, amount: 0, fat: [], snf: [] };
      cur.litres += Number(row.quantity_litres ?? 0);
      cur.amount += Number(row.total_amount ?? 0);
      if (row.fat_pct != null) cur.fat.push(Number(row.fat_pct));
      if (row.snf_pct != null) cur.snf.push(Number(row.snf_pct));
      acc.set(day, cur);
    }
    return [...acc.values()].map((d) => ({
      day: d.day.slice(5),
      litres: round1(d.litres),
      amount: round1(d.amount),
      fat: d.fat.length ? round2(mean(d.fat)) : null,
      snf: d.snf.length ? round2(mean(d.snf)) : null,
    }));
  }, [rows]);

  const villages = useMemo(() => {
    const acc = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.farmers?.village || "Unassigned";
      acc.set(key, (acc.get(key) ?? 0) + Number(row.quantity_litres ?? 0));
    }
    return [...acc.entries()]
      .map(([village, litres]) => ({ village, litres: round1(litres) }))
      .sort((a, b) => b.litres - a.litres)
      .slice(0, 8);
  }, [rows]);

  const totals = useMemo(() => {
    const litres = (rows ?? []).reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0);
    const amount = (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    return { litres: round1(litres), amount: round1(amount), avgRate: litres ? amount / litres : 0 };
  }, [rows]);

  return (
    <AppShell nav={FINANCE_NAV}>
      <PageHeading title="Reports" subtitle="Last 30 days of procurement at your collection centre." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Milk collected" value={`${totals.litres} L`} icon={<Droplets className="h-4 w-4" />} />
        <StatCard label="Procurement value" value={formatCurrency(totals.amount)} icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Average rate" value={formatCurrency(totals.avgRate)} hint="Per litre" icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="surface-card mt-4 p-5">
        <h2 className="mb-3 text-sm font-semibold">Daily volume &amp; value</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="litres"
                name="Litres"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.15}
              />
              <Area
                type="monotone"
                dataKey="amount"
                name="₹"
                stroke="hsl(var(--accent))"
                fill="hsl(var(--accent))"
                fillOpacity={0.1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Fat &amp; SNF trend</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="fat" name="Fat %" stroke="hsl(var(--primary))" dot={false} />
                <Line type="monotone" dataKey="snf" name="SNF %" stroke="hsl(var(--accent))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Collection by village</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={villages}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="village" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="litres" name="Litres" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {(rows?.length ?? 0) === 0 && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No collections in the last 30 days yet — charts fill in as milk comes in.
        </p>
      )}
    </AppShell>
  );
}

function mean(values: number[]) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
