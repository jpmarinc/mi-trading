import { useState } from "react";

// §PERF_CHART — internal component
function PerfChart({ trades, rValue }) {
  const [hov, setHov] = useState(null);
  if (!trades.length) return <div style={{ color:"#4a6280", textAlign:"center", padding:"40px 0", fontSize:11 }}>Sin trades</div>;
  let cum = 0;
  const pts = trades.map((t, i) => { const r = (t.pnl || 0) / rValue; cum += r; return { i, t, r:cum, delta:r }; });
  const all = [{ i:-1, t:null, r:0, delta:0 }, ...pts];
  const W=700, H=180, PL=52, PR=20, PT=18, PB=30, cW=W-PL-PR, cH=H-PT-PB;
  const minR=Math.min(0,...pts.map(p=>p.r)), maxR=Math.max(0,...pts.map(p=>p.r)), range=(maxR-minR)||1;
  const xS = i => PL + ((i+1)/(all.length-1||1))*cW;
  const yS = r => PT + (1-(r-minR)/range)*cH;
  const zY = yS(0);
  const ld = all.map((p, i) => `${i===0?"M":"L"} ${xS(p.i)} ${yS(p.r)}`).join(" ");
  const ad = ld + ` L ${xS(all[all.length-1].i)} ${zY} L ${xS(all[0].i)} ${zY} Z`;
  const step = range>8?4:range>4?2:1;
  const ticks = [];
  for (let v=Math.ceil(minR/step)*step; v<=Math.ceil(maxR/step)*step; v+=step) {
    if (v>=minR-0.5 && v<=maxR+0.5) ticks.push(v);
  }
  return (
    <div style={{ position:"relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", overflow:"visible" }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={PL-4} y1={yS(v)} x2={W-PR} y2={yS(v)} stroke={v===0?"#2e4060":"#1e2d3d"} strokeWidth={v===0?"1.5":"1"} strokeDasharray={v===0?"":"3,4"}/>
            <text x={PL-6} y={yS(v)+3} textAnchor="end" fill="#4a6280" fontSize="9">{v.toFixed(0)}R</text>
          </g>
        ))}
        <defs>
          <clipPath id="abv"><rect x={PL} y={PT} width={cW} height={Math.max(0,zY-PT)}/></clipPath>
          <clipPath id="blw"><rect x={PL} y={zY} width={cW} height={H-zY}/></clipPath>
        </defs>
        <path d={ad} fill="#22c55e0a" clipPath="url(#abv)"/>
        <path d={ad} fill="#ef44440a" clipPath="url(#blw)"/>
        <path d={ld} fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinejoin="round"/>
        {pts.map((p, i) => (
          <circle
            key={i} cx={xS(p.i)} cy={yS(p.r)} r={hov===i?5:3}
            fill={p.delta>=0?"#22c55e":"#ef4444"} stroke="#080c10" strokeWidth="1.5"
            style={{ cursor:"pointer" }}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
          />
        ))}
        {pts.filter((_, i) => i===0 || i===pts.length-1 || (pts.length>5 && i%(Math.ceil(pts.length/4))===0)).map((p, i) => (
          <text key={i} x={xS(p.i)} y={H-4} textAnchor="middle" fill="#4a6280" fontSize="8">
            {p.t?.date ? p.t.date.slice(5) : `T${p.i+1}`}
          </text>
        ))}
      </svg>
      {hov !== null && pts[hov] && (
        <div style={{ position:"absolute", top:0, right:0, background:"#0d1520", border:"1px solid #1e2d3d", borderRadius:7, padding:"7px 10px", fontSize:10, minWidth:130, pointerEvents:"none" }}>
          <div style={{ fontWeight:700, color:pts[hov].delta>=0?"#22c55e":"#ef4444", marginBottom:2 }}>{pts[hov].delta>=0?"+":""}{pts[hov].delta.toFixed(2)}R (${pts[hov].t?.pnl?.toFixed(2)})</div>
          <div style={{ color:"#94a3b8" }}>{pts[hov].t?.asset} {pts[hov].t?.type}</div>
          <div style={{ color:"#64748b" }}>{pts[hov].t?.date}</div>
          <div style={{ color:"#64748b", marginTop:1 }}>Acum: {pts[hov].r.toFixed(2)}R</div>
        </div>
      )}
    </div>
  );
}

