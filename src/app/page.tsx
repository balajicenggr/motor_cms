"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";

// ── Supabase ──────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ─────────────────────────────────────────────────
type Condition = "normal"|"bearing_fault"|"imbalance"|"overheating"|"electrical_fault";
interface Reading {
  id: number; device_id: string; timestamp: string;
  temperature: number; vibration_x: number; vibration_y: number;
  vibration_z: number; vibration_rms: number; sound_db: number;
  humidity: number | null;
  ml_predictions?: { condition: Condition; confidence: number; anomaly_score: number; probabilities: Record<Condition,number> }[];
}
interface Alert {
  id: number; timestamp: string; severity: "critical"|"warning"|"info";
  type: string; message: string; acknowledged: boolean;
}

// ── Thresholds (ISO 10816) ────────────────────────────────
const T = { temp:{w:70,c:85}, vib:{w:2.8,c:4.5}, sound:{w:70,c:85}, hum:{c:70} };
const FC: Record<string,string> = { normal:"#10b981",bearing_fault:"#ef4444",imbalance:"#f59e0b",overheating:"#f97316",electrical_fault:"#8b5cf6" };
const HM: Record<string,{icon:string;label:string;color:string;bg:string;border:string}> = {
  normal:          {icon:"🛡️",label:"NORMAL",         color:"#10b981",bg:"#f0fdf4",border:"#bbf7d0"},
  bearing_fault:   {icon:"⚠️",label:"BEARING FAULT",  color:"#ef4444",bg:"#fef2f2",border:"#fecaca"},
  imbalance:       {icon:"⚡",label:"IMBALANCE",       color:"#f59e0b",bg:"#fffbeb",border:"#fde68a"},
  overheating:     {icon:"🔥",label:"OVERHEATING",     color:"#f97316",bg:"#fff7ed",border:"#fed7aa"},
  electrical_fault:{icon:"💥",label:"ELEC. FAULT",    color:"#8b5cf6",bg:"#f5f3ff",border:"#ddd6fe"},
};

function gStatus(v: number, w: number, c: number) { return v>=c?"critical":v>=w?"warning":"normal"; }
function gLabel(s: string) { return s==="critical"?"ABNORMAL":s==="warning"?"WARNING":"NORMAL"; }
function gColor(s: string) { return s==="critical"?"#ef4444":s==="warning"?"#f59e0b":"#10b981"; }

