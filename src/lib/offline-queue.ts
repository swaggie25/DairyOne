import { supabase } from "@/integrations/supabase/client";

/**
 * Offline-first queue for agent milk entries. Entries are written to
 * localStorage immediately and flushed to the backend whenever connectivity
 * returns. `client_ref` makes every push idempotent.
 */

const KEY = "dairyone.collection-queue.v1";

export type QueuedCollection = {
  client_ref: string;
  farmer_id: string;
  agent_id: string | null;
  mcc_id: string;
  route_point_id: string | null;
  trip_id: string | null;
  source: string;
  session: string;
  animal_type: string;
  quantity_litres: number;
  fat_pct: number | null;
  snf_pct: number | null;
  clr: number | null;
  temperature: number | null;
  acidity: number | null;
  water_adulteration_pct: number | null;
  antibiotic_test_result: string | null;
  water_adulteration_flag: boolean;
  rate_per_litre: number;
  total_amount: number;
  risk_score: number | null;
  status: string;
  signature_url: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  collected_at: string;
};

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function read(): QueuedCollection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedCollection[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedCollection[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items.length));
}

export function queueSize(): number {
  return read().length;
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(read().length);
  return () => listeners.delete(listener);
}

export function enqueue(entry: QueuedCollection) {
  write([...read(), entry]);
}

let flushing = false;

/** Pushes queued entries. Returns how many synced. Safe to call repeatedly. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  flushing = true;
  let synced = 0;
  try {
    const items = read();
    const remaining: QueuedCollection[] = [];
    for (const item of items) {
      const { error } = await supabase
        .from("milk_collections")
        .upsert({ ...item, offline_synced_at: new Date().toISOString() }, {
          onConflict: "client_ref",
        });
      if (error) {
        // Duplicate means it already landed; anything else stays queued.
        if (error.code === "23505") continue;
        remaining.push(item);
      } else {
        synced += 1;
      }
    }
    write(remaining);
  } finally {
    flushing = false;
  }
  return synced;
}

export function newClientRef(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
