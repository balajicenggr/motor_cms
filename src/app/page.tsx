"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase — hardcoded fallback so it never fails ───────
const SB_URL = "https://xflnuafbijrqhkbiukvk.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmbG51YWZiaWpycWhrYml1a3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjY5MzAsImV4cCI6MjA5MTgwMjkzMH0.fGu60r279DSrgKSNSXmSzh5GUFduKfQieBnVx_i5HwQ";
const sb = createClient(SB_URL, SB_KEY);

// ── Types ─────────────────────────────────────────────────
type Cond = "normal"|"bearing_fault"|"imbalance"|"overheating"|"electrical_fault";
interface Row {
  id:number; device_id:string; timestamp:string;
  temperature:number; vibration_rms:number; sound_db:number; humidity:number|null;
  ml_predictions?:{condition:Cond;confidence:number;anomaly_score:number}[];
}
interface Alert {
  id:number; timestamp:string; severity:"critical"|"warning"|"info";
  message:string; acknowledged:boolean;
}

// ── Threshold helpers ─────────────────────────────────────
const T = {temp:{w:70,c:85,max:120},vib:{w:2.8,c:4.5,max:10},snd:{w:70,c:85,max:120},hum:{w:60,c:70,max:100}};
function st(v:number,w:number,c:number){return v>=c?"crit":v>=w?"warn":"ok";}
function stColor(s:string){return s==="crit"?"#ef4444":s==="warn"?"#f59e0b":"#10b981";}
function stLabel(s:string){return s==="crit"?"ABNORMAL":s==="warn"?"WARNING":"NORMAL";}
function stBg(s:string){return s==="crit"?"#fef2f2":s==="warn"?"#fffbeb":"#f0fdf4";}

const HM:Record<string,{icon:string;label:string;color:string;bg:string;border:string}> = {
  normal:          {icon:"🛡️",label:"NORMAL",         color:"#10b981",bg:"#f0fdf4",border:"#bbf7d0"},
  bearing_fault:   {icon:"⚠️",label:"BEARING FAULT",  color:"#ef4444",bg:"#fef2f2",border:"#fecaca"},
  imbalance:       {icon:"⚡",label:"IMBALANCE",       color:"#f59e0b",bg:"#fffbeb",border:"#fde68a"},
  overheating:     {icon:"🔥",label:"OVERHEATING",     color:"#f97316",bg:"#fff7ed",border:"#fed7aa"},
  electrical_fault:{icon:"💥",label:"ELEC. FAULT",    color:"#8b5cf6",bg:"#f5f3ff",border:"#ddd6fe"},
};

// ── Gauge ─────────────────────────────────────────────────
function Gauge({label,value,unit,w,c,max,opt}:{label:string;value?:number;unit:string;w:number;c:number;max:number;opt?:boolean}) {
  const has = value!=null && !isNaN(value as number);
  const s   = has ? st(value!,w,c) : "ok";
  const pct = has ? Math.min(100,(value!/max)*100) : 0;
  return (
    <div style={{background:"#fff",borderRadius:12,border:`1px solid ${stColor(s)}33`,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5}}>{label}</span>
        {has && <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:stBg(s),color:stColor(s)}}>{stLabel(s)}</span>}
      </div>
      <div style={{marginBottom:4}}>
        <span style={{fontSize:28,fontWeight:800}}>{has?value!.toFixed(unit==="mm/s"?2:1):(opt?"N/A":"—")}</span>
        <span style={{fontSize:12,color:"#94a3b8",marginLeft:4}}>{unit}</span>
      </div>
      <div style={{height:7,background:"#f1f5f9",borderRadius:4,overflow:"hidden",marginBottom:5}}>
        <div style={{height:"100%",borderRadius:4,background:stColor(s),width:`${pct}%`,transition:"width .5s"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#94a3b8"}}>
        <span>✅ &lt;{w}</span><span>⚠️ {w}–{c}</span><span>❌ &gt;{c}</span>
      </div>
    </div>
  );
}

