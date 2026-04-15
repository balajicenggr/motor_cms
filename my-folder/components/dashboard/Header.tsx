"use client";
import { Activity, Download, Cpu } from "lucide-react";
import { useEffect, useState } from "react";

export default function Header({ connected, onExport }: { connected: boolean; onExport: () => void }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    setTime(new Date().toLocaleString());
    const t = setInterval(() => setTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <Cpu size={20} className="text-blue-500" />
        <div>
          <h1 className="text-blue-600 font-bold text-base tracking-widest uppercase">Motor CMS</h1>
          <p className="text-slate-400 text-xs">Induction Motor Condition Monitoring</p>
        </div>
        <div className={`ml-4 flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border font-semibold ${
          connected ? "border-emerald-300 text-emerald-600 bg-emerald-50" : "border-amber-300 text-amber-600 bg-amber-50"
        }`}>
          <Activity size={11} className={connected ? "animate-pulse" : ""} />
          {connected ? "LIVE" : "WAITING FOR ESP32"}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-400 hidden sm:block">{time}</span>
        <button onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">
          <Download size={12} /> Export CSV
        </button>
      </div>
    </header>
  );
}
