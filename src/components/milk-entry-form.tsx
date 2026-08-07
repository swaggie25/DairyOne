import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Save, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignaturePad } from "@/components/signature-pad";
import { getCoords } from "@/lib/geo";
import { enqueue, flushQueue, newClientRef, type QueuedCollection } from "@/lib/offline-queue";
import {
  formatCurrency,
  ratePerLitre,
  riskScore,
  snfFromClr,
  totalAmount,
  type RateSlab,
} from "@/lib/pricing";

export type MilkEntryTarget = {
  farmerId: string;
  farmerName: string;
  farmerCode: string;
  mccId: string;
  agentId: string | null;
  routePointId?: string | null;
  tripId?: string | null;
  source: "agent" | "centre";
};

function num(value: string): number | null {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function MilkEntryForm({
  target,
  onSaved,
}: {
  target: MilkEntryTarget;
  onSaved?: () => void;
}) {
  const [session, setSession] = useState("morning");
  const [animalType, setAnimalType] = useState("cow");
  const [quantity, setQuantity] = useState("");
  const [fat, setFat] = useState("");
  const [clr, setClr] = useState("");
  const [snf, setSnf] = useState("");
  const [temperature, setTemperature] = useState("");
  const [acidity, setAcidity] = useState("");
  const [water, setWater] = useState("");
  const [antibiotic, setAntibiotic] = useState("not_tested");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: slabs } = useQuery<RateSlab[]>({
    queryKey: ["rate-slabs", target.mccId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("rate_slabs")
        .select("id, animal_type, min_fat, max_fat, min_snf, max_snf, rate_per_litre, active")
        .eq("active", true);
      return (data ?? []) as RateSlab[];
    },
  });

  const fatPct = num(fat);
  const clrValue = num(clr);
  const snfPct = num(snf) ?? snfFromClr(clrValue, fatPct);
  const quantityLitres = num(quantity) ?? 0;
  const waterPct = num(water);

  const rate = useMemo(
    () => ratePerLitre(slabs, { animalType, fatPct, snfPct }),
    [slabs, animalType, fatPct, snfPct],
  );
  const amount = totalAmount(quantityLitres, rate);
  const risk = riskScore({ fatPct, snfPct, waterPct: waterPct });

  async function save() {
    if (quantityLitres <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }
    setSaving(true);
    const coords = await getCoords();
    const entry: QueuedCollection = {
      client_ref: newClientRef(),
      farmer_id: target.farmerId,
      agent_id: target.agentId,
      mcc_id: target.mccId,
      route_point_id: target.routePointId ?? null,
      trip_id: target.tripId ?? null,
      source: target.source,
      session,
      animal_type: animalType,
      quantity_litres: quantityLitres,
      fat_pct: fatPct,
      snf_pct: snfPct,
      clr: clrValue,
      temperature: num(temperature),
      acidity: num(acidity),
      water_adulteration_pct: waterPct,
      antibiotic_test_result: antibiotic === "not_tested" ? null : antibiotic,
      water_adulteration_flag: (waterPct ?? 0) > 2,
      rate_per_litre: rate,
      total_amount: amount,
      risk_score: risk,
      // Field entries wait for manager verification; centre walk-ins post directly.
      status: target.source === "agent" ? "pending" : "verified",
      signature_url: signature,
      gps_lat: coords.lat,
      gps_lng: coords.lng,
      collected_at: new Date().toISOString(),
    };

    enqueue(entry);
    const synced = await flushQueue();
    setSaving(false);
    toast.success(
      synced > 0
        ? `Saved ${quantityLitres} L · ${formatCurrency(amount)}`
        : "Saved offline — will sync when network returns",
    );
    setQuantity("");
    setFat("");
    setClr("");
    setSnf("");
    setWater("");
    setSignature(null);
    onSaved?.();
  }

  function printReceipt() {
    const win = window.open("", "_blank", "width=320,height=520");
    if (!win) {
      toast.error("Allow pop-ups to print the receipt.");
      return;
    }
    win.document.write(`<pre style="font:12px monospace">
DairyOne receipt
-----------------------------
Farmer : ${target.farmerName} (${target.farmerCode})
Session: ${session}
Qty    : ${quantityLitres} L
Fat    : ${fatPct ?? "-"} %   SNF: ${snfPct ?? "-"}
Rate   : ${formatCurrency(rate)}/L
Amount : ${formatCurrency(amount)}
Time   : ${new Date().toLocaleString()}
-----------------------------
</pre>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="session">Session</Label>
          <Select value={session} onValueChange={setSession}>
            <SelectTrigger id="session" className="mt-1 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="evening">Evening</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="animal">Animal</Label>
          <Select value={animalType} onValueChange={setAnimalType}>
            <SelectTrigger id="animal" className="mt-1 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cow">Cow</SelectItem>
              <SelectItem value="buffalo">Buffalo</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="qty">Quantity (litres)</Label>
        <Input
          id="qty"
          inputMode="decimal"
          className="mt-1 h-14 text-lg font-semibold"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0.0"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="fat">Fat %</Label>
          <Input id="fat" inputMode="decimal" className="mt-1 h-12" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="clr">CLR</Label>
          <Input id="clr" inputMode="decimal" className="mt-1 h-12" value={clr} onChange={(e) => setClr(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="snf">SNF %</Label>
          <Input
            id="snf"
            inputMode="decimal"
            className="mt-1 h-12"
            value={snf}
            onChange={(e) => setSnf(e.target.value)}
            placeholder={snfPct != null ? String(snfPct) : ""}
          />
        </div>
      </div>

      <details className="surface-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Quality tests (optional)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="temp">Temperature °C</Label>
            <Input id="temp" inputMode="decimal" className="mt-1 h-12" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="acid">Acidity</Label>
            <Input id="acid" inputMode="decimal" className="mt-1 h-12" value={acidity} onChange={(e) => setAcidity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="water">Water %</Label>
            <Input id="water" inputMode="decimal" className="mt-1 h-12" value={water} onChange={(e) => setWater(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="abx">Antibiotic</Label>
            <Select value={antibiotic} onValueChange={setAntibiotic}>
              <SelectTrigger id="abx" className="mt-1 h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_tested">Not tested</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </details>

      <div className="surface-card flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rate {formatCurrency(rate)}/L
          </p>
          <p className="text-2xl font-bold tracking-tight">{formatCurrency(amount)}</p>
        </div>
        {risk >= 40 && (
          <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
            Suspect sample
          </span>
        )}
      </div>

      <SignaturePad onChange={setSignature} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="lg" className="h-14 text-base" onClick={save} disabled={saving}>
          <Save className="h-5 w-5" /> {saving ? "Saving…" : "Save entry"}
        </Button>
        <Button size="lg" variant="outline" className="h-14 text-base" onClick={printReceipt}>
          <Printer className="h-5 w-5" /> Print receipt
        </Button>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CloudOff className="h-3.5 w-3.5" /> Entries save on-device first and sync automatically.
      </p>
    </div>
  );
}
