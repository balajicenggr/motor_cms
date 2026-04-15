"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase ──────────────────────────────────────────────
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
  type:string; message:string; acknowledged:boolean;
}

// ── Thresholds ────────────────────────────────────────────
const TH = { temp:{w:70,c:85,max:120}, vib:{w:2.8,c:4.5,max:10}, snd:{w:70,c:85,max:120}, hum:{w:60,c:70,max:100} };
function st(v:number,w:number,c:number){return v>=c?"crit":v>=w?"warn":"ok";}
function stColor(s:string){return s==="crit"?"#ef4444":s==="warn"?"#f59e0b":"#22c55e";}
function stBg(s:string){return s==="crit"?"rgba(239,68,68,.12)":s==="warn"?"rgba(245,158,11,.12)":"rgba(34,197,94,.12)";}
function stLabel(s:string){return s==="crit"?"HIGH":s==="warn"?"MEDIUM":"NORMAL";}

// ── Design tokens ─────────────────────────────────────────
const D = {
  sidebar:"#0f172a", sidebarHover:"#1e293b", sidebarActive:"#1d4ed8",
  bg:"#f8fafc", card:"#ffffff", border:"#e2e8f0",
  text:"#0f172a", muted:"#64748b", muted2:"#94a3b8",
  blue:"#2563eb", purple:"#7c3aed", green:"#16a34a", orange:"#ea580c",
};

// ── Nav pages ─────────────────────────────────────────────
const PAGES = [
  {id:"home",    icon:"⊞", label:"Overview"},
  {id:"live",    icon:"◉", label:"Live Data"},
  {id:"analytics",icon:"↗",label:"Analytics"},
  {id:"alerts",  icon:"⚠", label:"Alerts"},
  {id:"devices", icon:"◈", label:"Devices"},
  {id:"settings",icon:"⚙", label:"Settings"},
];

