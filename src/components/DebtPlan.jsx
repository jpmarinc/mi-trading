import { useState } from "react";
import { usePersist } from "../hooks/usePersist";
import { DEBTS_INIT, SNOWBALL_INIT, PRIORITY_ORDER, PRIORITY_COLOR } from "../constants";

// §DEBT_CALC — Deudas y snowball
// §2.7 inline editing of debts and snowball goals
// §2.8 payment history + undo
// §2.9 display fixes: cuotas mínimas clarification + all debts in projection
export default function DebtPlan({ rValues, accounts }) {
  const [debts, setDebts] = usePersist("debts", DEBTS_INIT);
  const [snow, setSnow]   = usePersist("snowball", SNOWBALL_INIT);
  const [mR, setMR]       = useState(10);
  const [scen, setScen]   = useState("current");
  const [ng, setNg]       = useState({ name:"", cost:"" });

  // §2.7 — editing state
  const [editDebt, setEditDebt]   = useState(null); // {id, field, val}
  const [editSnow, setEditSnow]   = useState(null); // {id, name, cost}
  const [histOpen, setHistOpen]   = useState({}); // {[debtId]: bool}

  const mainAcc = accounts[0];
  const mainR   = rValues[mainAcc?.id || "quantfury"] || 2.65;
  const SCEN = {
    current: { label:"Actual",       r:mainR, desc:`1R=$${mainR.toFixed(2)}` },
    b25:     { label:"Breakout 25k", r:250,   desc:"1R=$250 (1% de $25k)" },
    b50:     { label:"Breakout 50k", r:500,   desc:"1R=$500 (1% de $50k)" },
  };
  const sc = SCEN[scen];

  // §2.9 — income/expenses
  // Los $1517 son gasto recurrente del sueldo, NO reducen la capacidad de pago del trading.
  // Trading income va DIRECTO al principal de deudas por prioridad.
  const CLP_MIN = 1517; // cuota mínima mensual fija (gasto recurrente, referencia solo)
  const tradInc = mR * sc.r;  // ingresos mensuales de trading → van 100% al principal
  const extra   = tradInc;    // todo el trading paga deudas

  // Migrate old debts (no paymentHistory)
  const migratedDebts = debts.map(d => ({ ...d, paymentHistory: d.paymentHistory || [] }));

  const totDebt = migratedDebts.reduce((s, d) => s + d.amount - d.paid, 0);
  const totPaid = migratedDebts.reduce((s, d) => s + d.paid, 0);

  // §2.8 — pay a debt (adds to history)
  const payDebt = (id, amount) => {
    setDebts(p => p.map(d => {
      if (d.id !== id) return d;
      const newPaid = Math.min(d.amount, (d.paid || 0) + amount);
      const hist = d.paymentHistory || [];
      return {
        ...d,
        paid: newPaid,
        paymentHistory: [...hist, { amount, date: new Date().toISOString().split("T")[0], note:"" }]
      };
    }));
  };

  // §2.8 — undo last payment
  const undoPayment = (id) => {
    setDebts(p => p.map(d => {
      if (d.id !== id) return d;
      const hist = [...(d.paymentHistory || [])];
      if (!hist.length) return d;
      const last = hist.pop();
      const newPaid = Math.max(0, (d.paid || 0) - last.amount);
      return { ...d, paid: newPaid, paymentHistory: hist };
    }));
  };

  // §2.7 — save inline debt edit
  const saveDebtEdit = (id) => {
    if (!editDebt || editDebt.id !== id) return;
    setDebts(p => p.map(d => d.id !== id ? d : {
      ...d,
      name:     editDebt.name     || d.name,
      amount:   parseFloat(editDebt.amount) || d.amount,
      priority: editDebt.priority || d.priority,
    }));
    setEditDebt(null);
  };

  // §2.7 — snowball: save inline edit
  const saveSnowEdit = (id) => {
    if (!editSnow || editSnow.id !== id) return;
    setSnow(p => p.map(g => g.id !== id ? g : {
      ...g,
      name: editSnow.name || g.name,
      cost: parseFloat(editSnow.cost) || g.cost,
    }));
    setEditSnow(null);
  };

  // §2.7 — mark snowball goal as completed
  const completeSnow = (id) => {
    setSnow(p => p.map(g => g.id !== id ? g : {
      ...g, completed:true, completedAt:new Date().toISOString()
    }));
  };

  // §2.9 — projection for ALL debts ordered by priority
  const MN = ["Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  // Sort debts by priority for projection
  const sortedDebts = [...migratedDebts].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const activeSnow  = snow.filter(g => !g.completed);
  const doneSnow    = snow.filter(g => g.completed);

  return (
    <div className="page">
      {/* Scenario selector */}
      <div className="card">
        <div className="ct">🔁 Escenario</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
          {Object.entries(SCEN).map(([k, s]) => (
            <button key={k} className={`btn ${scen === k ? "bp" : "bg"} bsm`} onClick={() => setScen(k)}>{s.label}</button>
          ))}
        </div>
        <div className="al ai" style={{ fontSize:10, marginBottom:0 }}>
          <strong>{sc.label}:</strong> {sc.desc} · {mR}R/mes = +${(mR * sc.r).toFixed(0)}/mes
          {scen !== "current" && <><br/>⚠️ IF: asume que pasás la evaluación de la cuenta Breakout.</>}
        </div>
      </div>

      <div className="g2" style={{ marginBottom:12 }}>
        {/* Debts list — §2.7 inline editing, §2.8 payment history */}
        <div className="card">
          <div className="ct">💰 Deudas</div>
          <div className="g2" style={{ marginBottom:9 }}>
            <div className="sb"><div className="lb">Total</div><div className="vl red">${totDebt.toLocaleString()}</div></div>
            <div className="sb"><div className="lb">Pagado</div><div className="vl green">${totPaid.toLocaleString()}</div></div>
          </div>

          {sortedDebts.map(d => {
            const rem = d.amount - d.paid;
            const isEditing = editDebt?.id === d.id;
            const hist = d.paymentHistory || [];
            return (
              <div key={d.id} style={{ marginBottom:12 }}>
                {/* Debt header */}
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:2 }}>
                  {isEditing ? (
                    <div style={{ display:"flex", gap:5, flex:1, flexWrap:"wrap" }}>
                      <input value={editDebt.name} onChange={e => setEditDebt(x => ({ ...x, name:e.target.value }))} style={{ width:120, padding:"2px 5px", fontSize:10 }}/>
                      <input type="number" value={editDebt.amount} onChange={e => setEditDebt(x => ({ ...x, amount:e.target.value }))} style={{ width:80, padding:"2px 5px", fontSize:10 }} placeholder="Monto"/>
                      <select value={editDebt.priority} onChange={e => setEditDebt(x => ({ ...x, priority:e.target.value }))} style={{ fontSize:9, padding:"2px 4px", width:"auto" }}>
                        <option>Muy Alta</option><option>Alta</option><option>Muy Baja</option>
                      </select>
                      <button className="btn bs bxs" onClick={() => saveDebtEdit(d.id)}>✓</button>
                      <button className="btn bg bxs" onClick={() => setEditDebt(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontWeight:600 }}>{d.name}</span>
                      <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                        <span style={{ color:PRIORITY_COLOR[d.priority], fontSize:9 }}>{d.priority}</span>
                        {d.monthlyClp > 0 && <span style={{ color:"#00d4ff", fontSize:9 }}>${(d.monthlyClp/1000).toFixed(0)}k/mes</span>}
                        <span className="grey">${rem.toFixed(0)}</span>
                        {/* §2.7 edit button */}
                        <button
                          className="btn bg bxs"
                          style={{ padding:"1px 5px", fontSize:9 }}
                          onClick={() => setEditDebt({ id:d.id, name:d.name, amount:d.amount, priority:d.priority })}
                        >✏️</button>
                      </div>
                    </>
                  )}
                </div>

                <div className="dbr"><div className="dbrf" style={{ width:`${(d.paid/d.amount)*100}%`, background:PRIORITY_COLOR[d.priority] }}/></div>

                {/* §2.9: show monthly cuota label */}
                {d.monthlyClp > 0 && (
                  <div style={{ fontSize:9, color:"#4a6280", marginTop:2 }}>
                    💼 Cuota mínima fija: ${(d.monthlyClp/1000).toFixed(0)}k CLP/mes (ya pagada con sueldo)
                  </div>
                )}

                {/* Payment row */}
                <div style={{ display:"flex", gap:5, marginTop:4, alignItems:"center" }}>
                  <input type="number" placeholder="Pagar $..." id={`pay-${d.id}`} style={{ fontSize:10, padding:"3px 7px", flex:1 }}/>
                  <button className="btn bs bxs" onClick={() => {
                    const el = document.getElementById(`pay-${d.id}`);
                    const a = parseFloat(el.value);
                    if (a > 0) { payDebt(d.id, a); el.value = ""; }
                  }}>Pagar</button>
                  {/* §2.8 undo */}
                  {hist.length > 0 && (
                    <button className="btn bg bxs" onClick={() => undoPayment(d.id)} title="Deshacer último pago">↩</button>
                  )}
                  {/* §2.8 history toggle */}
                  {hist.length > 0 && (
                    <button className="btn bg bxs" onClick={() => setHistOpen(x => ({ ...x, [d.id]: !x[d.id] }))}>
                      {histOpen[d.id] ? "▲" : "▼"} {hist.length}
                    </button>
                  )}
                </div>

                {/* §2.8 payment history accordion */}
                {histOpen[d.id] && hist.length > 0 && (
                  <div style={{ background:"#070e18", borderRadius:5, padding:"7px 9px", marginTop:5, fontSize:9, color:"#64748b" }}>
                    <div style={{ fontWeight:700, marginBottom:3, color:"#4a6280", textTransform:"uppercase", letterSpacing:1 }}>Historial de pagos</div>
                    {hist.map((p, i) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"2px 0", borderBottom:"1px solid #0f1e2e" }}>
                        <span>{p.date}</span>
                        <span style={{ color:"#22c55e" }}>+${p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:4, color:"#4a6280" }}>Total pagado: <span style={{ color:"#22c55e" }}>${hist.reduce((s, p) => s+p.amount, 0).toFixed(2)}</span></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Proyección */}
        <div className="card">
          <div className="ct">📅 Proyección</div>
          <div className="fi">
            <label>R/mes ({sc.desc})</label>
            <input type="range" min={0} max={scen === "current" ? 60 : 20} value={mR}
              onChange={e => setMR(parseInt(e.target.value))}
              style={{ background:"transparent", border:"none", padding:0, cursor:"pointer" }}/>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#64748b", marginTop:2 }}>
              <span>0R</span>
              <span style={{ color:"#00d4ff", fontWeight:600 }}>{mR}R=+${(mR*sc.r).toFixed(0)}/mes</span>
              <span>{scen === "current" ? 60 : 20}R</span>
            </div>
          </div>

          <div className="rb">
            <div style={{ fontSize:9, color:"#4a6280", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Cómo se calcula</div>
            {[
              { k:`Trading ${mR}R × $${sc.r.toFixed(2)}`,       v:`+$${tradInc.toFixed(0)}/mes`,  c:"green" },
              { k:"→ Pago principal deudas (por prioridad)",     v:`$${extra.toFixed(0)}/mes`,     c:"blue" },
              { k:"Cuotas mínimas fijas (gasto recurrente)",     v:`$${CLP_MIN}/mes`,              c:"orange" },
            ].map((r, i) => (
              <div key={i} className="rr">
                <span className="k" style={{ fontSize:10 }}>{r.k}</span>
                <span className={`v ${r.c}`} style={{ fontSize:10 }}>{r.v}</span>
              </div>
            ))}
          </div>

          <div className="al ai" style={{ marginTop:8, fontSize:10 }}>
            💡 El trading paga el PRINCIPAL de todas las deudas en orden de prioridad.<br/>
            Los ${CLP_MIN}/mes de cuotas son un gasto recurrente del sueldo (no afectan esto).
          </div>
          {extra <= 0 && <div className="al aw" style={{ fontSize:10 }}>⚠️ Con 0R no se abona ningún principal.</div>}
        </div>
      </div>

      {/* §9 — Proyección snowball por prioridad: trading R paga deudas en orden */}
      <div className="card">
        <div className="ct">📊 Proyección snowball ({sc.label})</div>
        <div style={{ fontSize:9, color:"#4a6280", marginBottom:8 }}>
          ${extra.toFixed(0)}/mes del trading se aplica al principal de cada deuda en orden de prioridad.
        </div>
        {extra <= 0 ? (
          <div className="al aw" style={{ fontSize:10 }}>⚠️ Con 0R no se abona ningún principal.</div>
        ) : (() => {
          // Snowball: pagar deudas en orden de prioridad una a una
          const balances = sortedDebts
            .map(d => ({ ...d, rem: Math.max(0, d.amount - d.paid) }))
            .filter(d => d.rem > 0);

          if (balances.length === 0)
            return <div className="al aok" style={{ fontSize:10 }}>✅ Sin deudas pendientes</div>;

          const totalDebt = balances.reduce((s, d) => s + d.rem, 0);
          // Calcular cuántos meses tarda cada deuda (snowball)
          const timeline = [];
          let remaining = balances.map(d => ({ ...d }));
          let month = 0;
          const startDate = new Date(2026, 2); // Marzo 2026
          const MAX_MONTHS = 120;

          while (remaining.some(d => d.rem > 0) && month < MAX_MONTHS) {
            let budget = extra;
            const snap = remaining.map(d => ({ ...d }));
            for (let i = 0; i < remaining.length; i++) {
              if (remaining[i].rem <= 0) continue;
              const pay = Math.min(remaining[i].rem, budget);
              remaining[i] = { ...remaining[i], rem: remaining[i].rem - pay };
              budget -= pay;
              if (budget <= 0) break;
            }
            const d = new Date(startDate.getFullYear(), startDate.getMonth() + month);
            const label = d.toLocaleDateString("es-CL", { month:"short", year:"2-digit" });
            timeline.push({ label, remaining: remaining.map(d => ({ ...d })) });
            month++;
            if (remaining.every(r => r.rem <= 0)) break;
          }

          const totalMonths = timeline.length;
          const doneAt = totalMonths <= MAX_MONTHS
            ? timeline[totalMonths - 1]?.label
            : "más de 10 años";

          return (
            <>
              {/* Resumen por deuda */}
              {balances.map(d => {
                // Cuándo se paga esta deuda en el snowball
                const paidMonth = timeline.findIndex(t => {
                  const r = t.remaining.find(x => x.id === d.id);
                  return r && r.rem <= 0;
                });
                const paidLabel = paidMonth >= 0 ? timeline[paidMonth].label : "∞";
                return (
                  <div key={d.id} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                      <div>
                        <span style={{ fontWeight:600 }}>{d.name}</span>
                        <span style={{ color:PRIORITY_COLOR[d.priority], fontSize:8, marginLeft:6 }}>{d.priority}</span>
                        {d.monthlyClp > 0 && <span style={{ color:"#00d4ff", fontSize:8, marginLeft:6 }}>cuota: ${(d.monthlyClp/1000).toFixed(0)}k CLP/mes</span>}
                      </div>
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <span className="grey">${d.rem.toFixed(0)}</span>
                        <span style={{ fontSize:9, color: paidMonth >= 0 ? "#22c55e" : "#4a6280" }}>
                          {paidMonth >= 0 ? `✅ ${paidLabel}` : `∞ (necesitás más R)`}
                        </span>
                      </div>
                    </div>
                    <div className="dbr">
                      <div className="dbrf" style={{ width:`${Math.min(100,(d.paid/d.amount)*100)}%`, background:PRIORITY_COLOR[d.priority] }}/>
                    </div>
                  </div>
                );
              })}

              {/* Resumen global */}
              <div className="al aok" style={{ fontSize:10, marginTop:8 }}>
                {totalMonths < MAX_MONTHS
                  ? `🏁 Todas las deudas saldadas en ${totalMonths} mes${totalMonths !== 1 ? "es" : ""} → ${doneAt}`
                  : "⚠️ Con este R el pago tarda más de 10 años"}
              </div>

              {/* Timeline mes a mes (primeros 24 meses o hasta saldo) */}
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:9, color:"#4a6280", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
                  Proyección mensual
                </div>
                {timeline.slice(0, 24).map((t, i) => {
                  const totalRem = t.remaining.reduce((s, d) => s + d.rem, 0);
                  const pct = Math.min(100, ((totalDebt - totalRem) / totalDebt) * 100);
                  const paid = i === 0
                    ? Math.min(totalDebt, extra)
                    : Math.min(timeline[i-1].remaining.reduce((s,d)=>s+d.rem,0), extra);
                  return (
                    <div key={i} className="mr">
                      <span style={{ width:55, color:"#64748b", fontSize:9 }}>{t.label}</span>
                      <div style={{ flex:1, height:5, background:"#1e2d3d", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:3, background:"linear-gradient(90deg,#22c55e,#00d4ff)", width:`${pct}%` }}/>
                      </div>
                      <span style={{ width:55, textAlign:"right", fontSize:9 }}>-${Math.min(totalDebt, extra).toFixed(0)}</span>
                      <span style={{ width:75, textAlign:"right", color:"#4a6280", fontSize:9 }}>${totalRem.toFixed(0)} restante</span>
                      <span style={{ width:60, textAlign:"right", fontSize:9, color: totalRem <= 0 ? "#22c55e" : "#4a6280" }}>
                        {totalRem <= 0 ? "✅ Listo" : ""}
                      </span>
                    </div>
                  );
                })}
                {timeline.length > 24 && (
                  <div style={{ fontSize:9, color:"#4a6280", marginTop:4 }}>
                    … y {timeline.length - 24} mes{timeline.length - 24 !== 1 ? "es" : ""} más hasta saldar todo.
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* §2.7 Snowball goals with inline editing and completion */}
      <div className="card">
        <div className="ct">🎯 Snowball — Metas Cortoplazistas</div>
        <div className="al aok" style={{ fontSize:10, marginBottom:10 }}>
          1R ({sc.label}) = ${sc.r.toFixed(2)} — conectá ganancias a metas reales
        </div>

        {/* Active goals */}
        {activeSnow.map(g => {
          const rN = (g.cost / sc.r).toFixed(1);
          const isEditingSnow = editSnow?.id === g.id;
          return (
            <div key={g.id} className="snow">
              {isEditingSnow ? (
                <div style={{ display:"flex", gap:5, alignItems:"center", flexWrap:"wrap" }}>
                  <input value={editSnow.name} onChange={e => setEditSnow(x => ({ ...x, name:e.target.value }))} style={{ flex:2, padding:"3px 6px", fontSize:11 }}/>
                  <input type="number" value={editSnow.cost} onChange={e => setEditSnow(x => ({ ...x, cost:e.target.value }))} style={{ width:80, padding:"3px 6px", fontSize:11 }} placeholder="USD"/>
                  <button className="btn bs bxs" onClick={() => saveSnowEdit(g.id)}>✓</button>
                  <button className="btn bg bxs" onClick={() => setEditSnow(null)}>✕</button>
                </div>
              ) : (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontWeight:600, fontSize:11 }}>{g.name}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#00d4ff", fontFamily:"'Syne',sans-serif" }}>{rN}R</div>
                      <div style={{ fontSize:9, color:"#64748b" }}>${g.cost}</div>
                    </div>
                    {/* §2.7 edit */}
                    <button className="btn bg bxs" style={{ padding:"2px 5px", fontSize:9 }}
                      onClick={() => setEditSnow({ id:g.id, name:g.name, cost:g.cost })}>✏️</button>
                    {/* §2.7 complete */}
                    <button className="btn bs bxs" style={{ padding:"2px 5px", fontSize:9 }}
                      onClick={() => completeSnow(g.id)} title="Marcar como cumplida">✅</button>
                    <button className="btn bd bxs" onClick={() => setSnow(p => p.filter(x => x.id !== g.id))}>✕</button>
                  </div>
                </div>
              )}
              <div style={{ fontSize:9, color:"#4a6280", marginTop:3 }}>
                {scen === "current"
                  ? `Con trades controlados + SL → ${Math.ceil(rN)} wins necesarios`
                  : `Cuenta breakout: solo ${Math.ceil(rN)} R`}
              </div>
            </div>
          );
        })}

        {/* §2.7 completed goals at bottom with strikethrough */}
        {doneSnow.length > 0 && (
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:9, color:"#4a6280", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>Metas cumplidas ✅</div>
            {doneSnow.map(g => (
              <div key={g.id} className="snow" style={{ opacity:0.5 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ textDecoration:"line-through", fontSize:11 }}>{g.name}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ color:"#22c55e", fontSize:9 }}>✅ {g.completedAt?.split("T")[0]}</span>
                    <button className="btn bg bxs" onClick={() => setSnow(p => p.filter(x => x.id !== g.id))}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new goal */}
        <div className="g3" style={{ marginTop:9 }}>
          <div className="fi"><label>Meta</label><input placeholder="Salida, zapatillas..." value={ng.name} onChange={e => setNg(x => ({ ...x, name:e.target.value }))}/></div>
          <div className="fi"><label>Costo (USD)</label><input type="number" placeholder="$60..." value={ng.cost} onChange={e => setNg(x => ({ ...x, cost:e.target.value }))}/></div>
          <div className="fi"><label>&nbsp;</label>
            <button className="btn bp" style={{ width:"100%" }} onClick={() => {
              if (ng.name && ng.cost) {
                setSnow(p => [...p, { id:Date.now(), name:ng.name, cost:parseFloat(ng.cost), completed:false, completedAt:null }]);
                setNg({ name:"", cost:"" });
              }
            }}>+ Agregar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
