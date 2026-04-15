"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const SB_URL = "https://xflnuafbijrqhkbiukvk.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmbG51YWZiaWpycWhrYml1a3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjY5MzAsImV4cCI6MjA5MTgwMjkzMH0.fGu60r279DSrgKSNSXmSzh5GUFduKfQieBnVx_i5HwQ";
const sb = createClient(SB_URL, SB_KEY);

type Cond = "normal"|"bearing_fault"|"imbalance"|"overheating"|"electrical_fault";
interface Row { id:number; device_id:string; timestamp:string; temperature:number; vibration_rms:number; sound_db:number; humidity:number|null; ml_predictions?:{condition:Cond;confidence:number;anomaly_score:number}[]; }
interface Alert { id:number; timestamp:string; severity:"critical"|"warning"|"info"; type:string; message:string; acknowledged:boolean; }

const TH = { temp:{w:70,c:85}, vib:{w:2.8,c:4.5}, snd:{w:70,c:85}, hum:{w:60,c:70} };
const st = (v:number,w:number,c:number) => v>=c?"crit":v>=w?"warn":"ok";
const stC = (s:string) => s==="crit"?"#ef4444":s==="warn"?"#f59e0b":"#22c55e";
const stBg = (s:string) => s==="crit"?"rgba(239,68,68,.12)":s==="warn"?"rgba(245,158,11,.12)":"rgba(34,197,94,.12)";
const stL = (s:string) => s==="crit"?"HIGH":s==="warn"?"MEDIUM":"NORMAL";
const avg = (a:number[]) => a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):"—";

const NAV = [
  {id:"home",icon:"▦",label:"Dashboard",section:"PAGES"},
  {id:"analytics",icon:"↗",label:"Analytics",section:"PAGES"},
  {id:"live",icon:"◉",label:"Live Data",section:"PAGES"},
  {id:"alerts",icon:"⚠",label:"Alerts",section:"PAGES"},
  {id:"devices",icon:"◈",label:"Devices",section:"TOOLS & COMPONENTS"},
  {id:"settings",icon:"⚙",label:"Settings",section:"TOOLS & COMPONENTS"},
];