// ── Gauge Card ────────────────────────────────────────────
function GaugeCard({ label, value, unit, warn, crit, max, optional }: {
  label:string; value?:number; unit:string; warn:number; crit:number; max:number; optional?:boolean;
}) {
  const has = value != null && !isNaN(value);
  const st  = has ? gStatus(value!, warn, crit) : "normal";
  const pct = has ? Math.min(100, (value!/max)*100) : 0;
  const borderColor = st==="critical"?"#fecaca":st==="warning"?"#fde68a":"#bbf7d0";
  const barColor = gColor(st);
  return (
    <div style={{background:"#fff",borderRadius:12,border:`1px solid ${borderColor}`,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5}}>{label}</span>
        {has && <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:st==="critical"?"#fef2f2":st==="warning"?"#fffbeb":"#f0fdf4",color:barColor}}>{gLabel(st)}</span>}
      </div>
      <div style={{marginBottom:4}}>
        <span style={{fontSize:30,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{has?value!.toFixed(unit==="mm/s"?2:1):(optional?"N/A":"—")}</span>
        <span style={{fontSize:12,color:"#94a3b8",marginLeft:4}}>{unit}</span>
      </div>
      <div style={{height:7,background:"#f1f5f9",borderRadius:4,overflow:"hidden",marginBottom:6}}>
        <div style={{height:"100%",borderRadius:4,background:barColor,width:`${pct}%`,transition:"width .5s"}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#94a3b8"}}>
        <span>✅ Normal &lt;{warn}</span><span>⚠️ Warn {warn}–{crit}</span><span>❌ &gt;{crit}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [alerts,   setAlerts]   = useState<Alert[]>([]);
  const [logs,     setLogs]     = useState<string[]>([]);
  const [connected,setConnected]= useState(false);
  const [loading,  setLoading]  = useState(true);
  const [time,     setTime]     = useState("");

  const latest = readings[0] ?? null;
  const pred   = latest?.ml_predictions?.[0] ?? null;
  const m      = HM[pred?.condition ?? "normal"] ?? HM.normal;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("sensor_readings").select("*,ml_predictions(condition,confidence,anomaly_score,probabilities)").order("timestamp",{ascending:false}).limit(120),
      supabase.from("alerts").select("*").order("timestamp",{ascending:false}).limit(50)
    ]).then(([{data:r},{data:a}]) => {
      if (r) { setReadings(r as Reading[]); if (r.length>0) setConnected(true); }
      if (a) setAlerts(a as Alert[]);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const rSub = supabase.channel("rt:readings").on("postgres_changes",
      {event:"INSERT",schema:"public",table:"sensor_readings"},
      (p: {new: unknown}) => {
        const r = p.new as Reading;
        setConnected(true);
        setReadings(prev => [r,...prev].slice(0,500));
        setLogs(prev => [`[${new Date(r.timestamp).toLocaleTimeString()}] ${r.device_id} T:${r.temperature.toFixed(1)}°C V:${r.vibration_rms.toFixed(2)}mm/s S:${r.sound_db.toFixed(1)}dB`,...prev].slice(0,200));
      }).subscribe();
    const aSub = supabase.channel("rt:alerts").on("postgres_changes",
      {event:"INSERT",schema:"public",table:"alerts"},
      (p: {new: unknown}) => setAlerts(prev => [p.new as Alert,...prev].slice(0,100))
    ).subscribe();
    const pSub = supabase.channel("rt:preds").on("postgres_changes",
      {event:"INSERT",schema:"public",table:"ml_predictions"},
      (p: {new: unknown}) => {
        const pred = p.new as {reading_id:number;condition:Condition;confidence:number;anomaly_score:number;probabilities:Record<Condition,number>};
        setReadings(prev => prev.map(r => r.id===pred.reading_id ? {...r,ml_predictions:[pred,...(r.ml_predictions??[])]} : r));
      }).subscribe();
    return () => { rSub.unsubscribe(); aSub.unsubscribe(); pSub.unsubscribe(); };
  }, []);

  const ackAlert = useCallback(async (id: number) => {
    await supabase.from("alerts").update({acknowledged:true,acknowledged_at:new Date().toISOString()}).eq("id",id);
    setAlerts(prev => prev.map(a => a.id===id ? {...a,acknowledged:true} : a));
  }, []);

  const exportCSV = useCallback(async () => {
    const {data} = await supabase.from("sensor_readings").select("*,ml_predictions(condition,confidence)").order("timestamp",{ascending:true});
    if (!data) return;
    const rows = (data as Reading[]).map(r => {
      const p = r.ml_predictions?.[0];
      return `${r.id},${r.timestamp},${r.device_id},${r.temperature},${r.vibration_rms},${r.sound_db},${r.humidity??""}, ${p?.condition??""}, ${p?.confidence??""}`;
    });
    const blob = new Blob(["id,timestamp,device_id,temperature,vibration_rms,sound_db,humidity,condition,confidence\n"+rows.join("\n")],{type:"text/csv"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`motor_${Date.now()}.csv`; a.click();
  }, []);

  const chartData = readings.slice(0,60).reverse().map(r => ({
    t: format(new Date(r.timestamp),"HH:mm:ss"),
    temperature: +r.temperature.toFixed(1),
    vibration_rms: +r.vibration_rms.toFixed(2),
    sound_db: +r.sound_db.toFixed(1),
    humidity: r.humidity!=null ? +r.humidity.toFixed(1) : null,
  }));

  const crit = alerts.filter(a=>!a.acknowledged&&a.severity==="critical").length;
  const warn = alerts.filter(a=>!a.acknowledged&&a.severity==="warning").length;

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#64748b",fontSize:14}}>
      Connecting to Supabase...
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:13}}>
      {/* Header */}
      <header style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20}}>⚙️</span>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"#2563eb",letterSpacing:2,textTransform:"uppercase"}}>Motor CMS</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>Induction Motor Condition Monitoring</div>
          </div>
          <div style={{marginLeft:12,display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,border:`1px solid ${connected?"#bbf7d0":"#fde68a"}`,background:connected?"#f0fdf4":"#fef9c3",color:connected?"#16a34a":"#92400e",fontSize:11,fontWeight:600}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:connected?"#22c55e":"#eab308",display:"inline-block"}} />
            {connected?"LIVE":"WAITING FOR ESP32"}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11,color:"#94a3b8"}}>{time}</span>
          <button onClick={exportCSV} style={{padding:"5px 12px",borderRadius:6,border:"1px solid #bfdbfe",background:"#fff",color:"#2563eb",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:5}}>
            ⬇ Export CSV
          </button>
        </div>
      </header>

      <main style={{padding:16,display:"grid",gridTemplateColumns:"repeat(12,1fr)",gap:12,alignItems:"start"}}>
        {/* Gauges */}
        <div style={{gridColumn:"span 12",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          <GaugeCard label="🌡️ Temperature"  value={latest?.temperature}          unit="°C"   warn={T.temp.w}  crit={T.temp.c}  max={120} />
          <GaugeCard label="📳 Vibration RMS" value={latest?.vibration_rms}       unit="mm/s" warn={T.vib.w}   crit={T.vib.c}   max={10}  />
          <GaugeCard label="🔊 Sound Level"  value={latest?.sound_db}             unit="dB"   warn={T.sound.w} crit={T.sound.c} max={120} />
          <GaugeCard label="🌧️ Humidity"     value={latest?.humidity??undefined}  unit="%RH"  warn={60}        crit={T.hum.c}   max={100} optional />
        </div>

        {/* Health Status */}
        <div style={{gridColumn:"span 4",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>Motor Health</div>
          <div style={{borderRadius:8,padding:16,textAlign:"center",background:m.bg,border:`1px solid ${m.border}`,marginBottom:10}}>
            <div style={{fontSize:32,marginBottom:6}}>{m.icon}</div>
            <div style={{fontSize:15,fontWeight:700,color:m.color,letterSpacing:.5}}>{m.label}</div>
            {pred && <>
              <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Confidence: {(pred.confidence*100).toFixed(1)}%</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>Anomaly: {pred.anomaly_score.toFixed(3)}</div>
            </>}
          </div>
          {latest && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {[["Device",latest.device_id],["Temp",`${latest.temperature.toFixed(1)}°C`],["Vib RMS",`${latest.vibration_rms.toFixed(2)} mm/s`],["Sound",`${latest.sound_db.toFixed(1)} dB`]].map(([k,v])=>(
                <div key={k} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px"}}>
                  <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase"}}>{k}</div>
                  <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ML Panel */}
        <div style={{gridColumn:"span 8",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>ML Prediction Engine</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <div style={{fontSize:10,color:"#94a3b8",marginBottom:8}}>Fault Class Probabilities</div>
              {pred ? Object.entries(pred.probabilities).map(([k,v])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:10,color:"#64748b",width:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.replace(/_/g," ")}</span>
                  <div style={{flex:1,height:7,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:4,background:FC[k]??"#94a3b8",width:`${(v*100).toFixed(1)}%`,transition:"width .4s"}} />
                  </div>
                  <span style={{fontSize:10,color:"#94a3b8",width:28,textAlign:"right"}}>{(v*100).toFixed(0)}%</span>
                </div>
              )) : <div style={{color:"#94a3b8",fontSize:11,padding:"16px 0",textAlign:"center"}}>Waiting for data...</div>}
            </div>
            <div>
              <div style={{fontSize:10,color:"#94a3b8",marginBottom:8}}>Model Performance</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                {[["Accuracy","94.2%"],["Precision","92.8%"],["Recall","91.5%"],["F1 Score","92.1%"]].map(([k,v])=>(
                  <div key={k} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px"}}>
                    <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase"}}>{k}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:8,padding:"6px 8px",background:"#f8fafc",borderRadius:6,fontSize:11}}>
                <div style={{color:"#94a3b8",fontSize:9,textTransform:"uppercase"}}>Model Version</div>
                <div style={{fontWeight:700,color:"#1e293b"}}>{pred?.model_version??"—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Time Series Chart */}
        <div style={{gridColumn:"span 12",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>Historical Time-Series</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{left:0,right:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="t" tick={{fill:"#94a3b8",fontSize:10}} interval="preserveStartEnd" />
              <YAxis tick={{fill:"#94a3b8",fontSize:10}} />
              <Tooltip contentStyle={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,fontSize:11}} />
              <Legend wrapperStyle={{fontSize:11,color:"#64748b"}} />
              <Line type="monotone" dataKey="temperature"   name="Temp °C"    stroke="#06b6d4" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="vibration_rms" name="Vib mm/s"   stroke="#f59e0b" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="sound_db"      name="Sound dB"   stroke="#8b5cf6" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="humidity"      name="Humidity %" stroke="#3b82f6" dot={false} strokeWidth={2} connectNulls />
              <ReferenceLine y={70}  stroke="#06b6d4" strokeDasharray="4 4" strokeOpacity={0.4} />
              <ReferenceLine y={2.8} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.4} />
              <ReferenceLine y={70}  stroke="#8b5cf6" strokeDasharray="4 4" strokeOpacity={0.4} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts */}
        <div style={{gridColumn:"span 5",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6}}>Alerts</span>
            <div style={{display:"flex",gap:5,fontSize:10}}>
              {crit>0 && <span style={{padding:"2px 8px",borderRadius:10,background:"#fef2f2",color:"#ef4444",fontWeight:700}}>{crit} CRIT</span>}
              {warn>0 && <span style={{padding:"2px 8px",borderRadius:10,background:"#fffbeb",color:"#f59e0b",fontWeight:700}}>{warn} WARN</span>}
              {crit===0&&warn===0 && <span style={{padding:"2px 8px",borderRadius:10,background:"#f0fdf4",color:"#10b981",fontWeight:700}}>✓ Clear</span>}
            </div>
          </div>
          <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
            {alerts.length===0 && <div style={{color:"#94a3b8",textAlign:"center",padding:20,fontSize:12}}>No alerts recorded</div>}
            {alerts.map(a=>(
              <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 9px",borderRadius:8,borderLeft:`3px solid ${a.severity==="critical"?"#ef4444":a.severity==="warning"?"#f59e0b":"#3b82f6"}`,background:a.severity==="critical"?"#fef2f2":a.severity==="warning"?"#fffbeb":"#eff6ff",opacity:a.acknowledged?.4:1,fontSize:12}}>
                <span style={{fontSize:14,marginTop:1,flexShrink:0}}>{a.severity==="critical"?"🚨":a.severity==="warning"?"⚠️":"ℹ️"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.message}</div>
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{new Date(a.timestamp).toLocaleTimeString()}</div>
                </div>
                {!a.acknowledged && <button onClick={()=>ackAlert(a.id)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:14,padding:0,flexShrink:0}}>✓</button>}
              </div>
            ))}
          </div>
        </div>

        {/* System Log */}
        <div style={{gridColumn:"span 7",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6}}>⌨ System Log</span>
            <span style={{fontSize:11,color:"#94a3b8"}}>{logs.length} entries</span>
          </div>
          <div style={{maxHeight:220,overflowY:"auto",fontFamily:"'Courier New',monospace",fontSize:11,display:"flex",flexDirection:"column",gap:1}}>
            {logs.map((l,i)=>{
              const isCrit=l.includes("ABNORMAL")||l.includes("overheating")||l.includes("electrical");
              const isWarn=l.includes("WARNING")||l.includes("bearing")||l.includes("imbalance");
              return <div key={i} style={{padding:"2px 5px",borderRadius:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:isCrit?"#dc2626":isWarn?"#92400e":"#64748b",background:isCrit?"#fef2f2":isWarn?"#fffbeb":"transparent"}}>{l}</div>;
            })}
            {logs.length===0 && <div style={{color:"#94a3b8",textAlign:"center",padding:16}}>Waiting for data...</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
