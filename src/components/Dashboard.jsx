import { useState } from "react";
import LivePositions from "./LivePositions";
import RulesSidebar from "./RulesSidebar";

// §2.6 — inline form to complete anomaly trade
function AnomalyCompleteForm({ trade, onSave, onCancel }) {
  const [vals, setVals] = useState({
    asset:    trade.asset    || "",
    account:  trade.account  || "",
    date:     trade.date     || "",
    pnl:      trade.pnl      ?? "",
    type:     trade.type     || "Long",
    outcome:  trade.outcome  || "WIN",
    source:   trade.source   || "YO",
  });
  const missing = trade.missingFields || [];
  const inp = (k) => ({
    style: { borderColor: missing.includes(k) ? "#ef4444" : undefined, width:"100%" },
  });

  return (
    <div style={{ background:"#0d1520", border:"1px solid #f9731633", borderRadius:7, padding:12, marginTop:6 }}>
      <div style={{ fontSize:10, color:"#fdba74", marginBottom:8 }}>⚠️ Completar campos faltantes</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
        <div className="fi"><label style={{ color: missing.includes("asset") ? "#ef4444" : undefined }}>Asset</label><input value={vals.asset} onChange={e => setVals(x=>({...x,asset:e.target.value.toUpperCase()}))} {...inp("asset")}/></div>
        <div className="fi"><label style={{ color: missing.includes("type") ? "#ef4444" : undefined }}>Tipo</label><select value={vals.type} onChange={e => setVals(x=>({...x,type:e.target.value}))} style={{ width:"100%" }}><option>Long</option><option>Short</option></select></div>
        <div className="fi"><label style={{ color: missing.includes("account") ? "#ef4444" : undefined }}>Cuenta</label><input value={vals.account} onChange={e => setVals(x=>({...x,account:e.target.value}))} {...inp("account")}/></div>
        <div className="fi"><label style={{ color: missing.includes("date") ? "#ef4444" : undefined }}>Fecha</label><input type="date" value={vals.date} onChange={e => setVals(x=>({...x,date:e.target.value}))} {...inp("date")}/></div>
        <div className="fi"><label style={{ color: missing.includes("pnl") ? "#ef4444" : undefined }}>P&amp;L ($)</label><input type="number" value={vals.pnl} onChange={e => setVals(x=>({...x,pnl:e.target.value}))} {...inp("pnl")}/></div>
        <div className="fi"><label style={{ color: missing.includes("outcome") ? "#ef4444" : undefined }}>Outcome</label><select value={vals.outcome} onChange={e => setVals(x=>({...x,outcome:e.target.value}))} style={{ width:"100%" }}><option>WIN</option><option>LOSS</option><option>BE</option><option>Partial W</option><option>Partial L</option></select></div>
        <div className="fi"><label style={{ color: missing.includes("source") ? "#ef4444" : undefined }}>Fuente</label><select value={vals.source} onChange={e => setVals(x=>({...x,source:e.target.value}))} style={{ width:"100%" }}><option>YO</option><option>Chroma</option><option>Silla</option><option>Mizer</option><option>Otro</option></select></div>
      </div>
      <div style={{ display:"flex", gap:6, marginTop:8 }}>
        <button className="btn bs bsm" onClick={() => onSave({ ...trade, ...vals, pnl:parseFloat(vals.pnl)||0, anomaly:false, missingFields:[] })}>✅ Guardar</button>
        <button className="btn bg bsm" onClick={onCancel}>✕ Cancelar</button>
      </div>
    </div>
  );
}

// §5 — calcular uPnL live (mismo algoritmo que LivePositions)
function calcLiveUpnlDash(pos, lp) {
  if (pos.orderType === "Limit") return null;
  if (!lp || !pos.entry) return null;
  const notional =
    pos.size  > 0 ? pos.size :
    pos.qty   > 0 ? pos.qty * pos.entry :
    pos.margin > 0 ? pos.margin * (pos.leverage || 1) :
    null;
  if (!notional) return null;
  const pctMove = (lp - pos.entry) / pos.entry;
  return notional * pctMove * (pos.type === "Long" ? 1 : -1);
}

