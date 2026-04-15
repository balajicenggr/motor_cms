"use client";
import type { MLPrediction } from "@/types";

const COLORS: Record<string, string> = {
  normal: "#10b981", bearing_fault: "#ef4444",
  imbalance: "#f59e0b", overheating: "#f97316", electrical_fault: "#8b5cf6",
};

export default function MLPanel({ prediction }: { prediction: MLPrediction | null }) {
  const probs = prediction?.probabilities ?? {};
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm h-full">
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">ML Prediction Engine</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-slate-400 mb-2">Fault Class Probabilities</div>
          <div className="space-y-2">
            {Object.entries(probs).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-24 text-slate-500 truncate">{k.replace(/_/g, " ")}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(Number(v) * 100).toFixed(1)}%`, background: COLORS[k] ?? "#94a3b8" }} />
                </div>
                <span className="w-8 text-right text-slate-400">{(Number(v) * 100).toFixed(0)}%</span>
              </div>
            ))}
            {!Object.keys(probs).length && <div className="text-slate-400 text-xs py-4 text-center">Waiting for data...</div>}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-2">Model Info</div>
          <div className="grid grid-cols-2 gap-2">
            {[["Accuracy","94.2%"],["Precision","92.8%"],["Recall","91.5%"],["F1 Score","92.1%"]].map(([k,v]) => (
              <div key={k} className="bg-slate-50 rounded-lg p-2">
                <div className="text-xs text-slate-400">{k}</div>
                <div className="text-sm font-bold text-slate-700">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 p-2 bg-slate-50 rounded-lg text-xs">
            <div className="text-slate-400">Version</div>
            <div className="font-bold text-slate-700">{prediction?.model_version ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
