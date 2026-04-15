"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://xflnuafbijrqhkbiukvk.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmbG51YWZiaWpycWhrYml1a3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjY5MzAsImV4cCI6MjA5MTgwMjkzMH0.fGu60r279DSrgKSNSXmSzh5GUFduKfQieBnVx_i5HwQ"
);

type Cond = "normal"|"bearing_fault"|"imbalance"|"overheating"|"electrical_fault";
interface Row {
  id:number; device_id:string; timestamp:string;
  temperature:number; vibration_rms:number; sound_db:number; humidity:number|null;
  ml_predictions?:{condition:Cond;confidence:number;anomaly_score:number}[];
}
interface Alert { id:number; timestamp:string; severity:"critical"|"warning"|"info"; message:string; acknowledged:boolean; }

// Thresholds
const TH = {temp:{w:70,c:85},vib:{w:2.8,c:4.5},snd:{w:70,c:85}};
function st(v:number,w:number,c:number){return v>=c?"crit":v>=w?"warn":"ok";}
function stC(s:string){return s==="crit"?"#ef4444":s==="warn"?"#f59e0b":"#10b981";}

// ── Sidebar nav items ─────────────────────────────────────
const NAV = [
  {icon:"🏠",label:"Overview",id:"overview"},
  {icon:"📊",label:"Analytics",id:"analytics"},
  {icon:"🔔",label:"Alerts",id:"alerts"},
  {icon:"📋",label:"Logs",id:"logs"},
  {icon:"⚙️",label:"Settings",id:"settings"},
];