export default function Dashboard({ closedTrades, dbTrades = [], openPositions, setOpenPositions, accounts, prices, onUpdate, onClose, onSyncBinance, syncing }) {
  const [editingId, setEditingId] = useState(null);

  // Merge localStorage + BD para PnL histórico real (mismo criterio que PerformanceTab)
  const localIds  = new Set(closedTrades.map(t => t.id).filter(Boolean));
  const dbOnly    = (dbTrades || []).filter(t => !t.local_id || !localIds.has(Number(t.local_id)));
  const allClosed = [...closedTrades, ...dbOnly];

  const pnl = allClosed.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
  const w   = allClosed.filter(t => t.outcome === "WIN").length;
  const l   = allClosed.filter(t => ["LOSS","Partial L"].includes(t.outcome)).length;
  const anomalies = closedTrades.filter(t => t.anomaly);

  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  // §5 — uPnL live usando precio real (incluye size para Quantfury)
  const totalLiveUpnl = openPositions.reduce((s, p) => {
    const lp   = prices[p.asset]?.price;
    const live = calcLiveUpnlDash(p, lp);
    return s + (live !== null ? live : (p.upnl || 0));
  }, 0);
  const effectiveBalance = totalBalance + totalLiveUpnl;
  const wr = allClosed.length > 0 ? ((w / allClosed.length) * 100).toFixed(0) : 0;

  const exp = () => {
    const r = [
      ["Date","Asset","Tipo","Cuenta","Entry","SL","TP","Lev","OrderType","Outcome","P&L","Fuente","Reasoning"],
      ...closedTrades.map(t => [t.date||"",t.asset,t.type,t.account,t.entry||"",t.sl||"",t.tp||"",t.leverage,t.orderType||"Market",t.outcome,t.pnl,t.source,t.reasoning])
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.map(x => x.join(",")).join("\n")], { type:"text/csv" }));
    a.download = `trades_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="page">
      {openPositions.some(p => !p.sl) && (
        <div className="wb">
          ⚠️ <strong style={{ color:"#ef4444" }}>CRÍTICO</strong> — Posición sin SL.{" "}
          {openPositions.filter(p => !p.sl).map(p => (
            <span key={p.id}>
              {p.asset} Live: <span style={{ color:"#00d4ff" }}>
                {prices[p.asset] ? `$${prices[p.asset].price.toFixed(2)}` : "cargando..."}
              </span>{" "}
            </span>
          ))}
        </div>
      )}

      {/* §2.6 — anomaly alert */}
      {anomalies.length > 0 && (
        <div className="al aw" style={{ marginBottom:10 }}>
          ⚠️ <strong>{anomalies.length} trade{anomalies.length > 1 ? "s" : ""} con anomalía</strong> — datos incompletos. Completá desde la tabla abajo.
        </div>
      )}

      {/* §5 — stats con balance efectivo (base + uPnL live) */}
      <div className="g4" style={{ marginBottom:12 }}>
        {[
          {
            l:"Balance Efectivo",
            v:`$${effectiveBalance.toFixed(2)}`,
            s:`base $${totalBalance.toFixed(2)} ${totalLiveUpnl >= 0 ? "+" : ""}${totalLiveUpnl.toFixed(2)} uPnL`,
            c: effectiveBalance > 0 ? "green" : "red"
          },
          {
            l:"uPnL Abierto",
            v:`${totalLiveUpnl >= 0 ? "+" : ""}$${totalLiveUpnl.toFixed(2)}`,
            s:`${openPositions.length} pos abiertas`,
            c: totalLiveUpnl >= 0 ? "green" : "red"
          },
          {
            l:"P&L Cerradas",
            v:`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
            s:`${allClosed.length} ops`,
            c: pnl >= 0 ? "green" : "red"
          },
          {
            l:"Win Rate",
            v:`${wr}%`,
            s:`${w}W / ${l}L`,
            c: parseInt(wr) >= 50 ? "green" : "red"
          },
        ].map((s, i) => (
          <div key={i} className="sb">
            <div className="lb">{s.l}</div>
            <div className={`vl ${s.c}`}>{s.v}</div>
            <div className="su">{s.s}</div>
          </div>
        ))}
      </div>

      <div className="gdash">
        <div>
          <LivePositions
            positions={openPositions}
            setPositions={setOpenPositions}
            accounts={accounts}
            prices={prices}
            onClose={onClose}
            onSyncBinance={onSyncBinance}
            syncing={syncing}
          />

          <div className="card">
            <div className="ct">
              <span>📋 Historial ({closedTrades.length}){anomalies.length > 0 && <span className="bc-yellow" style={{ background:"#f97316", color:"#fff", borderRadius:7, fontSize:8, padding:"1px 4px", marginLeft:5 }}>{anomalies.length} ⚠️</span>}</span>
              <button className="btn bg bxs" onClick={exp}>⬇ CSV</button>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Asset</th><th>Tipo</th><th>Orden</th>
                    <th>SL</th><th>Resultado</th><th>P&L</th><th>Fuente</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map(t => (
                    <>
                      <tr key={t.id} className={t.anomaly ? "anomaly-row" : ""}>
                        <td className="grey">{t.date||"-"}</td>
                        <td style={{ fontWeight:600 }}>
                          {t.anomaly && <span title="Datos incompletos" style={{ marginRight:4 }}>⚠️</span>}
                          {t.asset}
                        </td>
                        <td><span className={`badge ${t.type==="Short"?"bsh":"blo"}`}>{t.type}</span></td>
                        <td>
                          <span className="badge" style={{
                            background:t.orderType==="Limit"?"#f0b90b20":"#00d4ff15",
                            color:t.orderType==="Limit"?"#f0b90b":"#00d4ff",
                            border:`1px solid ${t.orderType==="Limit"?"#f0b90b40":"#00d4ff30"}`
                          }}>{t.orderType||"Market"}</span>
                        </td>
                        <td>{t.sl ? <span className="red">{t.sl}</span> : <span style={{ color:"#ef444488", fontSize:9 }}>❌</span>}</td>
                        <td><span className={`badge ${t.outcome==="WIN"?"bw":t.outcome==="BE"?"bbe":t.outcome?.includes("Partial")?"bpa":"bl"}`}>{t.outcome}</span></td>
                        <td className={t.pnl >= 0 ? "green" : "red"} style={{ fontWeight:600 }}>{t.pnl >= 0 ? "+" : ""}{t.pnl?.toFixed(2)}</td>
                        <td className="grey">{t.source}</td>
                        <td>
                          {t.anomaly && (
                            <button
                              className="btn bxs"
                              style={{ background:"#f9731620", color:"#f97316", border:"1px solid #f9731640", padding:"2px 6px", fontSize:9 }}
                              onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                            >
                              {editingId === t.id ? "✕" : "Completar"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {editingId === t.id && (
                        <tr key={`edit-${t.id}`}>
                          <td colSpan={9} style={{ padding:"0 4px 8px" }}>
                            <AnomalyCompleteForm
                              trade={t}
                              onSave={updated => { onUpdate(updated); setEditingId(null); }}
                              onCancel={() => setEditingId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <RulesSidebar closedTrades={closedTrades}/>
      </div>
    </div>
  );
}
