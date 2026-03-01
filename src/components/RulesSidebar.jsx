export default function RulesSidebar({ closedTrades }) {
  const l = closedTrades.filter(t => t.pnl < 0).length;
  const rem = Math.max(0, 3 - l);
  return (
    <div>
      <div className="card">
        <div className="ct">🔴 Reglas</div>
        {[
          { r:"R real: $2.65 (5%). No $35 hasta $350+", u:true },
          { r:"JAMÁS entrar sin SL", u:true },
          { r:`Circuit: máx 3 pérd/día (quedan ${rem})`, u:l >= 2 },
          { r:"Máx 3 posiciones simultáneas", u:false },
          { r:"Señal externa → confluencia propia", u:false },
        ].map((r, i) => (
          <div key={i} style={{ display:"flex", gap:6, padding:"4px 0", borderBottom:"1px solid #0f1e2e" }}>
            <span style={{ color:r.u?"#ef4444":"#f97316", fontSize:11 }}>{r.u?"🚨":"📌"}</span>
            <span style={{ fontSize:10, color:r.u?"#fca5a5":"#94a3b8", lineHeight:1.5 }}>{r.r}</span>
          </div>
        ))}
        <div style={{ marginTop:8, background:"#070e18", borderRadius:6, padding:"8px 10px" }}>
          <div style={{ fontSize:8, color:"#4a6280", marginBottom:4 }}>CIRCUIT BREAKER</div>
          <div style={{ display:"flex", gap:3, marginBottom:4 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ flex:1, height:5, borderRadius:2, background:i < l ? "#ef4444" : "#1e2d3d" }}/>
            ))}
          </div>
          <div style={{ fontSize:9, color:l >= 3 ? "#ef4444" : "#4a6280" }}>
            {l >= 3 ? "🛑 STOP" : `${rem} restante${rem !== 1 ? "s" : ""}`}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="ct">📈 Stats</div>
        {[
          { k:"Capital QF", v:"$57.67", c:"red" },
          { k:"Binance",    v:"$170.00", c:"yellow" },
          { k:"1R actual",  v:"$2.65", c:"orange" },
          { k:"1R objetivo",v:"$35", c:"grey" },
        ].map((r, i) => (
          <div key={i} className="rr">
            <span className="k">{r.k}</span>
            <span className={`v ${r.c}`}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