// ── SVG Bar Chart ─────────────────────────────────────────
function BarChart({data,color="#3b7ddd",labels}:{data:number[];color?:string;labels?:string[]}) {
  if(!data.length) return <div style={{height:120,display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:12}}>No data</div>;
  const mx=Math.max(...data)||1;
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:3,height:110,padding:"0 2px"}}>
      {data.map((v,i)=>(
        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <div style={{width:"100%",background:color,borderRadius:"3px 3px 0 0",height:`${(v/mx)*96}px`,minHeight:2,opacity:.85}}/>
          {labels&&<span style={{fontSize:8,color:"#94a3b8",whiteSpace:"nowrap"}}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

// ── SVG Donut Chart ───────────────────────────────────────
function Donut({slices,size=120}:{slices:{value:number;color:string;label:string}[];size?:number}) {
  const total=slices.reduce((a,s)=>a+s.value,0)||1;
  const r=46,cx=60,cy=60,circ=2*Math.PI*r;
  let offset=0;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      {slices.map((s,i)=>{
        const dash=(s.value/total)*circ;
        const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset} style={{transform:"rotate(-90deg)",transformOrigin:"60px 60px"}}/>;
        offset+=dash;
        return el;
      })}
      <text x="60" y="56" textAnchor="middle" fontSize="16" fontWeight="800" fill="#0f172a">{total}</text>
      <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#64748b">readings</text>
    </svg>
  );
}

// ── SVG Sparkline ─────────────────────────────────────────
function Spark({data,color,h=36}:{data:number[];color:string;h?:number}) {
  if(data.length<2) return <div style={{height:h}}/>;
  const W=120,mn=Math.min(...data),mx=Math.max(...data),r=mx-mn||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*W},${h-((v-mn)/r)*(h-4)-2}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{display:"block"}}>
      <defs><linearGradient id={`sg${color.replace(/[^a-z0-9]/gi,"")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".3"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${W},${h}`} fill={`url(#sg${color.replace(/[^a-z0-9]/gi,"")})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Metric Card (AppStack style) ──────────────────────────
function MetricCard({icon,label,value,unit,iconBg,trend,sub}:{icon:string;label:string;value:string;unit?:string;iconBg:string;trend?:string;sub?:string}) {
  const up=trend?.startsWith("+");
  return (
    <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px",display:"flex",alignItems:"center",gap:16}}>
      <div style={{width:48,height:48,borderRadius:"50%",background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,color:"#6c757d",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,marginBottom:2}}>{label}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}>
          <span style={{fontSize:24,fontWeight:700,color:"#212529",lineHeight:1}}>{value}</span>
          {unit&&<span style={{fontSize:12,color:"#6c757d"}}>{unit}</span>}
        </div>
        {(trend||sub)&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
          {trend&&<span style={{fontSize:11,fontWeight:600,color:up?"#28a745":"#dc3545"}}>{trend}</span>}
          {sub&&<span style={{fontSize:11,color:"#adb5bd"}}>{sub}</span>}
        </div>}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────
export default function Dashboard() {
  const [rows,setRows]=useState<Row[]>([]);
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [connected,setConnected]=useState(false);
  const [loading,setLoading]=useState(true);
  const [page,setPage]=useState("home");
  const [time,setTime]=useState("");
  const [feedCount,setFeedCount]=useState(5);

  const latest=rows[0]??null;
  const pred=latest?.ml_predictions?.[0]??null;

  useEffect(()=>{const t=setInterval(()=>setTime(new Date().toLocaleTimeString()),1000);return()=>clearInterval(t);},[]);

  useEffect(()=>{
    Promise.all([
      sb.from("sensor_readings").select("id,device_id,timestamp,temperature,vibration_rms,sound_db,humidity,ml_predictions(condition,confidence,anomaly_score)").order("timestamp",{ascending:false}).limit(120),
      sb.from("alerts").select("*").order("timestamp",{ascending:false}).limit(50)
    ]).then(([{data:r},{data:a}])=>{
      if(r){setRows(r as Row[]);if(r.length>0)setConnected(true);}
      if(a)setAlerts(a as Alert[]);
    }).catch(console.error).finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    const c1=sb.channel("rt-r").on("postgres_changes",{event:"INSERT",schema:"public",table:"sensor_readings"},({new:n})=>{setConnected(true);setRows(p=>[n as Row,...p].slice(0,500));}).subscribe();
    const c2=sb.channel("rt-a").on("postgres_changes",{event:"INSERT",schema:"public",table:"alerts"},({new:n})=>{setAlerts(p=>[n as Alert,...p].slice(0,100));}).subscribe();
    return()=>{c1.unsubscribe();c2.unsubscribe();};
  },[]);

  const ackAlert=useCallback(async(id:number)=>{
    await sb.from("alerts").update({acknowledged:true} as never).eq("id",id);
    setAlerts(p=>p.map(a=>a.id===id?{...a,acknowledged:true}:a));
  },[]);

  const temps=useMemo(()=>rows.map(r=>r.temperature).reverse(),[rows]);
  const vibs=useMemo(()=>rows.map(r=>r.vibration_rms).reverse(),[rows]);
  const snds=useMemo(()=>rows.map(r=>r.sound_db).reverse(),[rows]);
  const crit=alerts.filter(a=>!a.acknowledged&&a.severity==="critical").length;
  const warn=alerts.filter(a=>!a.acknowledged&&a.severity==="warning").length;
  const devices=[...new Set(rows.map(r=>r.device_id))];
  const faults=rows.filter(r=>r.ml_predictions?.[0]?.condition!=="normal").length;
  const normal=rows.length-faults;

  // Bar chart: last 12 readings grouped by hour buckets
  const barData=useMemo(()=>{
    const buckets:number[]=Array(12).fill(0);
    const labels:string[]=Array(12).fill("").map((_,i)=>`${i*2}h`);
    rows.slice(0,120).forEach(r=>{
      const h=new Date(r.timestamp).getHours();
      const b=Math.floor(h/2);
      if(b<12)buckets[b]=Math.max(buckets[b],r.vibration_rms);
    });
    return{buckets,labels};
  },[rows]);

  if(loading) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f4f7f9",fontFamily:"system-ui"}}>
      <div style={{textAlign:"center",color:"#6c757d"}}>
        <div style={{fontSize:36,marginBottom:12}}>⚙️</div>
        <div style={{fontSize:14}}>Loading Motor CMS...</div>
      </div>
    </div>
  );

  // Sidebar sections
  const sections=["PAGES","TOOLS & COMPONENTS"];

  return(
    <div style={{display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:13,color:"#212529"}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:2px} button{font-family:inherit;cursor:pointer}`}</style>

      {/* ── SIDEBAR ── */}
      <aside style={{width:230,background:"#1a2035",display:"flex",flexDirection:"column",flexShrink:0,height:"100vh",overflowY:"auto"}}>
        <div style={{padding:"22px 20px 18px",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#3b7ddd,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⚙️</div>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:"#fff",letterSpacing:.3}}>Motor CMS</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.35)"}}>IoT Dashboard</div>
            </div>
          </div>
        </div>
        <nav style={{padding:"8px 12px",flex:1}}>
          {sections.map(sec=>(
            <div key={sec}>
              <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.25)",textTransform:"uppercase",letterSpacing:1.2,padding:"14px 8px 5px"}}>{sec}</div>
              {NAV.filter(n=>n.section===sec).map(n=>(
                <button key={n.id} onClick={()=>setPage(n.id)} style={{
                  width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                  border:"none",borderRadius:6,textAlign:"left",marginBottom:1,
                  background:page===n.id?"#3b7ddd":"transparent",
                  color:page===n.id?"#fff":"rgba(255,255,255,.55)",
                  fontWeight:page===n.id?600:400,fontSize:13,transition:"background .15s",
                }}>
                  <span style={{fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{n.icon}</span>
                  {n.label}
                  {n.id==="alerts"&&(crit+warn)>0&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10,background:"#ef4444",color:"#fff"}}>{crit+warn}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div style={{padding:"14px 16px",borderTop:"1px solid rgba(255,255,255,.07)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:6,background:"rgba(255,255,255,.05)"}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:connected?"#22c55e":"#f59e0b",display:"inline-block",flexShrink:0,animation:connected?"pulse 1.5s infinite":"none"}}/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:connected?"#22c55e":"#f59e0b"}}>{connected?"Connected":"Waiting..."}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.3)"}}>{latest?.device_id||"No device"}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"#f4f7f9"}}>
        {/* Topbar */}
        <header style={{background:"#fff",borderBottom:"1px solid #dee2e6",padding:"0 28px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#212529"}}>{NAV.find(n=>n.id===page)?.label}</div>
            <div style={{fontSize:11,color:"#adb5bd"}}>{time} · {rows.length} readings</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {crit>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:700,border:"1px solid #fecaca"}}>🚨 {crit} Critical</span>}
            {warn>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"#fffbeb",color:"#d97706",fontSize:11,fontWeight:700,border:"1px solid #fde68a"}}>⚠ {warn} Warning</span>}
            {crit===0&&warn===0&&<span style={{padding:"4px 12px",borderRadius:20,background:"#f0fdf4",color:"#16a34a",fontSize:11,fontWeight:700,border:"1px solid #bbf7d0"}}>✓ All Clear</span>}
            <div style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#3b7ddd,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:700}}>M</div>
          </div>
        </header>

        <main style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>

          {/* ══ DASHBOARD ══ */}
          {page==="home"&&(<>
            {/* Welcome banner */}
            <div style={{background:"linear-gradient(135deg,#3b7ddd 0%,#1a56db 60%,#7c3aed 100%)",borderRadius:10,padding:"24px 28px",marginBottom:22,color:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 16px rgba(59,125,221,.35)"}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>Welcome Back, Motor CMS! 👋</div>
                <div style={{fontSize:13,opacity:.85}}>Real-time induction motor condition monitoring · {devices.length} device{devices.length!==1?"s":""} online</div>
              </div>
              <div style={{textAlign:"right",opacity:.9}}>
                <div style={{fontSize:28,fontWeight:800}}>{rows.length}</div>
                <div style={{fontSize:11}}>Total Readings</div>
              </div>
            </div>

            {/* Metric cards row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:22}}>
              <MetricCard icon="🌡️" label="Temperature" value={latest?.temperature?.toFixed(1)??"—"} unit="°C" iconBg="rgba(59,125,221,.15)" trend={latest?`${latest.temperature>70?"+":"-"}${Math.abs(latest.temperature-65).toFixed(1)}°`:undefined} sub="vs avg"/>
              <MetricCard icon="📳" label="Vibration RMS" value={latest?.vibration_rms?.toFixed(2)??"—"} unit="mm/s" iconBg="rgba(40,167,69,.15)" trend={latest?`${latest.vibration_rms>2.8?"+":"-"}${Math.abs(latest.vibration_rms-2).toFixed(2)}`:undefined} sub="vs threshold"/>
              <MetricCard icon="🔊" label="Sound Level" value={latest?.sound_db?.toFixed(1)??"—"} unit="dB" iconBg="rgba(253,126,20,.15)" trend={latest?`${latest.sound_db>70?"+":"-"}${Math.abs(latest.sound_db-65).toFixed(1)}dB`:undefined} sub="vs baseline"/>
              <MetricCard icon="🤖" label="ML Status" value={pred?.condition?.replace(/_/g," ").split(" ").map((w:string)=>w[0].toUpperCase()+w.slice(1)).join(" ")??"Normal"} iconBg="rgba(124,58,237,.15)" trend={pred?`${(pred.confidence*100).toFixed(0)}% conf`:undefined} sub="latest prediction"/>
            </div>

            {/* Row 2: Bar chart + Activity feed */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:18,marginBottom:18}}>
              {/* Sensor Trends bar chart */}
              <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#212529"}}>Sensor Trends</div>
                  <div style={{display:"flex",gap:14,fontSize:11,color:"#6c757d"}}>
                    {[["#3b7ddd","Vibration"],["#f59e0b","Temperature"],["#28a745","Sound"]].map(([c,l])=>(
                      <span key={l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:3,background:c,display:"inline-block",borderRadius:2}}/>{l}</span>
                    ))}
                  </div>
                </div>
                <BarChart data={barData.buckets} color="#3b7ddd" labels={barData.labels}/>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:14}}>
                  {[{l:"Avg Temp",v:`${avg(temps)}°C`,c:"#3b7ddd"},{l:"Avg Vibration",v:`${avg(vibs)} mm/s`,c:"#28a745"},{l:"Avg Sound",v:`${avg(snds)} dB`,c:"#f59e0b"}].map(({l,v,c})=>(
                    <div key={l} style={{textAlign:"center",padding:"8px",borderRadius:6,background:"#f8f9fa"}}>
                      <div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:"#adb5bd",marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Daily Feed / Recent Activity */}
              <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px",display:"flex",flexDirection:"column"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#212529",marginBottom:14}}>Daily Feed</div>
                <div style={{flex:1,overflowY:"auto"}}>
                  {rows.slice(0,feedCount).map((r,i)=>{
                    const p=r.ml_predictions?.[0];
                    const s=st(r.vibration_rms,TH.vib.w,TH.vib.c);
                    const colors=["#3b7ddd","#28a745","#f59e0b","#dc3545","#7c3aed"];
                    return(
                      <div key={r.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                        <div style={{width:34,height:34,borderRadius:"50%",background:colors[i%5],display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700,flexShrink:0}}>{r.device_id?.slice(0,2).toUpperCase()||"M"}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,color:"#212529"}}>{r.device_id}</div>
                          <div style={{fontSize:11,color:"#6c757d",marginTop:1}}>T:{r.temperature?.toFixed(1)}°C V:{r.vibration_rms?.toFixed(2)} S:{r.sound_db?.toFixed(1)}dB</div>
                          {p&&<span style={{fontSize:10,fontWeight:600,color:p.condition==="normal"?"#28a745":"#dc3545"}}>{p.condition.replace(/_/g," ")}</span>}
                        </div>
                        <div style={{fontSize:10,color:"#adb5bd",flexShrink:0}}>{r.timestamp?.slice(11,16)||"—"}</div>
                        <span style={{width:8,height:8,borderRadius:"50%",background:stC(s),display:"inline-block",flexShrink:0,marginTop:4}}/>
                      </div>
                    );
                  })}
                  {rows.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"#adb5bd",fontSize:12}}>Waiting for data...</div>}
                </div>
                {rows.length>feedCount&&(
                  <button onClick={()=>setFeedCount(c=>c+5)} style={{marginTop:12,padding:"8px 0",borderRadius:6,border:"1px solid #3b7ddd",background:"transparent",color:"#3b7ddd",fontSize:12,fontWeight:600}}>Load more</button>
                )}
              </div>
            </div>

            {/* Row 3: Donut + Mini chart + Latest alerts */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:18}}>
              {/* Fault Distribution donut */}
              <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Fault Distribution</div>
                <div style={{display:"flex",alignItems:"center",gap:16}}>
                  <Donut slices={[{value:normal,color:"#28a745",label:"Normal"},{value:faults,color:"#dc3545",label:"Fault"}]} size={110}/>
                  <div style={{flex:1}}>
                    {[{l:"Normal",v:normal,c:"#28a745"},{l:"Faults",v:faults,c:"#dc3545"}].map(({l,v,c})=>(
                      <div key={l} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#6c757d"}}><span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block"}}/>{l}</span>
                        <span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Weekly Readings mini chart */}
              <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Weekly Readings</div>
                <div style={{fontSize:11,color:"#adb5bd",marginBottom:12}}>Vibration trend</div>
                <Spark data={vibs.slice(-30)} color="#3b7ddd" h={60}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#3b7ddd"}}>{avg(vibs)}</div>
                    <div style={{fontSize:10,color:"#adb5bd"}}>Avg mm/s</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#dc3545"}}>{vibs.length?Math.max(...vibs).toFixed(2):"—"}</div>
                    <div style={{fontSize:10,color:"#adb5bd"}}>Peak mm/s</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#28a745"}}>{rows.length}</div>
                    <div style={{fontSize:10,color:"#adb5bd"}}>Readings</div>
                  </div>
                </div>
              </div>

              {/* Latest Alerts */}
              <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Latest Alerts</div>
                {alerts.slice(0,4).map(a=>(
                  <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:10}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:a.severity==="critical"?"#dc3545":a.severity==="warning"?"#f59e0b":"#3b7ddd",display:"inline-block",flexShrink:0,marginTop:3}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:"#212529",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.message||a.type}</div>
                      <div style={{fontSize:10,color:"#adb5bd"}}>{a.timestamp?.slice(11,16)||"—"}</div>
                    </div>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:a.severity==="critical"?"#fef2f2":a.severity==="warning"?"#fffbeb":"#eff6ff",color:a.severity==="critical"?"#dc3545":a.severity==="warning"?"#d97706":"#3b7ddd",flexShrink:0}}>{a.severity.toUpperCase()}</span>
                  </div>
                ))}
                {alerts.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:"#adb5bd",fontSize:12}}>No alerts</div>}
              </div>
            </div>
          </>)}

          {/* ══ LIVE DATA ══ */}
          {page==="live"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>Live Sensor Data</div>
                <div style={{fontSize:12,color:"#6c757d",marginTop:2}}>Auto-updating via Supabase Realtime · {rows.length} readings</div>
              </div>
              <span style={{display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:600,color:"#22c55e",padding:"5px 14px",borderRadius:20,background:"#f0fdf4",border:"1px solid #bbf7d0"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",display:"inline-block",animation:"pulse 1.5s infinite"}}/>REALTIME
              </span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              {[{icon:"🌡️",l:"Temperature",v:latest?.temperature?.toFixed(1)??"—",u:"°C",s:latest?st(latest.temperature,TH.temp.w,TH.temp.c):undefined},
                {icon:"📳",l:"Vibration",v:latest?.vibration_rms?.toFixed(2)??"—",u:"mm/s",s:latest?st(latest.vibration_rms,TH.vib.w,TH.vib.c):undefined},
                {icon:"🔊",l:"Sound",v:latest?.sound_db?.toFixed(1)??"—",u:"dB",s:latest?st(latest.sound_db,TH.snd.w,TH.snd.c):undefined},
                {icon:"🌧️",l:"Humidity",v:latest?.humidity!=null?latest.humidity.toFixed(1):"N/A",u:"%RH",s:latest?.humidity!=null?st(latest.humidity,TH.hum.w,TH.hum.c):undefined},
              ].map(({icon,l,v,u,s})=>(
                <div key={l} style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"16px 18px",borderLeft:`4px solid ${s?stC(s):"#dee2e6"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:20}}>{icon}</span>
                    {s&&<span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:stBg(s),color:stC(s)}}>{stL(s)}</span>}
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:s?stC(s):"#212529"}}>{v}<span style={{fontSize:11,color:"#6c757d",marginLeft:3}}>{u}</span></div>
                  <div style={{fontSize:10,color:"#adb5bd",marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",overflow:"hidden"}}>
              <div style={{padding:"14px 20px",borderBottom:"1px solid #dee2e6",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:13,fontWeight:700}}>Sensor Readings</div>
                <span style={{fontSize:11,color:"#6c757d"}}>{rows.length} records</span>
              </div>
              <div style={{overflowX:"auto",maxHeight:"calc(100vh - 360px)",overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead style={{position:"sticky",top:0,background:"#f8f9fa",zIndex:1}}>
                    <tr>{["#","Time","Device","Temp °C","Vibration","Sound dB","Humidity","Condition","Conf"].map(h=>(
                      <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"#6c757d",textTransform:"uppercase",letterSpacing:.5,borderBottom:"1px solid #dee2e6",whiteSpace:"nowrap"}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0,60).map((r,i)=>{
                      const p=r.ml_predictions?.[0];
                      const ts=st(r.temperature,TH.temp.w,TH.temp.c);
                      const vs=st(r.vibration_rms,TH.vib.w,TH.vib.c);
                      const ss=st(r.sound_db,TH.snd.w,TH.snd.c);
                      return(
                        <tr key={r.id} style={{background:i%2===0?"#fff":"#f8f9fa",borderBottom:"1px solid #f1f5f9"}}>
                          <td style={{padding:"8px 14px",color:"#adb5bd",fontSize:11}}>{r.id}</td>
                          <td style={{padding:"8px 14px",fontFamily:"monospace",fontSize:11,color:"#6c757d"}}>{r.timestamp?.slice(11,19)||"—"}</td>
                          <td style={{padding:"8px 14px",fontWeight:600}}>{r.device_id}</td>
                          <td style={{padding:"8px 14px",fontWeight:700,color:stC(ts)}}>{r.temperature?.toFixed(1)}</td>
                          <td style={{padding:"8px 14px",fontWeight:700,color:stC(vs)}}>{r.vibration_rms?.toFixed(3)}</td>
                          <td style={{padding:"8px 14px",fontWeight:700,color:stC(ss)}}>{r.sound_db?.toFixed(1)}</td>
                          <td style={{padding:"8px 14px",color:"#6c757d"}}>{r.humidity!=null?r.humidity.toFixed(1):"—"}</td>
                          <td style={{padding:"8px 14px"}}>{p?<span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:p.condition==="normal"?"#f0fdf4":"#fef2f2",color:p.condition==="normal"?"#16a34a":"#dc2626"}}>{p.condition.replace(/_/g," ")}</span>:"—"}</td>
                          <td style={{padding:"8px 14px",color:"#6c757d"}}>{p?`${(p.confidence*100).toFixed(0)}%`:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#adb5bd"}}>No data — waiting for ESP32...</div>}
              </div>
            </div>
          </>)}

          {/* ══ ANALYTICS ══ */}
          {page==="analytics"&&(<>
            <div style={{fontSize:15,fontWeight:700,marginBottom:20}}>Analytics</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
              {[
                {title:"Temperature Trend",data:temps.slice(-40),color:"#f59e0b",unit:"°C"},
                {title:"Vibration RMS Trend",data:vibs.slice(-40),color:"#3b7ddd",unit:"mm/s"},
                {title:"Sound Level Trend",data:snds.slice(-40),color:"#7c3aed",unit:"dB"},
                {title:"Fault Rate (bar)",data:barData.buckets,color:"#dc3545",unit:"mm/s",bar:true,labels:barData.labels},
              ].map(({title,data,color,unit,bar,labels})=>(
                <div key={title} style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                    <div style={{fontSize:13,fontWeight:700}}>{title}</div>
                    <span style={{fontSize:11,color:"#6c757d"}}>{unit}</span>
                  </div>
                  {bar?<BarChart data={data} color={color} labels={labels}/>:<Spark data={data} color={color} h={100}/>}
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:12,fontSize:11,color:"#6c757d"}}>
                    <span>Min: <b style={{color:"#212529"}}>{data.length?Math.min(...data).toFixed(2):"—"}</b></span>
                    <span>Avg: <b style={{color:"#212529"}}>{avg(data)}</b></span>
                    <span>Max: <b style={{color:"#212529"}}>{data.length?Math.max(...data).toFixed(2):"—"}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </>)}

          {/* ══ ALERTS ══ */}
          {page==="alerts"&&(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:15,fontWeight:700}}>Alerts</div>
              <div style={{display:"flex",gap:8,fontSize:12}}>
                <span style={{padding:"4px 12px",borderRadius:20,background:"#fef2f2",color:"#dc3545",fontWeight:700,border:"1px solid #fecaca"}}>{crit} Critical</span>
                <span style={{padding:"4px 12px",borderRadius:20,background:"#fffbeb",color:"#d97706",fontWeight:700,border:"1px solid #fde68a"}}>{warn} Warning</span>
              </div>
            </div>
            <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",overflow:"hidden"}}>
              {alerts.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"#adb5bd",fontSize:14}}>✓ No alerts — system healthy</div>}
              {alerts.map((a,i)=>(
                <div key={a.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",borderBottom:"1px solid #f1f5f9",background:a.acknowledged?"#f8f9fa":"#fff",opacity:a.acknowledged?.7:1}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:a.severity==="critical"?"#dc3545":a.severity==="warning"?"#f59e0b":"#3b7ddd",display:"inline-block",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#212529"}}>{a.message||a.type||"Alert"}</div>
                    <div style={{fontSize:11,color:"#adb5bd",marginTop:2}}>{a.timestamp?.slice(0,19).replace("T"," ")||"—"}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:a.severity==="critical"?"#fef2f2":a.severity==="warning"?"#fffbeb":"#eff6ff",color:a.severity==="critical"?"#dc3545":a.severity==="warning"?"#d97706":"#3b7ddd",flexShrink:0}}>{a.severity.toUpperCase()}</span>
                  {!a.acknowledged&&<button onClick={()=>ackAlert(a.id)} style={{padding:"5px 12px",borderRadius:6,border:"1px solid #dee2e6",background:"#fff",color:"#6c757d",fontSize:11,flexShrink:0}}>Ack</button>}
                  {a.acknowledged&&<span style={{fontSize:10,color:"#adb5bd",flexShrink:0}}>✓ Acked</span>}
                </div>
              ))}
            </div>
          </>)}

          {/* ══ DEVICES ══ */}
          {page==="devices"&&(<>
            <div style={{fontSize:15,fontWeight:700,marginBottom:20}}>Devices</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
              {devices.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 0",color:"#adb5bd",fontSize:14}}>No devices detected</div>}
              {devices.map(dev=>{
                const devRows=rows.filter(r=>r.device_id===dev);
                const last=devRows[0];
                const s=last?st(last.vibration_rms,TH.vib.w,TH.vib.c):"ok";
                return(
                  <div key={dev} style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px",borderTop:`4px solid ${stC(s)}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                      <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(59,125,221,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>⚙️</div>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:"#212529"}}>{dev}</div>
                        <div style={{fontSize:11,color:"#adb5bd"}}>{devRows.length} readings</div>
                      </div>
                      <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,background:stBg(s),color:stC(s)}}>{stL(s)}</span>
                    </div>
                    {last&&(
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {[{l:"Temperature",v:`${last.temperature?.toFixed(1)}°C`},{l:"Vibration",v:`${last.vibration_rms?.toFixed(2)} mm/s`},{l:"Sound",v:`${last.sound_db?.toFixed(1)} dB`},{l:"Last seen",v:last.timestamp?.slice(11,19)||"—"}].map(({l,v})=>(
                          <div key={l} style={{padding:"8px 10px",borderRadius:6,background:"#f8f9fa"}}>
                            <div style={{fontSize:10,color:"#adb5bd"}}>{l}</div>
                            <div style={{fontSize:13,fontWeight:700,color:"#212529",marginTop:2}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>)}

          {/* ══ SETTINGS ══ */}
          {page==="settings"&&(<>
            <div style={{fontSize:15,fontWeight:700,marginBottom:20}}>Settings</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
              {[
                {title:"Supabase Connection",items:[{l:"URL",v:SB_URL.replace("https://","").split(".")[0]+"..."},{l:"Status",v:"Connected ✓"},{l:"Realtime",v:"Enabled"}]},
                {title:"Alert Thresholds",items:[{l:"Temp Warning",v:`${TH.temp.w}°C`},{l:"Temp Critical",v:`${TH.temp.c}°C`},{l:"Vibration Warning",v:`${TH.vib.w} mm/s`},{l:"Vibration Critical",v:`${TH.vib.c} mm/s`}]},
                {title:"ML Configuration",items:[{l:"Engine",v:"Rules v1"},{l:"Conditions",v:"5 classes"},{l:"Predictions",v:`${rows.filter(r=>r.ml_predictions?.length).length} total`}]},
                {title:"System Info",items:[{l:"Total Readings",v:rows.length.toString()},{l:"Active Devices",v:devices.length.toString()},{l:"Unacked Alerts",v:(crit+warn).toString()},{l:"Fault Readings",v:faults.toString()}]},
              ].map(({title,items})=>(
                <div key={title} style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"20px 22px"}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:14,paddingBottom:10,borderBottom:"1px solid #f1f5f9"}}>{title}</div>
                  {items.map(({l,v})=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f8f9fa"}}>
                      <span style={{fontSize:12,color:"#6c757d"}}>{l}</span>
                      <span style={{fontSize:12,fontWeight:600,color:"#212529"}}>{v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>)}

        </main>
      </div>
    </div>
  );
}