export default function PerformanceTab({ closedTrades, rValues, accounts }) {
  const [period, setPeriod] = useState("all");
  const [acctFilter, setAcctFilter] = useState("all");
  const now = new Date();
  const filtered = closedTrades.filter(t => {
    if (acctFilter !== "all" && t.account !== acctFilter) return false;
    if (period === "all") return true;
    const d = new Date(t.date || "2026-01-01");
    return (now - d) / (1000*60*60*24) <= (period === "7d" ? 7 : 30);
  });

  const rVal = acctFilter === "all" ? (rValues[accounts[0]?.id] || 2.65) : (rValues[acctFilter] || 2.65);
  const totalPnl = filtered.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalR   = totalPnl / rVal;
  let wins=0, losses=0, be=0;
  filtered.forEach(t => {
    const o = t.outcome || "";
    if (o === "WIN" || o === "Partial W") wins++;
    else if (o === "BE") be++;
    else losses++;
  });
  const wr = filtered.length ? (wins / filtered.length * 100).toFixed(1) : 0;
  const longs  = filtered.filter(t => t.type === "Long").length;
  const shorts  = filtered.filter(t => t.type === "Short").length;
  const mkts   = filtered.filter(t => !t.orderType || t.orderType === "Market").length;
  const lims   = filtered.filter(t => t.orderType === "Limit").length;
  const wt = filtered.filter(t => t.pnl > 0);
  const lt = filtered.filter(t => t.pnl < 0);
  const avgW = wt.length ? (wt.reduce((s, t) => s + t.pnl, 0) / wt.length / rVal).toFixed(2) : 0;
  const avgL = lt.length ? (lt.reduce((s, t) => s + t.pnl, 0) / lt.length / rVal).toFixed(2) : 0;
  const best  = filtered.length ? (Math.max(...filtered.map(t => t.pnl || 0)) / rVal).toFixed(2) : 0;
  const worst = filtered.length ? (Math.min(...filtered.map(t => t.pnl || 0)) / rVal).toFixed(2) : 0;

  const RatioBar = ({ a, b, cA, cB, lA, lB }) => {
    const tot = a + b || 1;
    const pA  = (a / tot * 100).toFixed(1);
    const pB  = (b / tot * 100).toFixed(1);
    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, marginBottom:3 }}>
          <span style={{ color:cA }}>{lA} {pA}% ({a})</span>
          <span style={{ color:cB }}>{lB} {pB}% ({b})</span>
        </div>
        <div className="ratiob">
          <div className="ratios" style={{ width:`${pA}%`, background:cA }}/>
          <div className="ratios" style={{ width:`${pB}%`, background:cB }}/>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        {[["all","Todo"],["30d","30 días"],["7d","7 días"]].map(([v, l]) => (
          <button key={v} className={`btn ${period === v ? "bp" : "bg"} bsm`} onClick={() => setPeriod(v)}>{l}</button>
        ))}
        <div className="sep" style={{ height:20 }}/>
        <select value={acctFilter} onChange={e => setAcctFilter(e.target.value)} style={{ width:"auto", padding:"4px 8px", fontSize:10 }}>
          <option value="all">Todas las cuentas</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div style={{ marginLeft:"auto", fontSize:10, color:"#4a6280" }}>{filtered.length} trades · 1R = ${rVal.toFixed(2)}</div>
      </div>

      <div style={{ textAlign:"center", marginBottom:14 }}>
        <div style={{ fontSize:10, color:"#4a6280", textTransform:"uppercase", letterSpacing:2, marginBottom:3 }}>Resultado acumulado</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:34, fontWeight:800, color:totalR >= 0 ? "#22c55e" : "#ef4444" }}>
          {totalR >= 0 ? "+" : ""}{totalR.toFixed(2)}R
        </div>
        <div style={{ fontSize:11, color:"#64748b" }}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USD · {filtered.length} ops</div>
      </div>

      <div className="card">
        <div className="ct">📈 Curva de Capital (R acumulado)</div>
        <PerfChart trades={[...filtered].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))} rValue={rVal}/>
      </div>

      <div className="g4" style={{ marginBottom:12 }}>
        {[
          { l:"Win Rate", v:`${wr}%`,                             s:`${wins}W/${losses}L/${be}BE`, c:parseFloat(wr) >= 50 ? "green" : "red" },
          { l:"Avg Win",  v:`+${avgW}R`,                          s:`${wt.length} ganados`, c:"green" },
          { l:"Avg Loss", v:`${avgL}R`,                           s:`${lt.length} perdidos`, c:"red" },
          { l:"Best/Worst",v:<><span className="green">+{best}R</span>/<span className="red">{worst}R</span></>, s:"mejor / peor", c:"" },
        ].map((s, i) => (
          <div key={i} className="pstat">
            <div className="psl">{s.l}</div>
            <div className={`psv ${s.c}`}>{s.v}</div>
            <div className="pss">{s.s}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="ct">Ratios</div>
        <div className="g3">
          <div><div style={{ fontSize:9, color:"#4a6280", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Long / Short</div><RatioBar a={longs} b={shorts} cA="#22c55e" cB="#ef4444" lA="Longs" lB="Shorts"/></div>
          <div><div style={{ fontSize:9, color:"#4a6280", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Market / Limit</div><RatioBar a={mkts} b={lims} cA="#00d4ff" cB="#f0b90b" lA="Market" lB="Limit"/></div>
          <div><div style={{ fontSize:9, color:"#4a6280", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Win / Loss</div><RatioBar a={wins} b={losses} cA="#22c55e" cB="#ef4444" lA="Wins" lB="Losses"/></div>
        </div>
      </div>
    </div>
  );
}