// ── Mini sparkline (pure CSS bars) ───────────────────────
function Sparkline({data,color,max}:{data:number[];color:string;max:number}) {
  const pts = data.slice(-30);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height:40}}>
      {pts.map((v,i) => (
        <div key={i} style={{flex:1,background:color,borderRadius:2,opacity:.7,
          height:`${Math.max(4,Math.min(100,(v/max)*100))}%`,transition:"height .3s"}}/>
      ))}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const [rows,      setRows]      = useState<Row[]>([]);
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [logs,      setLogs]      = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [time,      setTime]      = useState("");
  const [err,       setErr]       = useState<string|null>(null);

  const latest = rows[0] ?? null;
  const pred   = latest?.ml_predictions?.[0] ?? null;
  const m      = HM[pred?.condition ?? "normal"] ?? HM.normal;

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([
      sb.from("sensor_readings").select("id,device_id,timestamp,temperature,vibration_rms,sound_db,humidity,ml_predictions(condition,confidence,anomaly_score)").order("timestamp",{ascending:false}).limit(60),
      sb.from("alerts").select("*").order("timestamp",{ascending:false}).limit(30)
    ]).then(([{data:r,error:re},{data:a,error:ae}]) => {
      if (re) { setErr("Read error: "+re.message); return; }
      if (ae) { setErr("Alert error: "+ae.message); return; }
      if (r) { setRows(r as Row[]); if (r.length>0) setConnected(true); }
      if (a) setAlerts(a as Alert[]);
    }).catch(e => setErr(String(e)))
    .finally(() => setLoading(false));
  }, []);

  // Realtime
  useEffect(() => {
    const ch1 = sb.channel("rt-readings").on("postgres_changes",
      {event:"INSERT",schema:"public",table:"sensor_readings"},
      ({new:n}) => {
        const r = n as Row;
        setConnected(true);
        setRows(p => [r,...p].slice(0,500));
        setLogs(p => [`[${new Date(r.timestamp).toLocaleTimeString()}] ${r.device_id} T:${r.temperature?.toFixed(1)}°C V:${r.vibration_rms?.toFixed(2)}mm/s S:${r.sound_db?.toFixed(1)}dB`,...p].slice(0,100));
      }).subscribe();
    const ch2 = sb.channel("rt-alerts").on("postgres_changes",
      {event:"INSERT",schema:"public",table:"alerts"},
      ({new:n}) => setAlerts(p => [n as Alert,...p].slice(0,50))
    ).subscribe();
    const ch3 = sb.channel("rt-preds").on("postgres_changes",
      {event:"INSERT",schema:"public",table:"ml_predictions"},
      ({new:n}) => {
        const p = n as {reading_id:number;condition:Cond;confidence:number;anomaly_score:number};
        setRows(prev => prev.map(r => r.id===p.reading_id ? {...r,ml_predictions:[p,...(r.ml_predictions??[])]} : r));
      }).subscribe();
    return () => { ch1.unsubscribe(); ch2.unsubscribe(); ch3.unsubscribe(); };
  }, []);

  const ackAlert = useCallback(async (id:number) => {
    await sb.from("alerts").update({acknowledged:true} as never).eq("id",id);
    setAlerts(p => p.map(a => a.id===id ? {...a,acknowledged:true} : a));
  }, []);

  const exportCSV = useCallback(async () => {
    const {data} = await sb.from("sensor_readings").select("*,ml_predictions(condition,confidence)").order("timestamp",{ascending:true});
    if (!data) return;
    const csv = ["id,timestamp,device_id,temperature,vibration_rms,sound_db,humidity,condition,confidence",
      ...(data as Row[]).map(r => {
        const p = r.ml_predictions?.[0];
        return `${r.id},${r.timestamp},${r.device_id},${r.temperature},${r.vibration_rms},${r.sound_db},${r.humidity??""},${p?.condition??""},${p?.confidence??""}`;
      })].join("\n");
    const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`motor_${Date.now()}.csv`; a.click();
  }, []);

  // Error screen
  if (err) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",padding:20,textAlign:"center",fontFamily:"system-ui"}}>
      <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
      <div style={{fontSize:16,fontWeight:700,color:"#ef4444",marginBottom:8}}>Dashboard Error</div>
      <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:16,maxWidth:600,fontFamily:"monospace",fontSize:12,color:"#991b1b",wordBreak:"break-all",marginBottom:12}}>{err}</div>
      <button onClick={()=>window.location.reload()} style={{padding:"8px 20px",borderRadius:6,background:"#3b82f6",color:"#fff",border:"none",cursor:"pointer",fontSize:13}}>Retry</button>
    </div>
  );

  // Loading screen
  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#64748b",fontSize:14,fontFamily:"system-ui"}}>
      <span style={{marginRight:8}}>⚙️</span> Connecting to Supabase...
    </div>
  );

  const crit = alerts.filter(a=>!a.acknowledged&&a.severity==="critical").length;
  const warn = alerts.filter(a=>!a.acknowledged&&a.severity==="warning").length;
  const temps = rows.map(r=>r.temperature).reverse();
  const vibs  = rows.map(r=>r.vibration_rms).reverse();
  const snds  = rows.map(r=>r.sound_db).reverse();

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:13,color:"#1e293b"}}>

      {/* ── Header ── */}
      <header style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>⚙️</span>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"#2563eb",letterSpacing:2,textTransform:"uppercase"}}>Motor CMS</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>Induction Motor Condition Monitoring</div>
          </div>
          <div style={{marginLeft:12,display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,border:`1px solid ${connected?"#bbf7d0":"#fde68a"}`,background:connected?"#f0fdf4":"#fef9c3",color:connected?"#16a34a":"#92400e",fontSize:11,fontWeight:600}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:connected?"#22c55e":"#eab308",display:"inline-block",animation:connected?"pulse 1.5s infinite":"none"}}/>
            {connected?"LIVE":"WAITING FOR ESP32"}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11,color:"#94a3b8"}}>{time}</span>
          <button onClick={exportCSV} style={{padding:"5px 12px",borderRadius:6,border:"1px solid #bfdbfe",background:"#fff",color:"#2563eb",cursor:"pointer",fontSize:12}}>⬇ Export CSV</button>
        </div>
      </header>

      <main style={{padding:16,display:"grid",gridTemplateColumns:"repeat(12,1fr)",gap:12,alignItems:"start"}}>

        {/* ── Gauges ── */}
        <div style={{gridColumn:"span 12",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          <Gauge label="🌡️ Temperature"  value={latest?.temperature}          unit="°C"   w={T.temp.w} c={T.temp.c} max={T.temp.max}/>
          <Gauge label="📳 Vibration RMS" value={latest?.vibration_rms}       unit="mm/s" w={T.vib.w}  c={T.vib.c}  max={T.vib.max}/>
          <Gauge label="🔊 Sound Level"  value={latest?.sound_db}             unit="dB"   w={T.snd.w}  c={T.snd.c}  max={T.snd.max}/>
          <Gauge label="🌧️ Humidity"     value={latest?.humidity??undefined}  unit="%RH"  w={T.hum.w}  c={T.hum.c}  max={T.hum.max} opt/>
        </div>

        {/* ── Health ── */}
        <div style={{gridColumn:"span 4",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>Motor Health</div>
          <div style={{borderRadius:8,padding:16,textAlign:"center",background:m.bg,border:`1px solid ${m.border}`,marginBottom:10}}>
            <div style={{fontSize:32,marginBottom:6}}>{m.icon}</div>
            <div style={{fontSize:15,fontWeight:700,color:m.color,letterSpacing:.5}}>{m.label}</div>
            {pred && <>
              <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Confidence: {(pred.confidence*100).toFixed(1)}%</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>Anomaly: {pred.anomaly_score?.toFixed(3)}</div>
            </>}
          </div>
          {latest && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {[["Device",latest.device_id],["Temp",`${latest.temperature?.toFixed(1)}°C`],["Vib RMS",`${latest.vibration_rms?.toFixed(2)} mm/s`],["Sound",`${latest.sound_db?.toFixed(1)} dB`]].map(([k,v])=>(
                <div key={k} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px"}}>
                  <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase"}}>{k}</div>
                  <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Sparklines ── */}
        <div style={{gridColumn:"span 8",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>Sensor Trends (last {rows.length} readings)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            {[{label:"Temperature °C",data:temps,color:"#06b6d4",max:120},{label:"Vibration mm/s",data:vibs,color:"#f59e0b",max:10},{label:"Sound dB",data:snds,color:"#8b5cf6",max:120}].map(({label,data,color,max})=>(
              <div key={label}>
                <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>{label}</div>
                <Sparkline data={data} color={color} max={max}/>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>
                  Min:{data.length?Math.min(...data).toFixed(1):"—"} Max:{data.length?Math.max(...data).toFixed(1):"—"} Avg:{data.length?(data.reduce((a,b)=>a+b,0)/data.length).toFixed(1):"—"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent readings table ── */}
        <div style={{gridColumn:"span 12",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>Recent Readings ({rows.length} total)</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["#","Time","Device","Temp °C","Vib mm/s","Sound dB","Humidity","Condition","Confidence"].map(h=>(
                    <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.4,borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0,10).map(r => {
                  const p = r.ml_predictions?.[0];
                  const condColor = p?.condition ? {normal:"#10b981",bearing_fault:"#ef4444",imbalance:"#f59e0b",overheating:"#f97316",electrical_fault:"#8b5cf6"}[p.condition]??"#94a3b8" : "#94a3b8";
                  return (
                    <tr key={r.id} style={{borderBottom:"1px solid #f8fafc"}}>
                      <td style={{padding:"6px 10px",color:"#94a3b8"}}>{r.id}</td>
                      <td style={{padding:"6px 10px",fontFamily:"monospace",fontSize:11}}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                      <td style={{padding:"6px 10px"}}>{r.device_id}</td>
                      <td style={{padding:"6px 10px",fontWeight:600,color:stColor(st(r.temperature,T.temp.w,T.temp.c))}}>{r.temperature?.toFixed(1)}</td>
                      <td style={{padding:"6px 10px",fontWeight:600,color:stColor(st(r.vibration_rms,T.vib.w,T.vib.c))}}>{r.vibration_rms?.toFixed(2)}</td>
                      <td style={{padding:"6px 10px",fontWeight:600,color:stColor(st(r.sound_db,T.snd.w,T.snd.c))}}>{r.sound_db?.toFixed(1)}</td>
                      <td style={{padding:"6px 10px",color:"#64748b"}}>{r.humidity!=null?r.humidity.toFixed(1):"—"}</td>
                      <td style={{padding:"6px 10px"}}>{p ? <span style={{padding:"2px 8px",borderRadius:10,background:condColor+"22",color:condColor,fontSize:10,fontWeight:600}}>{p.condition.replace(/_/g," ")}</span> : "—"}</td>
                      <td style={{padding:"6px 10px",color:"#64748b"}}>{p ? `${(p.confidence*100).toFixed(0)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Alerts ── */}
        <div style={{gridColumn:"span 5",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6}}>Alerts</span>
            <div style={{display:"flex",gap:5,fontSize:10}}>
              {crit>0&&<span style={{padding:"2px 8px",borderRadius:10,background:"#fef2f2",color:"#ef4444",fontWeight:700}}>{crit} CRIT</span>}
              {warn>0&&<span style={{padding:"2px 8px",borderRadius:10,background:"#fffbeb",color:"#f59e0b",fontWeight:700}}>{warn} WARN</span>}
              {crit===0&&warn===0&&<span style={{padding:"2px 8px",borderRadius:10,background:"#f0fdf4",color:"#10b981",fontWeight:700}}>✓ Clear</span>}
            </div>
          </div>
          <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
            {alerts.length===0&&<div style={{color:"#94a3b8",textAlign:"center",padding:20,fontSize:12}}>No alerts</div>}
            {alerts.map(a=>(
              <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 9px",borderRadius:8,borderLeft:`3px solid ${a.severity==="critical"?"#ef4444":a.severity==="warning"?"#f59e0b":"#3b82f6"}`,background:a.severity==="critical"?"#fef2f2":a.severity==="warning"?"#fffbeb":"#eff6ff",opacity:a.acknowledged?.4:1,fontSize:12}}>
                <span style={{fontSize:14,flexShrink:0}}>{a.severity==="critical"?"🚨":a.severity==="warning"?"⚠️":"ℹ️"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.message}</div>
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{new Date(a.timestamp).toLocaleTimeString()}</div>
                </div>
                {!a.acknowledged&&<button onClick={()=>ackAlert(a.id)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:14,padding:0}}>✓</button>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Log ── */}
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
            {logs.length===0&&<div style={{color:"#94a3b8",textAlign:"center",padding:16}}>Waiting for data...</div>}
          </div>
        </div>

      </main>
    </div>
  );
}
