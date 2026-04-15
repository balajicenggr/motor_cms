"use client";
import { getSensorStatus } from "@/types";

const STYLES = {
  normal:   { card: "border-emerald-200", bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", label: "NORMAL"   },
  warning:  { card: "border-amber-200",   bar: "bg-amber-400",   badge: "bg-amber-50 text-amber-700",    label: "WARNING"  },
  critical: { card: "border-red-200",     bar: "bg-red-500",     badge: "bg-red-50 text-red-700",        label: "ABNORMAL" },
};

interface Props {
  label: string; value?: number; unit: string;
  thresholds: { normal: readonly number[]; warning: readonly number[]; unit: string };
  sensor: "temperature" | "vibration" | "sound" | "humidity";
  optional?: boolean;
}

export default function GaugeCard({ label, value, unit, thresholds, sensor, optional }: Props) {
  const hasValue = value != null && !isNaN(value);
  const status   = hasValue ? getSensorStatus(value!, sensor) : "normal";
  const s        = STYLES[status];
  const pct      = hasValue ? Math.min(100, (value! / (thresholds.warning[1] * 1.5)) * 100) : 0;

  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${s.card}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</span>
        {hasValue && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>}
      </div>
      <div className="mb-1">
        <span className="text-3xl font-extrabold tabular-nums">
          {hasValue ? value!.toFixed(sensor === "vibration" ? 2 : 1) : (optional ? "N/A" : "—")}
        </span>
        <span className="text-sm text-slate-400 ml-1">{unit}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full transition-all duration-500 ${s.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{thresholds.normal[0]}–{thresholds.normal[1]}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{thresholds.warning[0]}–{thresholds.warning[1]}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&gt;{thresholds.warning[1]}</span>
      </div>
    </div>
  );
}