// ── Metric card ───────────────────────────────────────────
function MetricCard({label,value,unit,sub,badge,badgeColor}:{label:string;value:string;unit?:string;sub?:string;badge?:string;badgeColor?:string}) {
  return (
    <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"18px 20px",minWidth:0}}>
      <div style={{fontSize:10,fontWeight:700,color:"#8a94a6",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>{label}</div>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <span style={{fontSize:28,fontWeight:700,color:"#1a2332",lineHeight:1}}>{value}</span>
          {unit && <span style={{fontSize:13,color:"#8a94a6",marginLeft:4}}>{unit}</span>}
          {sub && <div style={{fontSize:11,color:"#8a94a6",marginTop:3}}>{sub}</div>}
        </div>
        {badge && (
          <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:4,background:badgeColor==="green"?"#dcfce7":badgeColor==="red"?"#fee2e2":"#fef3c7",color:badgeColor==="green"?"#16a34a":badgeColor==="red"?"#dc2626":"#d97706",whiteSpace:"nowrap"}}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Mini sparkline (SVG) ──────────────────────────────────
function Sparkline({data,color,height=40}:{data:number[];color:string;height?:number}) {
  if (data.length < 2) return <div style={{height}} />;
  const w = 200, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v,i) => `${(i/(data.length-1))*w},${h-((v-min)/range)*(h-4)-2}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Main chart (SVG line chart) ───────────────────────────
function LineChart({data,keys,colors,labels}:{data:Record<string,number>[];keys:string[];colors:string[];labels:string[]}) {
  if (data.length < 2) return <div style={{height:200,display:"flex",alignItems:"center",justifyContent:"center",color:"#8a94a6",fontSize:13}}>Waiting for data...</div>;
  const W=800, H=180, PAD={t:10,r:20,b:30,l:40};
  const cW=W-PAD.l-PAD.r, cH=H-PAD.t-PAD.b;
  const allVals = keys.flatMap(k => data.map(d => d[k]||0));
  const min=Math.min(...allVals), max=Math.max(...allVals)||1;
  const x=(i:number)=>PAD.l+(i/(data.length-1))*cW;
  const y=(v:number)=>PAD.t+cH-((v-min)/(max-min||1))*cH;
  const ticks = 5;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
      {/* Grid */}
      {Array.from({length:ticks+1},(_,i)=>{
        const yv=PAD.t+(i/ticks)*cH;
        const val=(max-(i/ticks)*(max-min)).toFixed(1);
        return <g key={i}><line x1={PAD.l} y1={yv} x2={W-PAD.r} y2={yv} stroke="#f0f2f5" strokeWidth="1"/><text x={PAD.l-6} y={yv+4} textAnchor="end" fontSize="9" fill="#8a94a6">{val}</text></g>;
      })}
      {/* X labels */}
      {data.filter((_,i)=>i%(Math.ceil(data.length/8))===0).map((d,i,arr)=>{
        const idx=data.indexOf(d);
        return <text key={i} x={x(idx)} y={H-4} textAnchor="middle" fontSize="9" fill="#8a94a6">{(d.t as unknown as string)?.slice(0,5)||""}</text>;
      })}
      {/* Lines */}
      {keys.map((k,ki)=>{
        const pts=data.map((_,i)=>`${x(i)},${y(data[i][k]||0)}`).join(" ");
        return <polyline key={k} points={pts} fill="none" stroke={colors[ki]} strokeWidth="2" strokeLinejoin="round"/>;
      })}
      {/* Legend */}
      {keys.map((k,ki)=>(
        <g key={k} transform={`translate(${PAD.l+ki*120},${H-2})`}>
          <line x1="0" y1="-8" x2="12" y2="-8" stroke={colors[ki]} strokeWidth="2"/>
          <text x="16" y="-4" fontSize="9" fill="#8a94a6">{labels[ki]}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const [rows,      setRows]      = useState<Row[]>([]);
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState("overview");
  const [time,      setTime]      = useState("");

  const latest = rows[0] ?? null;
  const pred   = latest?.ml_predictions?.[0] ?? null;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      sb.from("sensor_readings").select("id,device_id,timestamp,temperature,vibration_rms,sound_db,humidity,ml_predictions(condition,confidence,anomaly_score)").order("timestamp",{ascending:false}).limit(60),
      sb.from("alerts").select("*").order("timestamp",{ascending:false}).limit(30)
    ]).then(([{data:r},{data:a}]) => {
      if (r) { setRows(r as Row[]); if (r.length>0) setConnected(true); }
      if (a) setAlerts(a as Alert[]);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const ch1 = sb.channel("rt-r").on("postgres_changes",{event:"INSERT",schema:"public",table:"sensor_readings"},({new:n})=>{
      setConnected(true);
      setRows(p=>[n as Row,...p].slice(0,500));
    }).subscribe();
    const ch2 = sb.channel("rt-a").on("postgres_changes",{event:"INSERT",schema:"public",table:"alerts"},({new:n})=>{
      setAlerts(p=>[n as Alert,...p].slice(0,50));
    }).subscribe();
    const ch3 = sb.channel("rt-p").on("postgres_changes",{event:"INSERT",schema:"public",table:"ml_predictions"},({new:n})=>{
      const p=n as {reading_id:number;condition:Cond;confidence:number;anomaly_score:number};
      setRows(prev=>prev.map(r=>r.id===p.reading_id?{...r,ml_predictions:[p,...(r.ml_predictions??[])]}:r));
    }).subscribe();
    return () => { ch1.unsubscribe(); ch2.unsubscribe(); ch3.unsubscribe(); };
  }, []);

  const ackAlert = useCallback(async (id:number) => {
    await sb.from("alerts").update({acknowledged:true} as never).eq("id",id);
    setAlerts(p=>p.map(a=>a.id===id?{...a,acknowledged:true}:a));
  }, []);

  const exportCSV = useCallback(async () => {
    const {data} = await sb.from("sensor_readings").select("*,ml_predictions(condition,confidence)").order("timestamp",{ascending:true});
    if (!data) return;
    const csv = ["id,timestamp,device_id,temperature,vibration_rms,sound_db,humidity,condition,confidence",
      ...(data as Row[]).map(r=>{const p=r.ml_predictions?.[0];return `${r.id},${r.timestamp},${r.device_id},${r.temperature},${r.vibration_rms},${r.sound_db},${r.humidity??""},${p?.condition??""},${p?.confidence??""}`;})]
      .join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`motor_${Date.now()}.csv`; a.click();
  }, []);

  // Computed stats
  const temps  = rows.map(r=>r.temperature).reverse();
  const vibs   = rows.map(r=>r.vibration_rms).reverse();
  const snds   = rows.map(r=>r.sound_db).reverse();
  const avgT   = temps.length ? (temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1) : "—";
  const avgV   = vibs.length  ? (vibs.reduce((a,b)=>a+b,0)/vibs.length).toFixed(2)  : "—";
  const avgS   = snds.length  ? (snds.reduce((a,b)=>a+b,0)/snds.length).toFixed(1)  : "—";
  const maxT   = temps.length ? Math.max(...temps).toFixed(1) : "—";
  const maxV   = vibs.length  ? Math.max(...vibs).toFixed(2)  : "—";
  const faults = rows.filter(r=>r.ml_predictions?.[0]?.condition!=="normal").length;
  const faultRate = rows.length ? ((faults/rows.length)*100).toFixed(0)+"%" : "—";
  const crit   = alerts.filter(a=>!a.acknowledged&&a.severity==="critical").length;
  const warn   = alerts.filter(a=>!a.acknowledged&&a.severity==="warning").length;

  const chartData = rows.slice(0,60).reverse().map(r=>({
    t: r.timestamp?.slice(11,16)||"",
    temperature: r.temperature,
    vibration_rms: r.vibration_rms,
    sound_db: r.sound_db,
  }));

  const condLabel = pred?.condition?.replace(/_/g," ").toUpperCase() ?? "—";
  const condColor = pred?.condition==="normal"?"green":pred?.condition?"red":"";

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f4f6f9",fontFamily:"system-ui",color:"#8a94a6",fontSize:14}}>
      <span style={{marginRight:8}}>⚙️</span> Loading Motor CMS...
    </div>
  );

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#f4f6f9",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:13,color:"#1a2332"}}>

      {/* ── Sidebar ── */}
      <aside style={{width:200,background:"#fff",borderRight:"1px solid #e8ecf0",display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
        {/* Logo */}
        <div style={{padding:"20px 20px 16px",borderBottom:"1px solid #e8ecf0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20}}>⚙️</span>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:"#1a2332",letterSpacing:.5}}>Motor CMS</div>
              <div style={{fontSize:10,color:"#8a94a6"}}>Condition Monitor</div>
            </div>
          </div>
        </div>
        {/* Device */}
        <div style={{padding:"12px 20px",borderBottom:"1px solid #e8ecf0"}}>
          <div style={{fontSize:9,fontWeight:700,color:"#8a94a6",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Device</div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:connected?"#22c55e":"#f59e0b",display:"inline-block",flexShrink:0}}/>
            <span style={{fontSize:12,fontWeight:600,color:"#1a2332",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{latest?.device_id||"ESP32_MOTOR_01"}</span>
          </div>
          <div style={{fontSize:10,color:"#8a94a6",marginTop:3}}>{connected?"● Live":"○ Waiting"}</div>
        </div>
        {/* Nav */}
        <nav style={{padding:"8px 0",flex:1}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setPage(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 20px",border:"none",background:page===n.id?"#f0f7ff":"transparent",color:page===n.id?"#2563eb":"#4a5568",fontWeight:page===n.id?600:400,fontSize:13,cursor:"pointer",textAlign:"left",borderLeft:page===n.id?"3px solid #2563eb":"3px solid transparent",transition:"all .15s"}}>
              <span style={{fontSize:15}}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        {/* Export */}
        <div style={{padding:"12px 20px",borderTop:"1px solid #e8ecf0"}}>
          <button onClick={exportCSV} style={{width:"100%",padding:"8px 0",borderRadius:6,border:"1px solid #e8ecf0",background:"#fff",color:"#4a5568",cursor:"pointer",fontSize:12,fontWeight:500}}>⬇ Export CSV</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

        {/* Topbar */}
        <header style={{background:"#fff",borderBottom:"1px solid #e8ecf0",padding:"12px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:"#1a2332"}}>{NAV.find(n=>n.id===page)?.label||"Overview"}</div>
            <div style={{fontSize:11,color:"#8a94a6",marginTop:1}}>{time}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {crit>0&&<span style={{padding:"4px 10px",borderRadius:20,background:"#fee2e2",color:"#dc2626",fontSize:11,fontWeight:700}}>{crit} Critical</span>}
            {warn>0&&<span style={{padding:"4px 10px",borderRadius:20,background:"#fef3c7",color:"#d97706",fontSize:11,fontWeight:700}}>{warn} Warning</span>}
            {crit===0&&warn===0&&<span style={{padding:"4px 10px",borderRadius:20,background:"#dcfce7",color:"#16a34a",fontSize:11,fontWeight:700}}>✓ All Clear</span>}
          </div>
        </header>

        <main style={{flex:1,padding:"24px 28px",overflowY:"auto"}}>

          {/* ══ OVERVIEW PAGE ══ */}
          {page === "overview" && (<>

            {/* Key Metrics */}
            <div style={{marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:700,color:"#1a2332",marginBottom:16}}>Key Metrics</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                <MetricCard label="Temperature" value={latest?.temperature?.toFixed(1)??"—"} unit="°C"
                  badge={latest?st(latest.temperature,TH.temp.w,TH.temp.c)==="ok"?"Normal":st(latest.temperature,TH.temp.w,TH.temp.c)==="warn"?"Warning":"Critical":undefined}
                  badgeColor={latest?st(latest.temperature,TH.temp.w,TH.temp.c)==="ok"?"green":st(latest.temperature,TH.temp.w,TH.temp.c)==="warn"?"yellow":"red":undefined}
                  sub={`Avg: ${avgT}°C  Max: ${maxT}°C`}/>
                <MetricCard label="Vibration RMS" value={latest?.vibration_rms?.toFixed(2)??"—"} unit="mm/s"
                  badge={latest?st(latest.vibration_rms,TH.vib.w,TH.vib.c)==="ok"?"Normal":st(latest.vibration_rms,TH.vib.w,TH.vib.c)==="warn"?"Warning":"Critical":undefined}
                  badgeColor={latest?st(latest.vibration_rms,TH.vib.w,TH.vib.c)==="ok"?"green":st(latest.vibration_rms,TH.vib.w,TH.vib.c)==="warn"?"yellow":"red":undefined}
                  sub={`Avg: ${avgV}  Max: ${maxV} mm/s`}/>
                <MetricCard label="Sound Level" value={latest?.sound_db?.toFixed(1)??"—"} unit="dB"
                  badge={latest?st(latest.sound_db,TH.snd.w,TH.snd.c)==="ok"?"Normal":st(latest.sound_db,TH.snd.w,TH.snd.c)==="warn"?"Warning":"Critical":undefined}
                  badgeColor={latest?st(latest.sound_db,TH.snd.w,TH.snd.c)==="ok"?"green":st(latest.sound_db,TH.snd.w,TH.snd.c)==="warn"?"yellow":"red":undefined}
                  sub={`Avg: ${avgS} dB`}/>
                <MetricCard label="ML Condition" value={condLabel} badge={pred?.condition==="normal"?"Normal":pred?.condition?"Fault":undefined} badgeColor={pred?.condition==="normal"?"green":pred?.condition?"red":undefined} sub={pred?`Confidence: ${(pred.confidence*100).toFixed(0)}%`:undefined}/>
              </div>
            </div>

            {/* Second row metrics */}
            <div style={{marginBottom:24}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                <MetricCard label="Total Readings" value={rows.length.toString()} sub="All time" badge={rows.length>0?"Active":undefined} badgeColor="green"/>
                <MetricCard label="Fault Rate" value={faultRate} sub={`${faults} faults detected`} badge={faults>0?"Has Faults":undefined} badgeColor={faults>0?"red":"green"}/>
                <MetricCard label="Active Alerts" value={(crit+warn).toString()} sub={`${crit} critical, ${warn} warning`} badge={crit>0?"Critical":warn>0?"Warning":undefined} badgeColor={crit>0?"red":warn>0?"yellow":"green"}/>
                <MetricCard label="Humidity" value={latest?.humidity!=null?latest.humidity.toFixed(1)+"":"N/A"} unit={latest?.humidity!=null?"%RH":""} badge={latest?.humidity!=null&&latest.humidity>70?"High":latest?.humidity!=null?"Normal":undefined} badgeColor={latest?.humidity!=null&&latest.humidity>70?"red":"green"}/>
              </div>
            </div>

            {/* Main chart + side stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:16,marginBottom:24}}>
              {/* Chart */}
              <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:"#1a2332"}}>Sensor Trends</div>
                    <div style={{fontSize:11,color:"#8a94a6",marginTop:2}}>Last {rows.length} readings</div>
                  </div>
                  <div style={{display:"flex",gap:12,fontSize:11,color:"#8a94a6"}}>
                    {[["#f59e0b","Temp °C"],["#3b82f6","Vib mm/s"],["#8b5cf6","Sound dB"]].map(([c,l])=>(
                      <span key={l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:2,background:c,display:"inline-block",borderRadius:1}}/>{l}</span>
                    ))}
                  </div>
                </div>
                <LineChart data={chartData} keys={["temperature","vibration_rms","sound_db"]} colors={["#f59e0b","#3b82f6","#8b5cf6"]} labels={["Temp °C","Vib mm/s","Sound dB"]}/>
              </div>
              {/* Side stats */}
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[
                  {label:"AVG TEMPERATURE",value:avgT,unit:"°C",color:"#f59e0b",data:temps},
                  {label:"AVG VIBRATION",value:avgV,unit:"mm/s",color:"#3b82f6",data:vibs},
                  {label:"AVG SOUND",value:avgS,unit:"dB",color:"#8b5cf6",data:snds},
                ].map(({label,value,unit,color,data})=>(
                  <div key={label} style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"14px 16px",flex:1}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#8a94a6",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{label}</div>
                    <div style={{fontSize:22,fontWeight:700,color:"#1a2332",marginBottom:6}}>{value} <span style={{fontSize:12,color:"#8a94a6"}}>{unit}</span></div>
                    <Sparkline data={data.slice(-20)} color={color} height={32}/>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent readings table */}
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#1a2332",marginBottom:16}}>Recent Readings</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:"2px solid #f0f2f5"}}>
                      {["#","Time","Device","Temp °C","Vib mm/s","Sound dB","Humidity","Condition","Confidence"].map(h=>(
                        <th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"#8a94a6",textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0,8).map((r,i)=>{
                      const p=r.ml_predictions?.[0];
                      const condC=p?.condition==="normal"?"#16a34a":p?.condition?"#dc2626":"#8a94a6";
                      const condBg=p?.condition==="normal"?"#dcfce7":p?.condition?"#fee2e2":"#f4f6f9";
                      return (
                        <tr key={r.id} style={{borderBottom:"1px solid #f0f2f5",background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"9px 12px",color:"#8a94a6",fontSize:11}}>{r.id}</td>
                          <td style={{padding:"9px 12px",fontFamily:"monospace",fontSize:11,color:"#4a5568"}}>{r.timestamp?.slice(11,19)||"—"}</td>
                          <td style={{padding:"9px 12px",fontWeight:500}}>{r.device_id}</td>
                          <td style={{padding:"9px 12px",fontWeight:600,color:stC(st(r.temperature,TH.temp.w,TH.temp.c))}}>{r.temperature?.toFixed(1)}</td>
                          <td style={{padding:"9px 12px",fontWeight:600,color:stC(st(r.vibration_rms,TH.vib.w,TH.vib.c))}}>{r.vibration_rms?.toFixed(2)}</td>
                          <td style={{padding:"9px 12px",fontWeight:600,color:stC(st(r.sound_db,TH.snd.w,TH.snd.c))}}>{r.sound_db?.toFixed(1)}</td>
                          <td style={{padding:"9px 12px",color:"#4a5568"}}>{r.humidity!=null?r.humidity.toFixed(1)+"%":"—"}</td>
                          <td style={{padding:"9px 12px"}}>{p?<span style={{padding:"2px 8px",borderRadius:4,background:condBg,color:condC,fontSize:10,fontWeight:700}}>{p.condition.replace(/_/g," ")}</span>:"—"}</td>
                          <td style={{padding:"9px 12px",color:"#4a5568"}}>{p?`${(p.confidence*100).toFixed(0)}%`:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"#8a94a6",fontSize:13}}>No data yet — waiting for ESP32...</div>}
              </div>
            </div>
          </>)}

          {/* ══ ANALYTICS PAGE ══ */}
          {page === "analytics" && (<>
            <div style={{marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:700,color:"#1a2332",marginBottom:16}}>Sensor Analytics</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {[
                  {title:"Temperature Trend (°C)",data:temps,color:"#f59e0b",warn:70,crit:85},
                  {title:"Vibration RMS Trend (mm/s)",data:vibs,color:"#3b82f6",warn:2.8,crit:4.5},
                  {title:"Sound Level Trend (dB)",data:snds,color:"#8b5cf6",warn:70,crit:85},
                  {title:"Anomaly Score Trend",data:rows.map(r=>r.ml_predictions?.[0]?.anomaly_score??0).reverse(),color:"#ef4444",warn:0.5,crit:0.8},
                ].map(({title,data,color})=>(
                  <div key={title} style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#1a2332",marginBottom:4}}>{title}</div>
                    <div style={{fontSize:11,color:"#8a94a6",marginBottom:12}}>
                      Min: {data.length?Math.min(...data).toFixed(2):"—"} · Max: {data.length?Math.max(...data).toFixed(2):"—"} · Avg: {data.length?(data.reduce((a,b)=>a+b,0)/data.length).toFixed(2):"—"}
                    </div>
                    <Sparkline data={data.slice(-40)} color={color} height={60}/>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1a2332",marginBottom:16}}>All Sensor Trends</div>
              <LineChart data={chartData} keys={["temperature","vibration_rms","sound_db"]} colors={["#f59e0b","#3b82f6","#8b5cf6"]} labels={["Temp °C","Vib mm/s","Sound dB"]}/>
            </div>
          </>)}

          {/* ══ ALERTS PAGE ══ */}
          {page === "alerts" && (<>
            <div style={{marginBottom:16,display:"flex",gap:12}}>
              <MetricCard label="Critical" value={crit.toString()} badgeColor="red" badge={crit>0?"Active":undefined}/>
              <MetricCard label="Warnings" value={warn.toString()} badgeColor="yellow" badge={warn>0?"Active":undefined}/>
              <MetricCard label="Acknowledged" value={alerts.filter(a=>a.acknowledged).length.toString()} badgeColor="green"/>
              <MetricCard label="Total" value={alerts.length.toString()}/>
            </div>
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#1a2332",marginBottom:16}}>All Alerts</div>
              {alerts.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"#8a94a6"}}>No alerts recorded</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {alerts.map(a=>(
                  <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:6,background:a.acknowledged?"#fafbfc":a.severity==="critical"?"#fff5f5":a.severity==="warning"?"#fffbeb":"#f0f9ff",border:`1px solid ${a.severity==="critical"?"#fecaca":a.severity==="warning"?"#fde68a":"#bfdbfe"}`,opacity:a.acknowledged?.6:1}}>
                    <span style={{fontSize:18,flexShrink:0}}>{a.severity==="critical"?"🚨":a.severity==="warning"?"⚠️":"ℹ️"}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:500,color:"#1a2332"}}>{a.message}</div>
                      <div style={{fontSize:11,color:"#8a94a6",marginTop:2}}>{new Date(a.timestamp).toLocaleString()}</div>
                    </div>
                    <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:a.severity==="critical"?"#fee2e2":a.severity==="warning"?"#fef3c7":"#dbeafe",color:a.severity==="critical"?"#dc2626":a.severity==="warning"?"#d97706":"#2563eb"}}>{a.severity.toUpperCase()}</span>
                    {!a.acknowledged&&<button onClick={()=>ackAlert(a.id)} style={{padding:"4px 10px",borderRadius:4,border:"1px solid #e8ecf0",background:"#fff",color:"#4a5568",cursor:"pointer",fontSize:11,fontWeight:500}}>Ack</button>}
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* ══ LOGS PAGE ══ */}
          {page === "logs" && (
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#1a2332",marginBottom:16}}>System Log — {rows.length} readings</div>
              <div style={{fontFamily:"'Courier New',monospace",fontSize:12,display:"flex",flexDirection:"column",gap:2}}>
                {rows.slice(0,50).map(r=>{
                  const p=r.ml_predictions?.[0];
                  const isFault=p&&p.condition!=="normal";
                  return (
                    <div key={r.id} style={{padding:"4px 8px",borderRadius:3,background:isFault?"#fff5f5":"transparent",color:isFault?"#dc2626":"#4a5568",borderLeft:`2px solid ${isFault?"#ef4444":"#e8ecf0"}`}}>
                      <span style={{color:"#8a94a6"}}>[{r.timestamp?.slice(11,19)}]</span>{" "}
                      <span style={{fontWeight:600}}>{r.device_id}</span>{" "}
                      T:{r.temperature?.toFixed(1)}°C V:{r.vibration_rms?.toFixed(2)}mm/s S:{r.sound_db?.toFixed(1)}dB
                      {p&&<span style={{marginLeft:8,fontWeight:700}}>→ {p.condition.replace(/_/g," ")} ({(p.confidence*100).toFixed(0)}%)</span>}
                    </div>
                  );
                })}
                {rows.length===0&&<div style={{color:"#8a94a6",padding:"20px 0",textAlign:"center"}}>No data yet</div>}
              </div>
            </div>
          )}

          {/* ══ SETTINGS PAGE ══ */}
          {page === "settings" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#1a2332",marginBottom:16}}>Thresholds (ISO 10816)</div>
                {[["Temperature Warning","70°C"],["Temperature Critical","85°C"],["Vibration Warning","2.8 mm/s"],["Vibration Critical","4.5 mm/s"],["Sound Warning","70 dB"],["Sound Critical","85 dB"],["Humidity Critical","70 %RH"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f0f2f5",fontSize:13}}>
                    <span style={{color:"#4a5568"}}>{k}</span>
                    <span style={{fontWeight:600,color:"#1a2332"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{background:"#fff",borderRadius:8,border:"1px solid #e8ecf0",padding:"20px 24px"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#1a2332",marginBottom:16}}>Connection Info</div>
                {[["Supabase Project","xflnuafbijrqhkbiukvk"],["Device ID",latest?.device_id||"ESP32_MOTOR_01"],["Status",connected?"Connected":"Waiting"],["Total Readings",rows.length.toString()],["ESP32 Endpoint","supabase.co/functions/v1/ingest"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f0f2f5",fontSize:13}}>
                    <span style={{color:"#4a5568"}}>{k}</span>
                    <span style={{fontWeight:600,color:"#1a2332",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
