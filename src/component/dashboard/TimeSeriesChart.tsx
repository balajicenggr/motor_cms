"use client";
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import type { ReadingWithPrediction } from "@/types";
import { format } from "date-fns";

type Channel = "temperature" | "vibration_rms" | "sound_db" | "humidity";
const CHANNELS: { key: Channel; label: string; color: string; warn: number }[] = [
  { key: "temperature",   label: "Temp (°C)",    color: "#06b6d4", warn: 70  },
  { key: "vibration_rms", label: "Vib (mm/s)",   color: "#f59e0b", warn: 2.8 },
  { key: "sound_db",      label: "Sound (dB)",   color: "#8b5cf6", warn: 70  },
  { key: "humidity",      label: "Humidity (%)", color: "#3b82f6", warn: 60  },
];

export default function TimeSeriesChart({ readings }: { readings: ReadingWithPrediction[] }) {
  const [active, setActive] = useState<Channel[]>(["temperature", "vibration_rms", "sound_db"]);
  const data = readings.map(r => ({
    t: format(new Date(r.timestamp), "HH:mm:ss"),
    temperature:   +r.temperature.toFixed(1),
    vibration_rms: +r.vibration_rms.toFixed(2),
    sound_db:      +r.sound_db.toFixed(1),
    humidity:      r.humidity != null ? +r.humidity.toFixed(1) : null,
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Historical Time-Series</span>
        <div className="flex gap-2">
          {CHANNELS.map(c => (
            <button key={c.key}
              onClick={() => setActive(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])}
              className={`text-xs px-2 py-1 rounded border transition-colors ${active.includes(c.key) ? "opacity-100" : "opacity-30"}`}
              style={{ color: c.color, borderColor: active.includes(c.key) ? c.color : "#e2e8f0" }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 0, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="t" tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
          {CHANNELS.filter(c => active.includes(c.key)).map(c => (
            <Line key={c.key} type="monotone" dataKey={c.key} name={c.label} stroke={c.color} dot={false} strokeWidth={2} connectNulls />
          ))}
          {CHANNELS.filter(c => active.includes(c.key)).map(c => (
            <ReferenceLine key={`ref-${c.key}`} y={c.warn} stroke={c.color} strokeDasharray="4 4" strokeOpacity={0.4} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
