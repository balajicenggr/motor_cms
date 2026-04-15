"use client";
import { Terminal } from "lucide-react";

export default function SystemLog({ logs }: { logs: string[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Terminal size={13} className="text-slate-400" />
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">System Log</span>
        <span className="ml-auto text-xs text-slate-400">{logs.length} entries</span>
      </div>
      <div className="flex-1 overflow-y-auto max-h-64 space-y-0.5 font-mono text-xs">
        {logs.map((line, i) => {
          const isCrit = line.includes("ABNORMAL") || line.includes("overheating") || line.includes("electrical");
          const isWarn = line.includes("WARNING")  || line.includes("bearing")     || line.includes("imbalance");
          return (
            <div key={i} className={`px-1 py-0.5 rounded truncate ${isCrit ? "text-red-600 bg-red-50" : isWarn ? "text-amber-700 bg-amber-50" : "text-slate-500"}`}>
              {line}
            </div>
          );
        })}
        {logs.length === 0 && <div className="text-slate-400 text-center py-4">Waiting for data...</div>}
      </div>
    </div>
  );
}
