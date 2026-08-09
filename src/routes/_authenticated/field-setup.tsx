import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Users, Route as RouteIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/field-setup")({
  head: () => ({
    meta: [
      { title: "Field setup — agents, routes & farmers | DairyOne" },
      {
        name: "description",
        content:
          "Add collection agents, build routes with ordered stops, register farmers and assign them to route points.",
      },
      { property: "og:title", content: "Field setup — agents, routes & farmers | DairyOne" },
      {
        property: "og:description",
        content: "Manage agents, routes, collection stops and farmer assignments for your centre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FieldSetup,
});

function FieldSetup() {
  const queryClient = useQueryClient();
  const [mccId, setMccId] = useState<string>("");

  const { data: centres } = useQuery({
    queryKey: ["centres"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("id, name, code")
        .eq("active", true)
        .order("name");
      if (data?.length && !mccId) setMccId(data[0].id);
      return data ?? [];
    },
  });

  const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: [key] });

  return (
    <AppShell>
      <PageHeading
        title="Field setup"
        subtitle="Agents, routes, collection stops and farmer assignments for your centre."
      />

      <div className="mb-6 flex items-end gap-3">
        <div className="w-full max-w-xs">
          <Label htmlFor="centre">Collection centre</Label>
          <Select value={mccId} onValueChange={setMccId}>
            <SelectTrigger id="centre" className="mt-1.5">
              <SelectValue placeholder="Select centre" />
            </SelectTrigger>
            <SelectContent>
              {(centres ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!mccId ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">
          No collection centre available to you yet.
        </div>
      ) : (
        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="routes">Routes & stops</TabsTrigger>
            <TabsTrigger value="farmers">Farmers</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <AgentsTab mccId={mccId} onChange={() => invalidate("setup-agents")} />
          </TabsContent>
          <TabsContent value="routes" className="mt-4">
            <RoutesTab mccId={mccId} />
          </TabsContent>
          <TabsContent value="farmers" className="mt-4">
            <FarmersTab mccId={mccId} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function AgentsTab({ mccId, onChange }: { mccId: string; onChange: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: "", employee_code: "", phone: "" });

  const { data: agents } = useQuery({
    queryKey: ["setup-agents", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, full_name, employee_code, phone, status")
        .eq("mcc_id", mccId)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["setup-routes", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, assigned_agent_id")
        .eq("mcc_id", mccId)
        .order("name");
      return data ?? [];
    },
  });

  const addAgent = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.employee_code.trim())
        throw new Error("Name and employee code are required.");
      const { error } = await supabase.from("agents").insert({
        mcc_id: mccId,
        full_name: form.full_name.trim(),
        employee_code: form.employee_code.trim(),
        phone: form.phone.trim() || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Agent added");
      setForm({ full_name: "", employee_code: "", phone: "" });
      await queryClient.invalidateQueries({ queryKey: ["setup-agents"] });
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async ({ routeId, agentId }: { routeId: string; agentId: string }) => {
      const { error } = await supabase
        .from("routes")
        .update({ assigned_agent_id: agentId })
        .eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Route assigned");
      await queryClient.invalidateQueries({ queryKey: ["setup-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <form
        className="surface-card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          addAgent.mutate();
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4 text-primary" /> Add agent
        </h2>
        <div>
          <Label htmlFor="agent-name">Full name</Label>
          <Input
            id="agent-name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Ramesh Patel"
          />
        </div>
        <div>
          <Label htmlFor="agent-code">Employee code</Label>
          <Input
            id="agent-code"
            value={form.employee_code}
            onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
            placeholder="AGT-002"
          />
        </div>
        <div>
          <Label htmlFor="agent-phone">Phone</Label>
          <Input
            id="agent-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="9876543210"
            inputMode="numeric"
          />
        </div>
        <Button type="submit" disabled={addAgent.isPending} className="w-full">
          <Plus className="h-4 w-4" /> Add agent
        </Button>
        <p className="text-xs text-muted-foreground">
          The agent signs in with this phone number; their account links automatically once a
          matching agent profile exists.
        </p>
      </form>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Agents & route assignment</h2>
        <ul className="mt-3 divide-y divide-border">
          {(agents ?? []).map((a) => {
            const current = (routes ?? []).find((r) => r.assigned_agent_id === a.id);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.employee_code}
                    {a.phone ? ` · ${a.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{a.status}</Badge>
                  <Select
                    value={current?.id ?? ""}
                    onValueChange={(routeId) => assign.mutate({ routeId, agentId: a.id })}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Assign route" />
                    </SelectTrigger>
                    <SelectContent>
                      {(routes ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </li>
            );
          })}
          {(agents ?? []).length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">No agents yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function RoutesTab({ mccId }: { mccId: string }) {
  const queryClient = useQueryClient();
  const [routeName, setRouteName] = useState("");
  const [pointName, setPointName] = useState("");
  const [activeRoute, setActiveRoute] = useState<string>("");

  const { data: routes } = useQuery({
    queryKey: ["setup-routes", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, description, route_points(id, name, sequence)")
        .eq("mcc_id", mccId)
        .order("name");
      return data ?? [];
    },
  });

  const addRoute = useMutation({
    mutationFn: async () => {
      if (!routeName.trim()) throw new Error("Route name is required.");
      const { error } = await supabase
        .from("routes")
        .insert({ mcc_id: mccId, name: routeName.trim(), active: true });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Route created");
      setRouteName("");
      await queryClient.invalidateQueries({ queryKey: ["setup-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPoint = useMutation({
    mutationFn: async (routeId: string) => {
      if (!pointName.trim()) throw new Error("Stop name is required.");
      const route = (routes ?? []).find((r) => r.id === routeId);
      const sequence = (route?.route_points?.length ?? 0) + 1;
      const { error } = await supabase
        .from("route_points")
        .insert({ route_id: routeId, name: pointName.trim(), sequence });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Stop added");
      setPointName("");
      await queryClient.invalidateQueries({ queryKey: ["setup-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <form
        className="surface-card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          addRoute.mutate();
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <RouteIcon className="h-4 w-4 text-primary" /> New route
        </h2>
        <div>
          <Label htmlFor="route-name">Route name</Label>
          <Input
            id="route-name"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Morning Route 2"
          />
        </div>
        <Button type="submit" disabled={addRoute.isPending} className="w-full">
          <Plus className="h-4 w-4" /> Create route
        </Button>
      </form>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Routes & stops</h2>
        <div className="mt-3 space-y-4">
          {(routes ?? []).map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-4">
              <p className="font-medium">{r.name}</p>
              <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                {[...(r.route_points ?? [])]
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-accent" />
                      {p.sequence}. {p.name}
                    </li>
                  ))}
                {(r.route_points ?? []).length === 0 && <li>No stops yet.</li>}
              </ol>
              <div className="mt-3 flex gap-2">
                <Input
                  value={activeRoute === r.id ? pointName : ""}
                  onFocus={() => setActiveRoute(r.id)}
                  onChange={(e) => {
                    setActiveRoute(r.id);
                    setPointName(e.target.value);
                  }}
                  placeholder="Add stop e.g. Point C — Well"
                />
                <Button
                  variant="outline"
                  onClick={() => addPoint.mutate(r.id)}
                  disabled={addPoint.isPending || activeRoute !== r.id}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          ))}
          {(routes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No routes yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FarmersTab({ mccId }: { mccId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: "", farmer_code: "", phone: "", village: "" });

  const { data: farmers } = useQuery({
    queryKey: ["setup-farmers", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("farmers")
        .select("id, full_name, farmer_code, village, phone, route_point_farmers(route_point_id)")
        .eq("mcc_id", mccId)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: points } = useQuery({
    queryKey: ["setup-points", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_points")
        .select("id, name, sequence, routes!inner(id, name, mcc_id)")
        .eq("routes.mcc_id", mccId)
        .order("sequence");
      return data ?? [];
    },
  });

  const addFarmer = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.farmer_code.trim())
        throw new Error("Name and farmer code are required.");
      const { error } = await supabase.from("farmers").insert({
        mcc_id: mccId,
        full_name: form.full_name.trim(),
        farmer_code: form.farmer_code.trim(),
        phone: form.phone.trim() || null,
        village: form.village.trim() || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Farmer added");
      setForm({ full_name: "", farmer_code: "", phone: "", village: "" });
      await queryClient.invalidateQueries({ queryKey: ["setup-farmers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attach = useMutation({
    mutationFn: async ({ farmerId, pointId }: { farmerId: string; pointId: string }) => {
      await supabase.from("route_point_farmers").delete().eq("farmer_id", farmerId);
      const { count } = await supabase
        .from("route_point_farmers")
        .select("id", { count: "exact", head: true })
        .eq("route_point_id", pointId);
      const { error } = await supabase
        .from("route_point_farmers")
        .insert({ farmer_id: farmerId, route_point_id: pointId, sequence: (count ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Farmer assigned to stop");
      await queryClient.invalidateQueries({ queryKey: ["setup-farmers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <form
        className="surface-card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          addFarmer.mutate();
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4 text-primary" /> Add farmer
        </h2>
        <div>
          <Label htmlFor="farmer-name">Full name</Label>
          <Input
            id="farmer-name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="farmer-code">Farmer code</Label>
          <Input
            id="farmer-code"
            value={form.farmer_code}
            onChange={(e) => setForm({ ...form, farmer_code: e.target.value })}
            placeholder="FRM-007"
          />
        </div>
        <div>
          <Label htmlFor="farmer-phone">Phone</Label>
          <Input
            id="farmer-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor="farmer-village">Village</Label>
          <Input
            id="farmer-village"
            value={form.village}
            onChange={(e) => setForm({ ...form, village: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={addFarmer.isPending} className="w-full">
          <Plus className="h-4 w-4" /> Add farmer
        </Button>
      </form>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Farmers & route stop</h2>
        <ul className="mt-3 divide-y divide-border">
          {(farmers ?? []).map((f) => {
            const current = f.route_point_farmers?.[0]?.route_point_id ?? "";
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{f.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.farmer_code}
                    {f.village ? ` · ${f.village}` : ""}
                  </p>
                </div>
                <Select
                  value={current}
                  onValueChange={(pointId) => attach.mutate({ farmerId: f.id, pointId })}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Assign to stop" />
                  </SelectTrigger>
                  <SelectContent>
                    {(points ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.routes?.name} · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            );
          })}
          {(farmers ?? []).length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">No farmers yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
