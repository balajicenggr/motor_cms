import { createClient } from "@supabase/supabase-js";
import type { SensorReading, MLPrediction, Alert } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export async function getLatestReadings(limit = 60) {
  const { data, error } = await supabase
    .from("sensor_readings")
    .select("*, ml_predictions(condition, confidence, anomaly_score, probabilities)")
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getAlerts(limit = 50) {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Alert[];
}

export async function acknowledgeAlert(id: number) {
  const { error } = await supabase
    .from("alerts")
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getReadingsForExport() {
  const { data, error } = await supabase
    .from("sensor_readings")
    .select("*, ml_predictions(condition, confidence)")
    .order("timestamp", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function subscribeToReadings(callback: (r: SensorReading) => void) {
  return supabase
    .channel("realtime:sensor_readings")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "sensor_readings" },
      (payload: { new: unknown }) => callback(payload.new as SensorReading)
    )
    .subscribe();
}

export function subscribeToAlerts(callback: (a: Alert) => void) {
  return supabase
    .channel("realtime:alerts")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "alerts" },
      (payload: { new: unknown }) => callback(payload.new as Alert)
    )
    .subscribe();
}

export function subscribeToPredictions(callback: (p: MLPrediction) => void) {
  return supabase
    .channel("realtime:ml_predictions")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "ml_predictions" },
      (payload: { new: unknown }) => callback(payload.new as MLPrediction)
    )
    .subscribe();
}
