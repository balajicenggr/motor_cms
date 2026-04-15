"use client";
import type { MLPrediction, SensorReading } from "@/types";

const META: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  normal:           { icon: "🛡️", label: "NORMAL",         color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0" },
  bearing_fault:    { icon: "⚠️", label: "BEARING FAULT",  color: "#ef4444", bg: "#fef2f2", border: "#fecaca" },
  imbalance:        { icon: "⚡", label: "IMBALANCE",       color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  overheating:      { icon: "🔥", label: "OVERHEATING",     color: "#f97316", bg: "#fff7ed", border: "#fed7aa" },
  electrical_fault: { icon: "💥", label: "ELEC. FAULT",    color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
};

export default function HealthStatus({ prediction, reading }: { prediction: MLPrediction | null; reading: SensorReading | null }) {
  const m = META[prediction?.condition ?? "normal"] ?? META.normal;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-full flex flex-col gap-3">
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Motor Health</div>
      <div className="flex-1 rounded-lg p-4 flex flex-col items-center justify-center text-center"
        style={{ background: m.bg, border: `1px solid ${m.border}` }}>
        <div className="text-4xl mb-2">{m.icon}</div>
        <div className="text-lg font-bold tracking-wide" style={{ color: m.color }}>{m.label}</div>
        {prediction && (
          <>
            <div className="text-xs text-slate-500 mt-1">Confidence: {(prediction.confidence * 100).toFixed(1)}%</div>
            <div className="text-xs text-slate-400">Anomaly: {prediction.anomaly_score.toFixed(3)}</div>
          </>
        )}
      </div>
      {reading && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[["Device", reading.device_id], ["Temp", `${reading.temperature.toFixed(1)}°C`],
            ["Vib RMS", `${reading.vibration_rms.toFixed(2)} mm/s`], ["Sound", `${reading.sound_db.toFixed(1)} dB`]
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-lg p-2">
              <div className="text-slate-400">{k}</div>
              <div className="font-bold text-slate-700">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