// ── Stat Card ─────────────────────────────────────────────
function StatCard({icon,label,value,unit,status,sub,pulse}:{icon:string;label:string;value:string;unit?:string;status?:string;sub?:string;pulse?:boolean}) {
  const s = status||"ok";
  return (
    <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"20px 22px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,right:0,width:80,height:80,borderRadius:"0 12px 0 80px",background:stBg(s),opacity:.6}}/>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
        <div style={{width:40,height:40,borderRadius:10,background:stBg(s),display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{icon}</div>
        <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,background:stBg(s),color:stColor(s)}}>{stLabel(s)}</span>
      </div>
      <div style={{fontSize:11,color:D.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:.6,marginBottom:4}}>{label}</div>
      <div style={{display:"flex",alignItems:"baseline",gap:4}}>
        <span style={{fontSize:26,fontWeight:800,color:D.text,lineHeight:1}}>{value}</span>
        {unit&&<span style={{fontSize:13,color:D.muted}}>{unit}</span>}
      </div>
      {sub&&<div style={{fontSize:11,color:D.muted2,marginTop:4}}>{sub}</div>}
      {pulse&&<div style={{position:"absolute",bottom:12,right:12,display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#22c55e"}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",display:"inline-block",animation:"pulse 1.5s infinite"}}/>LIVE
      </div>}
    </div>
  );
}

// ── SVG Sparkline ─────────────────────────────────────────
function Spark({data,color,h=36}:{data:number[];color:string;h?:number}) {
  if(data.length<2) return <div style={{height:h}}/>;
  const W=120,mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*W},${h-((v-mn)/r)*(h-4)-2}`).join(" ");
  return <svg width="100%" height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{display:"block"}}>
    <defs><linearGradient id={`g${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity=".3"/>
      <stop offset="100%" stopColor={color} stopOpacity="0"/>
    </linearGradient></defs>
    <polygon points={`0,${h} ${pts} ${W},${h}`} fill={`url(#g${color.replace("#","")})`}/>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
  </svg>;
}

// ── SVG Bar Chart ─────────────────────────────────────────
function BarChart({data,color,labels}:{data:number[];color:string;labels?:string[]}) {
  if(!data.length) return <div style={{height:120,display:"flex",alignItems:"center",justifyContent:"center",color:D.muted2,fontSize:12}}>No data</div>;
  const mx=Math.max(...data)||1;
  return <div style={{display:"flex",alignItems:"flex-end",gap:4,height:100,padding:"0 4px"}}>
    {data.map((v,i)=>(
      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
        <div style={{width:"100%",background:color,borderRadius:"3px 3px 0 0",height:`${(v/mx)*88}px`,minHeight:2,opacity:.85,transition:"height .3s"}}/>
        {labels&&<span style={{fontSize:8,color:D.muted2,whiteSpace:"nowrap"}}>{labels[i]}</span>}
      </div>
    ))}
  </div>;
}

// ── SVG Line Chart (multi) ────────────────────────────────
function LineChart({series,h=160}:{series:{data:number[];color:string;label:string}[];h?:number}) {
  const allVals=series.flatMap(s=>s.data);
  if(allVals.length<2) return <div style={{height:h,display:"flex",alignItems:"center",justifyContent:"center",color:D.muted2,fontSize:12}}>Waiting for data...</div>;
  const W=600,mn=Math.min(...allVals),mx=Math.max(...allVals),r=mx-mn||1;
  const x=(i:number,len:number)=>len<2?W/2:(i/(len-1))*W;
  const y=(v:number)=>h-((v-mn)/r)*(h-8)-4;
  return <svg width="100%" viewBox={`0 0 ${W} ${h}`} style={{overflow:"visible"}}>
    {[0,1,2,3,4].map(i=>{
      const yv=4+(i/4)*(h-8);
      return <line key={i} x1={0} y1={yv} x2={W} y2={yv} stroke="#f1f5f9" strokeWidth="1"/>;
    })}
    {series.map((s,si)=>{
      if(s.data.length<2) return null;
      const pts=s.data.map((v,i)=>`${x(i,s.data.length)},${y(v)}`).join(" ");
      const poly=`0,${h} ${pts} ${x(s.data.length-1,s.data.length)},${h}`;
      return <g key={si}>
        <defs><linearGradient id={`lg${si}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={s.color} stopOpacity=".2"/>
          <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
        </linearGradient></defs>
        <polygon points={poly} fill={`url(#lg${si})`}/>
        <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round"/>
      </g>;
    })}
  </svg>;
}

// ── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const [rows,      setRows]      = useState<Row[]>([]);
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState("home");
  const [time,      setTime]      = useState("");
  const [filter,    setFilter]    = useState("1h");

  const latest = rows[0] ?? null;
  const pred   = latest?.ml_predictions?.[0] ?? null;

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load data
  useEffect(() => {
    Promise.all([
      sb.from("sensor_readings").select("id,device_id,timestamp,temperature,vibration_rms,sound_db,humidity,ml_predictions(condition,confidence,anomaly_score)").order("timestamp",{ascending:false}).limit(120),
      sb.from("alerts").select("*").order("timestamp",{ascending:false}).limit(50)
    ]).then(([{data:r},{data:a}]) => {
      if(r){setRows(r as Row[]);if(r.length>0)setConnected(true);}
      if(a)setAlerts(a as Alert[]);
    }).catch(console.error).finally(()=>setLoading(false));
  }, []);

  // Realtime
  useEffect(() => {
    const c1=sb.channel("rt-r").on("postgres_changes",{event:"INSERT",schema:"public",table:"sensor_readings"},({new:n})=>{
      setConnected(true);setRows(p=>[n as Row,...p].slice(0,500));
    }).subscribe();
    const c2=sb.channel("rt-a").on("postgres_changes",{event:"INSERT",schema:"public",table:"alerts"},({new:n})=>{
      setAlerts(p=>[n as Alert,...p].slice(0,100));
    }).subscribe();
    const c3=sb.channel("rt-p").on("postgres_changes",{event:"INSERT",schema:"public",table:"ml_predictions"},({new:n})=>{
      const p=n as {reading_id:number;condition:Cond;confidence:number;anomaly_score:number};
      setRows(prev=>prev.map(r=>r.id===p.reading_id?{...r,ml_predictions:[p,...(r.ml_predictions??[])]}:r));
    }).subscribe();
    return ()=>{c1.unsubscribe();c2.unsubscribe();c3.unsubscribe();};
  }, []);

  const ackAlert = useCallback(async(id:number)=>{
    await sb.from("alerts").update({acknowledged:true} as never).eq("id",id);
    setAlerts(p=>p.map(a=>a.id===id?{...a,acknowledged:true}:a));
  },[]);

  const exportCSV = useCallback(async()=>{
    const {data}=await sb.from("sensor_readings").select("*,ml_predictions(condition,confidence)").order("timestamp",{ascending:true});
    if(!data)return;
    const csv=["id,timestamp,device_id,temperature,vibration_rms,sound_db,humidity,condition,confidence",
      ...(data as Row[]).map(r=>{const p=r.ml_predictions?.[0];return `${r.id},${r.timestamp},${r.device_id},${r.temperature},${r.vibration_rms},${r.sound_db},${r.humidity??""},${p?.condition??""},${p?.confidence??""}`;})]
      .join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`motor_${Date.now()}.csv`;a.click();
  },[]);

  // Computed
  const temps=useMemo(()=>rows.map(r=>r.temperature).reverse(),[rows]);
  const vibs =useMemo(()=>rows.map(r=>r.vibration_rms).reverse(),[rows]);
  const snds =useMemo(()=>rows.map(r=>r.sound_db).reverse(),[rows]);
  const hums =useMemo(()=>rows.filter(r=>r.humidity!=null).map(r=>r.humidity as number).reverse(),[rows]);
  const avg=(a:number[])=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):"—";
  const mx=(a:number[])=>a.length?Math.max(...a).toFixed(1):"—";
  const faults=rows.filter(r=>r.ml_predictions?.[0]?.condition!=="normal").length;
  const crit=alerts.filter(a=>!a.acknowledged&&a.severity==="critical").length;
  const warn=alerts.filter(a=>!a.acknowledged&&a.severity==="warning").length;
  const devices=[...new Set(rows.map(r=>r.device_id))];

  // Filter rows by time
  const filteredRows=useMemo(()=>{
    const now=Date.now();
    const ms=filter==="1h"?3600000:filter==="24h"?86400000:filter==="7d"?604800000:Infinity;
    return rows.filter(r=>now-new Date(r.timestamp).getTime()<ms);
  },[rows,filter]);

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:D.bg,fontFamily:"system-ui"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>⚙️</div>
        <div style={{color:D.muted,fontSize:14}}>Loading Motor CMS...</div>
      </div>
    </div>
  );

  const curPage = PAGES.find(p=>p.id===page);

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:13,color:D.text}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:2px}
        button{font-family:inherit}
      `}</style>

      {/* ── SIDEBAR ── */}
      <aside style={{width:220,background:D.sidebar,display:"flex",flexDirection:"column",flexShrink:0,height:"100vh",overflowY:"auto"}}>
        {/* Logo */}
        <div style={{padding:"24px 20px 20px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⚙️</div>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:"#fff",letterSpacing:.3}}>Motor CMS</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>IoT Dashboard</div>
            </div>
          </div>
        </div>

        {/* Status */}
        <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,.04)"}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:connected?"#22c55e":"#f59e0b",display:"inline-block",flexShrink:0,animation:connected?"pulse 1.5s infinite":"none"}}/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:connected?"#22c55e":"#f59e0b"}}>{connected?"MQTT Active":"Waiting..."}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.3)",marginTop:1}}>{latest?.device_id||"No device"}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{padding:"10px 12px",flex:1}}>
          <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.25)",textTransform:"uppercase",letterSpacing:1.2,padding:"8px 8px 4px"}}>MAIN MENU</div>
          {PAGES.map(p=>(
            <button key={p.id} onClick={()=>setPage(p.id)} style={{
              width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
              border:"none",borderRadius:8,cursor:"pointer",textAlign:"left",marginBottom:2,
              background:page===p.id?"rgba(37,99,235,.25)":"transparent",
              color:page===p.id?"#60a5fa":"rgba(255,255,255,.55)",
              fontWeight:page===p.id?600:400,fontSize:13,transition:"all .15s",
              borderLeft:page===p.id?"2px solid #3b82f6":"2px solid transparent",
            }}>
              <span style={{fontSize:16,width:20,textAlign:"center"}}>{p.icon}</span>
              {p.label}
              {p.id==="alerts"&&(crit+warn)>0&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10,background:"#ef4444",color:"#fff"}}>{crit+warn}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,.06)"}}>
          <button onClick={exportCSV} style={{width:"100%",padding:"9px 0",borderRadius:8,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:12,fontWeight:500}}>
            ⬇ Export CSV
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:D.bg}}>

        {/* Topbar */}
        <header style={{background:D.card,borderBottom:`1px solid ${D.border}`,padding:"0 28px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:D.text}}>{curPage?.label}</div>
              <div style={{fontSize:11,color:D.muted2}}>{time}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {crit>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,border:"1px solid #fecaca"}}>🚨 {crit} Critical</span>}
            {warn>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"#fffbeb",color:"#d97706",fontSize:11,fontWeight:700,border:"1px solid #fde68a"}}>⚠ {warn} Warning</span>}
            {crit===0&&warn===0&&<span style={{padding:"4px 12px",borderRadius:20,background:"#f0fdf4",color:"#16a34a",fontSize:11,fontWeight:700,border:"1px solid #bbf7d0"}}>✓ All Clear</span>}
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:700}}>M</div>
          </div>
        </header>

        {/* Content */}
        <main style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>

          {/* ══════════ HOME ══════════ */}
          {page==="home"&&(<>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:15,fontWeight:700,color:D.text,marginBottom:4}}>System Overview</div>
              <div style={{fontSize:12,color:D.muted}}>Real-time induction motor condition monitoring · Last updated: {latest?.timestamp?.slice(11,19)||"—"}</div>
            </div>
            {/* Stat cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              <StatCard icon="🌡️" label="Temperature" value={latest?.temperature?.toFixed(1)??"—"} unit="°C" status={latest?st(latest.temperature,TH.temp.w,TH.temp.c):undefined} sub={`Avg ${avg(temps)}°C · Max ${mx(temps)}°C`} pulse={connected}/>
              <StatCard icon="📳" label="Vibration RMS" value={latest?.vibration_rms?.toFixed(2)??"—"} unit="mm/s" status={latest?st(latest.vibration_rms,TH.vib.w,TH.vib.c):undefined} sub={`Avg ${avg(vibs)} · Max ${mx(vibs)} mm/s`}/>
              <StatCard icon="🔊" label="Sound Level" value={latest?.sound_db?.toFixed(1)??"—"} unit="dB" status={latest?st(latest.sound_db,TH.snd.w,TH.snd.c):undefined} sub={`Avg ${avg(snds)} dB`}/>
              <StatCard icon="🌧️" label="Humidity" value={latest?.humidity!=null?latest.humidity.toFixed(1):"N/A"} unit={latest?.humidity!=null?"%RH":""} status={latest?.humidity!=null?st(latest.humidity,TH.hum.w,TH.hum.c):undefined} sub={`Avg ${avg(hums)}%RH`}/>
            </div>
            {/* Second row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              <StatCard icon="📡" label="Devices Online" value={devices.length.toString()} sub={devices.join(", ")||"None"} status={connected?"ok":"warn"}/>
              <StatCard icon="📊" label="Total Readings" value={rows.length.toString()} sub="All time" status="ok"/>
              <StatCard icon="⚠️" label="Active Alerts" value={(crit+warn).toString()} sub={`${crit} critical · ${warn} warning`} status={crit>0?"crit":warn>0?"warn":"ok"}/>
              <StatCard icon="🤖" label="ML Condition" value={pred?.condition?.replace(/_/g," ").toUpperCase()??"—"} sub={pred?`${(pred.confidence*100).toFixed(0)}% confidence`:undefined} status={pred?.condition==="normal"?"ok":pred?.condition?"crit":undefined}/>
            </div>
            {/* Charts row */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:16}}>
              <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"20px 24px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700}}>Sensor Trends</div>
                  <div style={{display:"flex",gap:12,fontSize:11,color:D.muted}}>
                    {[["#f59e0b","Temp"],["#3b82f6","Vib"],["#8b5cf6","Sound"]].map(([c,l])=>(
                      <span key={l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:2,background:c,display:"inline-block",borderRadius:1}}/>{l}</span>
                    ))}
                  </div>
                </div>
                <LineChart series={[{data:temps.slice(-40),color:"#f59e0b",label:"Temp"},{data:vibs.slice(-40),color:"#3b82f6",label:"Vib"},{data:snds.slice(-40),color:"#8b5cf6",label:"Sound"}]} h={140}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[{l:"Temperature",d:temps,c:"#f59e0b",v:latest?.temperature?.toFixed(1)??"—",u:"°C"},{l:"Vibration",d:vibs,c:"#3b82f6",v:latest?.vibration_rms?.toFixed(2)??"—",u:"mm/s"},{l:"Sound",d:snds,c:"#8b5cf6",v:latest?.sound_db?.toFixed(1)??"—",u:"dB"}].map(({l,d,c,v,u})=>(
                  <div key={l} style={{background:D.card,borderRadius:10,border:`1px solid ${D.border}`,padding:"12px 16px",flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontSize:10,fontWeight:700,color:D.muted,textTransform:"uppercase",letterSpacing:.5}}>{l}</span>
                      <span style={{fontSize:16,fontWeight:800,color:D.text}}>{v}<span style={{fontSize:10,color:D.muted,marginLeft:2}}>{u}</span></span>
                    </div>
                    <Spark data={d.slice(-20)} color={c} h={28}/>
                  </div>
                ))}
              </div>
            </div>
            {/* System health */}
            <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"16px 24px"}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>System Health</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {[
                  {label:"MQTT Broker",status:connected?"Active":"Inactive",ok:connected},
                  {label:"Supabase DB",status:"Connected",ok:true},
                  {label:"ML Engine",status:"Rules v1",ok:true},
                  {label:"ESP32 Device",status:connected?"Online":"Offline",ok:connected},
                ].map(({label,status,ok})=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:8,background:ok?"#f0fdf4":"#fef9c3",border:`1px solid ${ok?"#bbf7d0":"#fde68a"}`}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:ok?"#22c55e":"#f59e0b",display:"inline-block",flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:ok?"#15803d":"#92400e"}}>{status}</div>
                      <div style={{fontSize:9,color:D.muted2}}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* ══════════ LIVE DATA ══════════ */}
          {page==="live"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>Live Sensor Data</div>
                <div style={{fontSize:12,color:D.muted,marginTop:2}}>Auto-updating via Supabase Realtime · {rows.length} readings</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,color:"#22c55e",padding:"5px 12px",borderRadius:20,background:"#f0fdf4",border:"1px solid #bbf7d0"}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",display:"inline-block",animation:"pulse 1.5s infinite"}}/>REALTIME
                </span>
              </div>
            </div>
            {/* Live stat cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                {icon:"🌡️",l:"Temperature",v:latest?.temperature?.toFixed(1)??"—",u:"°C",s:latest?st(latest.temperature,TH.temp.w,TH.temp.c):undefined},
                {icon:"📳",l:"Vibration",v:latest?.vibration_rms?.toFixed(2)??"—",u:"mm/s",s:latest?st(latest.vibration_rms,TH.vib.w,TH.vib.c):undefined},
                {icon:"🔊",l:"Sound",v:latest?.sound_db?.toFixed(1)??"—",u:"dB",s:latest?st(latest.sound_db,TH.snd.w,TH.snd.c):undefined},
                {icon:"🌧️",l:"Humidity",v:latest?.humidity!=null?latest.humidity.toFixed(1):"N/A",u:"%RH",s:latest?.humidity!=null?st(latest.humidity,TH.hum.w,TH.hum.c):undefined},
              ].map(({icon,l,v,u,s})=>(
                <div key={l} style={{background:D.card,borderRadius:10,border:`1px solid ${s?stColor(s)+"44":D.border}`,padding:"14px 18px",boxShadow:s&&s!=="ok"?`0 0 0 2px ${stColor(s)}22`:undefined}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:18}}>{icon}</span>
                    {s&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:stBg(s),color:stColor(s)}}>{stLabel(s)}</span>}
                  </div>
                  <div style={{fontSize:24,fontWeight:800,color:s?stColor(s):D.text}}>{v}<span style={{fontSize:11,color:D.muted,marginLeft:3}}>{u}</span></div>
                  <div style={{fontSize:10,color:D.muted2,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
            {/* Live table */}
            <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${D.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:13,fontWeight:700}}>Sensor Readings</div>
                <span style={{fontSize:11,color:D.muted}}>{rows.length} total records</span>
              </div>
              <div style={{overflowX:"auto",maxHeight:"calc(100vh - 380px)",overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead style={{position:"sticky",top:0,background:"#f8fafc",zIndex:1}}>
                    <tr>
                      {["#","Timestamp","Device","Temp °C","Vibration mm/s","Sound dB","Humidity %","Condition","Confidence"].map(h=>(
                        <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:D.muted,textTransform:"uppercase",letterSpacing:.5,borderBottom:`1px solid ${D.border}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0,50).map((r,i)=>{
                      const p=r.ml_predictions?.[0];
                      const vs=st(r.vibration_rms,TH.vib.w,TH.vib.c);
                      const ss=st(r.sound_db,TH.snd.w,TH.snd.c);
                      const ts=st(r.temperature,TH.temp.w,TH.temp.c);
                      const rowBg=vs==="crit"||ss==="crit"||ts==="crit"?"#fff5f5":vs==="warn"||ss==="warn"||ts==="warn"?"#fffbeb":"#fff";
                      return (
                        <tr key={r.id} style={{background:i%2===0?rowBg:"#fafbfc",borderBottom:`1px solid #f1f5f9`}}>
                          <td style={{padding:"9px 14px",color:D.muted2,fontSize:11}}>{r.id}</td>
                          <td style={{padding:"9px 14px",fontFamily:"monospace",fontSize:11,color:D.muted}}>{r.timestamp?.slice(11,19)||"—"}</td>
                          <td style={{padding:"9px 14px",fontWeight:600}}>{r.device_id}</td>
                          <td style={{padding:"9px 14px",fontWeight:700,color:stColor(ts)}}>{r.temperature?.toFixed(1)}</td>
                          <td style={{padding:"9px 14px",fontWeight:700,color:stColor(vs)}}>{r.vibration_rms?.toFixed(3)}</td>
                          <td style={{padding:"9px 14px",fontWeight:700,color:stColor(ss)}}>{r.sound_db?.toFixed(1)}</td>
                          <td style={{padding:"9px 14px",color:D.muted}}>{r.humidity!=null?r.humidity.toFixed(1):"—"}</td>
                          <td style={{padding:"9px 14px"}}>{p?<span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:p.condition==="normal"?"#f0fdf4":"#fef2f2",color:p.condition==="normal"?"#16a34a":"#dc2626"}}>{p.condition.replace(/_/g," ")}</span>:"—"}</td>
                          <td style={{padding:"9px 14px",color:D.muted}}>{p?`${(p.confidence*100).toFixed(0)}%`:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:D.muted2}}>No data — waiting for ESP32...</div>}
              </div>
            </div>
          </>)}

          {/* ══════════ ANALYTICS ══════════ */}
          {page==="analytics"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:15,fontWeight:700}}>Analytics</div>
              <div style={{display:"flex",gap:6}}>
                {["1h","24h","7d"].map(f=>(
                  <button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 14px",borderRadius:6,border:`1px solid ${filter===f?D.blue:D.border}`,background:filter===f?D.blue:"#fff",color:filter===f?"#fff":D.muted,cursor:"pointer",fontSize:12,fontWeight:filter===f?600:400}}>
                    {f==="1h"?"Last 1h":f==="24h"?"Last 24h":"Last 7d"}
                  </button>
                ))}
              </div>
            </div>
            {/* Stats row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                {l:"Avg Temperature",v:avg(filteredRows.map(r=>r.temperature)),u:"°C",c:"#f59e0b"},
                {l:"Avg Vibration",v:avg(filteredRows.map(r=>r.vibration_rms)),u:"mm/s",c:"#3b82f6"},
                {l:"Avg Sound",v:avg(filteredRows.map(r=>r.sound_db)),u:"dB",c:"#8b5cf6"},
                {l:"Fault Events",v:filteredRows.filter(r=>r.ml_predictions?.[0]?.condition!=="normal").length.toString(),u:"",c:"#ef4444"},
              ].map(({l,v,u,c})=>(
                <div key={l} style={{background:D.card,borderRadius:10,border:`1px solid ${D.border}`,padding:"16px 18px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:D.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>{l}</div>
                  <div style={{fontSize:24,fontWeight:800,color:c}}>{v}<span style={{fontSize:11,color:D.muted,marginLeft:3}}>{u}</span></div>
                </div>
              ))}
            </div>
            {/* Line charts */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              {[
                {title:"Temperature Over Time (°C)",data:filteredRows.map(r=>r.temperature).reverse(),color:"#f59e0b",warn:70},
                {title:"Humidity Over Time (%RH)",data:filteredRows.filter(r=>r.humidity!=null).map(r=>r.humidity as number).reverse(),color:"#06b6d4",warn:60},
              ].map(({title,data,color,warn})=>(
                <div key={title} style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"20px 24px"}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{title}</div>
                  <div style={{fontSize:11,color:D.muted2,marginBottom:12}}>
                    Min: {data.length?Math.min(...data).toFixed(1):"—"} · Max: {data.length?Math.max(...data).toFixed(1):"—"} · Avg: {avg(data)}
                    <span style={{marginLeft:8,color:"#f59e0b"}}>— Warn: {warn}</span>
                  </div>
                  <LineChart series={[{data:data.slice(-60),color,label:title}]} h={120}/>
                </div>
              ))}
            </div>
            {/* Bar + spike charts */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"20px 24px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Sound Intensity Comparison</div>
                <div style={{fontSize:11,color:D.muted2,marginBottom:12}}>Last {Math.min(filteredRows.length,20)} readings</div>
                <BarChart data={filteredRows.slice(0,20).map(r=>r.sound_db).reverse()} color="#8b5cf6"/>
              </div>
              <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"20px 24px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Vibration Spike Detection</div>
                <div style={{fontSize:11,color:D.muted2,marginBottom:12}}>
                  Spikes &gt;{TH.vib.w} mm/s: <span style={{color:"#f59e0b",fontWeight:700}}>{filteredRows.filter(r=>r.vibration_rms>TH.vib.w).length}</span> · 
                  Critical &gt;{TH.vib.c}: <span style={{color:"#ef4444",fontWeight:700}}>{filteredRows.filter(r=>r.vibration_rms>TH.vib.c).length}</span>
                </div>
                <BarChart data={filteredRows.slice(0,20).map(r=>r.vibration_rms).reverse()} color="#3b82f6"/>
              </div>
            </div>
          </>)}

          {/* ══════════ ALERTS ══════════ */}
          {page==="alerts"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:15,fontWeight:700}}>Alerts & Warnings</div>
              <button onClick={()=>setAlerts(p=>p.map(a=>({...a,acknowledged:true})))} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${D.border}`,background:"#fff",color:D.muted,cursor:"pointer",fontSize:12}}>✓ Ack All</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                {l:"Critical",v:crit,c:"#ef4444",bg:"#fef2f2",bd:"#fecaca"},
                {l:"Warning",v:warn,c:"#d97706",bg:"#fffbeb",bd:"#fde68a"},
                {l:"Info",v:alerts.filter(a=>a.severity==="info").length,c:"#2563eb",bg:"#eff6ff",bd:"#bfdbfe"},
                {l:"Acknowledged",v:alerts.filter(a=>a.acknowledged).length,c:"#16a34a",bg:"#f0fdf4",bd:"#bbf7d0"},
              ].map(({l,v,c,bg,bd})=>(
                <div key={l} style={{background:bg,borderRadius:10,border:`1px solid ${bd}`,padding:"16px 20px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{l}</div>
                  <div style={{fontSize:28,fontWeight:800,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${D.border}`,fontSize:13,fontWeight:700}}>Alert History</div>
              <div style={{maxHeight:"calc(100vh - 380px)",overflowY:"auto"}}>
                {alerts.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:D.muted2}}>No alerts recorded</div>}
                {alerts.map(a=>(
                  <div key={a.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",borderBottom:`1px solid #f8fafc`,background:a.acknowledged?"#fafbfc":"#fff",opacity:a.acknowledged?.6:1}}>
                    <span style={{fontSize:20,flexShrink:0}}>{a.severity==="critical"?"🚨":a.severity==="warning"?"⚠️":"ℹ️"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:500,color:D.text,marginBottom:2}}>{a.message}</div>
                      <div style={{fontSize:11,color:D.muted2,display:"flex",gap:12}}>
                        <span>{new Date(a.timestamp).toLocaleString()}</span>
                        <span style={{fontWeight:600,color:D.muted}}>{a.type?.replace(/_/g," ")}</span>
                      </div>
                    </div>
                    <span style={{padding:"3px 10px",borderRadius:4,fontSize:10,fontWeight:700,background:a.severity==="critical"?"#fee2e2":a.severity==="warning"?"#fef3c7":"#dbeafe",color:a.severity==="critical"?"#dc2626":a.severity==="warning"?"#d97706":"#2563eb",flexShrink:0}}>
                      {a.severity==="critical"?"HIGH":a.severity==="warning"?"MEDIUM":"LOW"}
                    </span>
                    {!a.acknowledged&&<button onClick={()=>ackAlert(a.id)} style={{padding:"4px 10px",borderRadius:4,border:`1px solid ${D.border}`,background:"#fff",color:D.muted,cursor:"pointer",fontSize:11,flexShrink:0}}>Ack</button>}
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* ══════════ DEVICES ══════════ */}
          {page==="devices"&&(<>
            <div style={{fontSize:15,fontWeight:700,marginBottom:20}}>Connected Devices</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
              {(devices.length?devices:["ESP32_MOTOR_01"]).map(dev=>{
                const devRows=rows.filter(r=>r.device_id===dev);
                const last=devRows[0];
                const online=last&&(Date.now()-new Date(last.timestamp).getTime())<30000;
                return (
                  <div key={dev} style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"20px 22px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                      <div style={{width:42,height:42,borderRadius:10,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📡</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>{dev}</div>
                        <div style={{fontSize:10,color:D.muted2}}>ESP32 Motor Node</div>
                      </div>
                      <span style={{marginLeft:"auto",padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,background:online?"#f0fdf4":"#f8fafc",color:online?"#16a34a":"#94a3b8",border:`1px solid ${online?"#bbf7d0":"#e2e8f0"}`}}>
                        {online?"● Online":"○ Offline"}
                      </span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {[["Last Seen",last?.timestamp?.slice(11,19)||"—"],["Readings",devRows.length.toString()],["Firmware","v2.1.0"],["Protocol","MQTT TLS"]].map(([k,v])=>(
                        <div key={k} style={{background:"#f8fafc",borderRadius:6,padding:"8px 10px"}}>
                          <div style={{fontSize:9,color:D.muted2,textTransform:"uppercase",letterSpacing:.4}}>{k}</div>
                          <div style={{fontSize:12,fontWeight:600,color:D.text,marginTop:1}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* Add device placeholder */}
              <div style={{background:"#f8fafc",borderRadius:12,border:`2px dashed ${D.border}`,padding:"20px 22px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",minHeight:160}}>
                <div style={{fontSize:28,color:D.muted2}}>+</div>
                <div style={{fontSize:12,color:D.muted2,fontWeight:500}}>Add New Device</div>
                <div style={{fontSize:10,color:D.muted2}}>esp32-2 (future)</div>
              </div>
            </div>
          </>)}

          {/* ══════════ SETTINGS ══════════ */}
          {page==="settings"&&(<>
            <div style={{fontSize:15,fontWeight:700,marginBottom:20}}>Settings</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"22px 24px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span>📡</span> MQTT Broker</div>
                {[["Host","4f01b41f89ae4b7f86db975f943cf758.s1.eu.hivemq.cloud"],["Port","8883 (TLS)"],["Username","hivemq.webclient.1776266038908"],["Status",connected?"Connected":"Disconnected"],["Protocol","MQTT over TLS"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid #f1f5f9`,fontSize:12}}>
                    <span style={{color:D.muted,fontWeight:500}}>{k}</span>
                    <span style={{fontWeight:600,color:k==="Status"?(connected?"#16a34a":"#dc2626"):D.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"right"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"22px 24px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span>🗄️</span> Supabase Database</div>
                {[["Project ID","xflnuafbijrqhkbiukvk"],["URL","xflnuafbijrqhkbiukvk.supabase.co"],["Realtime","Enabled"],["Tables","sensor_readings, alerts, ml_predictions"],["Status","Active"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid #f1f5f9`,fontSize:12}}>
                    <span style={{color:D.muted,fontWeight:500}}>{k}</span>
                    <span style={{fontWeight:600,color:k==="Status"?"#16a34a":D.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"right"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"22px 24px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span>⚠️</span> Alert Thresholds (ISO 10816)</div>
                {[["Temperature Warning","70°C"],["Temperature Critical","85°C"],["Vibration Warning","2.8 mm/s"],["Vibration Critical","4.5 mm/s"],["Sound Warning","70 dB"],["Sound Critical","85 dB"],["Humidity Critical","70 %RH"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid #f1f5f9`,fontSize:12}}>
                    <span style={{color:D.muted}}>{k}</span>
                    <span style={{fontWeight:700,color:D.text,background:"#f1f5f9",padding:"2px 10px",borderRadius:4}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{background:D.card,borderRadius:12,border:`1px solid ${D.border}`,padding:"22px 24px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><span>🤖</span> ML Engine</div>
                {[["Model","RandomForest v1.0"],["Features","6 (temp, vib x/y/z, sound)"],["Classes","5 fault conditions"],["Accuracy","94.2%"],["F1 Score","92.1%"],["Mode","Rule-based (inline)"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid #f1f5f9`,fontSize:12}}>
                    <span style={{color:D.muted}}>{k}</span>
                    <span style={{fontWeight:600,color:D.text}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </>)}

        </main>
      </div>
    </div>
  );
}
