"use client";
import { useEffect, useState, useCallback } from "react";
import {
  getLatestReadings, getAlerts, subscribeToReadings,
  subscribeToAlerts, subscribeToPredictions,
  acknowledgeAlert, getReadingsForExport,
} from "@/lib/supabase";
import type { Alert, ReadingWithPrediction, MLPrediction } from "@/types";
import { THRESHOLDS } from "@/types";
import GaugeCard    from "@/components/dashboard/GaugeCard";
import HealthStatus from "@/components/dashboard/HealthStatus";
import TimeSeriesChart from "@/components/dashboard/TimeSeriesChart";
import AlertPanel   from "@/components/dashboard/AlertPanel";
import MLPanel      from "@/components/dashboard/MLPanel";
import SystemLog    from "@/components/dashboard/SystemLog";
import Header       from "@/components/dashboard/Header";

export default function Dashboard() {
  const [readings,   setReadings]   = useState<ReadingWithPrediction[]>([]);
  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [logs,       setLogs]       = useState<string[]>([]);
  const [connected,  setConnected]  = useState(false);
  const [loading,    setLoading]    = useState(true);

  const latest     = readings[0] ?? null;
  const latestPred = (latest?.ml_predictions?.[0] ?? null) as MLPrediction | null;

  useEffect(() => {
    Promise.all([getLatestReadings(120), getAlerts(50)])
      .then(([r, a]) => {
        setReadings(r as ReadingWithPrediction[]);
        setAlerts(a);
        if (r.length > 0) setConnected(true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const rSub = subscribeToReadings((r) => {
      setConnected(true);
      setReadings(prev => [r as ReadingWithPrediction, ...prev].slice(0, 500));
      setLogs(prev => [
        `[${new Date(r.timestamp).toLocaleTimeString()}] ${r.device_id} T:${r.temperature.toFixed(1)}°C V:${r.vibration_rms.toFixed(2)}mm/s S:${r.sound_db.toFixed(1)}dB`,
        ...prev,
      ].slice(0, 200));
    });
    const aSub = subscribeToAlerts((a) => {
      setAlerts(prev => [a, ...prev].slice(0, 100));
    });
    const pSub = subscribeToPredictions((p) => {
      setReadings(prev => prev.map(r =>
        r.id === p.reading_id
          ? { ...r, ml_predictions: [p, ...(r.ml_predictions ?? [])] }
          : r
      ));
    });
    return () => { rSub.unsubscribe(); aSub.unsubscribe(); pSub.unsubscribe(); };
  }, []);

  const handleAck = useCallback(async (id: number) => {
    await acknowledgeAlert(id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  }, []);

  const handleExport = useCallback(async () => {
    const data = await getReadingsForExport();
    const header = "id,timestamp,device_id,temperature,vibration_rms,sound_db,humidity,condition,confidence\n";
    const rows = (data as ReadingWithPrediction[]).map(r => {
      const p = r.ml_predictions?.[0];
      return `${r.id},${r.timestamp},${r.device_id},${r.temperature},${r.vibration_rms},${r.sound_db},${r.humidity ?? ""},${p?.condition ?? ""},${p?.confidence ?? ""}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `motor_data_${Date.now()}.csv`;
    a.click();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-slate-500 text-sm">
      Connecting to Supabase...
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header connected={connected} onExport={handleExport} />
      <main className="flex-1 p-4 grid grid-cols-12 gap-3">
        {/* Gauges row */}
        <div className="col-span-12 grid grid-cols-4 gap-3">
          <GaugeCard label="Temperature"  value={latest?.temperature}          unit="°C"   thresholds={THRESHOLDS.temperature} sensor="temperature" />
          <GaugeCard label="Vibration RMS" value={latest?.vibration_rms}       unit="mm/s" thresholds={THRESHOLDS.vibration}   sensor="vibration" />
          <GaugeCard label="Sound Level"  value={latest?.sound_db}             unit="dB"   thresholds={THRESHOLDS.sound}       sensor="sound" />
          <GaugeCard label="Humidity"     value={latest?.humidity ?? undefined} unit="%RH"  thresholds={THRESHOLDS.humidity}    sensor="humidity" optional />
        </div>
        {/* Health + ML */}
        <div className="col-span-4"><HealthStatus prediction={latestPred} reading={latest} /></div>
        <div className="col-span-8"><MLPanel prediction={latestPred} /></div>
        {/* Chart */}
        <div className="col-span-12"><TimeSeriesChart readings={readings.slice(0, 60).reverse()} /></div>
        {/* Alerts + Log */}
        <div className="col-span-5"><AlertPanel alerts={alerts} onAck={handleAck} /></div>
        <div className="col-span-7"><SystemLog logs={logs} /></div>
      </main>
    </div>
  );
}
