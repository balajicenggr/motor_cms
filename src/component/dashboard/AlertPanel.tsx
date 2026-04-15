"use client";
import type { Alert } from "@/types";
import { CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const ICONS = {
  critical: <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />,
  warning:  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />,
  info:     <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />,
};
const STYLES = {
  critical: "border-red-200 bg-red-50",
  warning:  "border-amber-200 bg-amber-50",
  info:     "border-blue-200 bg-blue-50",
};

export default function AlertPanel({ alerts, onAck }: { alerts: Alert[]; onAck: (id: number) => void }) {
  const crit = alerts.filter(a => !a.acknowledged && a.severity === "critical").length;
  const warn = alerts.filter(a => !a.acknowledged && a.severity === "warning").length;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Alerts</span>
        <div className="flex gap-2 text-xs">
          {crit > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-bold">{crit} CRIT</span>}
          {warn > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-bold">{warn} WARN</span>}
          {crit === 0 && warn === 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-bold">✓ Clear</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 max-h-64">
        {alerts.length === 0 && <div className="text-slate-400 text-xs text-center py-8">No alerts recorded</div>}
        {alerts.map(a => (
          <div key={a.id} className={`flex items-start gap-2 p-2 rounded-lg border text-xs ${STYLES[a.severity]} ${a.acknowledged ? "opacity-40" : ""}`}>
            {ICONS[a.severity]}
            <div className="flex-1 min-w-0">
              <div className="text-slate-700 truncate">{a.message}</div>
              <div className="text-slate-400 mt-0.5">{new Date(a.timestamp).toLocaleTimeString()}</div>
            </div>
            {!a.acknowledged && (
              <button onClick={() => onAck(a.id)} className="shrink-0 text-slate-400 hover:text-emerald-500 transition-colors">
                <CheckCircle size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
