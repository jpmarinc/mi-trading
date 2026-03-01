import { RISK_COLORS, PROXY } from "../constants";

function calcLiqRisk(pos) {
  if (!pos.sl) return { level:"critical", pct:100, label:"SIN SL — RIESGO MÁXIMO" };
  const d = Math.abs((pos.sl - pos.entry) / pos.entry) * 100 * (pos.leverage || 1);
  if (d > 80) return { level:"critical", pct:d, label:"Riesgo ALTO" };
  if (d > 40) return { level:"high",     pct:d, label:"Riesgo Elevado" };
  if (d > 20) return { level:"medium",   pct:d, label:"Riesgo Moderado" };
  return             { level:"low",      pct:d, label:"Riesgo Controlado" };
}

// §6 — uPnL en tiempo real
// Prioridad de notional: size (Quantfury trading power) > qty*entry (Binance/HL) > margin*leverage
// §4 — Las órdenes Limit pendientes NO tienen uPnL hasta que se ejecutan
function calcLiveUpnl(pos, lp) {
  if (pos.orderType === "Limit") return null;  // §4: sin uPnL hasta que se ejecute
  if (!lp || !pos.entry) return null;
  const notional =
    pos.size  > 0 ? pos.size :                              // §7: Quantfury trading power
    pos.qty   > 0 ? pos.qty * pos.entry :                   // Binance/HL por contratos
    pos.margin > 0 ? pos.margin * (pos.leverage || 1) :     // fallback margin × lev
    null;
  if (!notional) return null;
  const pctMove = (lp - pos.entry) / pos.entry;
  return notional * pctMove * (pos.type === "Long" ? 1 : -1);
}

// Cancelar orden LIMIT pendiente en Binance
async function cancelBinanceOrder(acc, pos, setPositions) {
  if (!acc?.apiKey || !acc?.apiSecret || !pos.bnOrderId) return;
  const symbol = pos.asset.toUpperCase() + (pos.asset.toUpperCase().endsWith("USDT") ? "" : "USDT");
  try {
    const r = await fetch(`${PROXY}/api/binance/futures/cancelOrder`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret, symbol, orderId: parseInt(pos.bnOrderId) }),
      signal: AbortSignal.timeout(10000)
    });
    const d = await r.json();
    if (d.ok) setPositions(p => p.filter(x => x.id !== pos.id));
    else alert(`Error cancelando orden Binance: ${d.msg}`);
  } catch(e) { alert(`Error: ${e.message}`); }
}

// §3 — Cerrar posición ACTIVA en Binance (reduceOnly market order)
// Solo aplica para posiciones con bnPositionKey (ya ejecutadas)
async function closeBinancePosition(acc, pos, onClose, setPositions) {
  if (!acc?.apiKey || !acc?.apiSecret) { alert("Esta cuenta no tiene API key configurada"); return; }
  if (!pos.qty || pos.qty <= 0) { alert("Error: cantidad de posición no disponible (qty = 0)"); return; }
  const symbol    = pos.asset.toUpperCase().endsWith("USDT") ? pos.asset.toUpperCase() : pos.asset.toUpperCase() + "USDT";
  const closeSide = pos.type === "Long" ? "SELL" : "BUY";
  try {
    const r = await fetch(`${PROXY}/api/binance/futures/closePosition`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret, symbol, side: closeSide, qty: pos.qty }),
      signal: AbortSignal.timeout(12000)
    });
    const d = await r.json();
    if (d.ok) {
      // Solo llama onClose (que persiste + envía Telegram) DESPUÉS que Binance confirma
      if (onClose) onClose(pos, d.pnl);
      else setPositions(prev => prev.filter(x => x.id !== pos.id));
    } else {
      alert(`Error cerrando posición en Binance: ${d.msg}`);
    }
  } catch(e) { alert(`Error de red: ${e.message}`); }
}

export default function LivePositions({ positions, setPositions, accounts, prices, onClose, onSyncBinance, syncing }) {
  const upd = (id, f, v) => setPositions(p => p.map(x => x.id === id ? { ...x, [f]: v === "" ? null : parseFloat(v) || null } : x));

  const displayUpnl = (pos, lp) => {
    const live = calcLiveUpnl(pos, lp);
    return live !== null ? live : (pos.upnl || 0);
  };

  const total = positions.reduce((s, pos) => {
    const lp = prices[pos.asset]?.price;
    return s + displayUpnl(pos, lp);
  }, 0);

  if (!positions.length) return (
    <div className="card">
      <div className="ct">
        <span><span className="ld"/>Posiciones Abiertas</span>
        {onSyncBinance && (
          <button className="btn bpu bxs" onClick={onSyncBinance} disabled={syncing} title="Importar órdenes abiertas desde Binance Futures">
            {syncing ? <span className="spin">⟳</span> : "🔄"} {syncing ? "..." : "Sync Binance"}
          </button>
        )}
      </div>
      <div style={{ textAlign:"center", color:"#4a6280", padding:"24px 0", fontSize:11 }}>Sin posiciones</div>
    </div>
  );

  return (
    <div className="card">
      <div className="ct">
        <span><span className="ld"/>Abiertas ({positions.length})</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ color: total >= 0 ? "#22c55e" : "#ef4444", fontSize:12 }}>
            uPnL {total >= 0 ? "+" : ""}${total.toFixed(2)}
          </span>
          {onSyncBinance && (
            <button className="btn bpu bxs" onClick={onSyncBinance} disabled={syncing} title="Importar órdenes abiertas desde Binance Futures">
              {syncing ? <span className="spin">⟳</span> : "🔄"} {syncing ? "..." : "Sync Binance"}
            </button>
          )}
        </div>
      </div>
      {positions.map(pos => {
        const risk = calcLiqRisk(pos);
        const acc  = accounts.find(a => a.id === pos.account);
        const lp   = prices[pos.asset]?.price;

        const liveUpnl  = calcLiveUpnl(pos, lp);
        const shownUpnl = liveUpnl !== null ? liveUpnl : (pos.upnl || 0);
        const isLive    = liveUpnl !== null;
        const isPendingLimit = pos.orderType === "Limit"; // §4

        return (
          <div key={pos.id} className={`pc ${risk.level}`}>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <div>
                <span style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700 }}>{pos.asset}</span>
                <span className={`badge ${pos.type === "Long" ? "blo" : "bsh"}`} style={{ marginLeft:7 }}>{pos.type}</span>
                <span className="badge bop" style={{ marginLeft:5 }}>{acc?.name || pos.account}</span>
                {isPendingLimit && <span style={{ fontSize:9, color:"#f0b90b", marginLeft:7 }}>⏳ Limit pendiente</span>}
                {lp && !isPendingLimit && <span style={{ fontSize:9, color:"#00d4ff", marginLeft:9 }}>Live ${lp.toLocaleString(undefined, { maximumFractionDigits:2 })}</span>}
                {pos.bnStatus && <span style={{ fontSize:9, color:"#f97316", marginLeft:7 }}>📡 {pos.bnStatus}</span>}
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:8, color: isPendingLimit ? "#f0b90b" : isLive ? "#22c55e" : "#4a6280" }}>
                  {isPendingLimit ? "Orden sin ejecutar" : isLive ? "📡 Live uPnL" : "uPnL (manual)"}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color: isPendingLimit ? "#4a6280" : shownUpnl >= 0 ? "#22c55e" : "#ef4444" }}>
                  {isPendingLimit ? "–" : `${shownUpnl >= 0 ? "+" : ""}$${shownUpnl.toFixed(2)}`}
                </div>
              </div>
            </div>

            <div className="pgrid">
              {[
                { l:"Entry",  v: pos.entry ?? "-" },
                { l:"Live",   v: lp ? `$${lp.toFixed(2)}` : "-", hl:true },
                { l:"SL",     v: pos.sl ?? <span style={{ color:"#ef4444" }}>❌</span>, d:!pos.sl },
                { l:"TP",     v: pos.tp ?? "-" },
                { l:"Margen", v: pos.margin ? `$${pos.margin?.toFixed(2)}` : "-" },
              ].map((s, i) => (
                <div key={i} className="ps">
                  <div className="pl">{s.l}</div>
                  <div className="pv" style={{ color: s.d ? "#ef4444" : s.hl ? "#00d4ff" : "" }}>{s.v}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:7 }}>
              <div style={{ fontSize:9, color:RISK_COLORS[risk.level], fontWeight:600, marginBottom:2 }}>{risk.label}</div>
              <div className="rbar">
                <div className="rbf" style={{ width:`${Math.min(100, risk.pct)}%`, background:RISK_COLORS[risk.level] }}/>
              </div>
            </div>

            {risk.level === "critical" && (
              <div className="al ad" style={{ marginTop:7, fontSize:10 }}>
                🚨 {pos.sl ? "Mover SL a Break Even" : "Colocar SL de inmediato"}
              </div>
            )}

            <div className="pact">
              {/* §7 — inputs editables: uPnL manual, SL, Margen, Size */}
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:9, color:"#4a6280" }}>SL</span>
                <input type="number" defaultValue={pos.sl || ""} onBlur={e => upd(pos.id, "sl", e.target.value)}
                  placeholder="SL" style={{ width:75, padding:"3px 5px", fontSize:10 }}/>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:9, color:"#4a6280" }}>TP</span>
                <input type="number" defaultValue={pos.tp || ""} onBlur={e => upd(pos.id, "tp", e.target.value)}
                  placeholder="TP" style={{ width:75, padding:"3px 5px", fontSize:10 }}/>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:9, color:"#4a6280" }}>Size $</span>
                <input type="number" defaultValue={pos.size || ""}
                  onBlur={e => upd(pos.id, "size", e.target.value)}
                  placeholder="Trading power" style={{ width:80, padding:"3px 5px", fontSize:10 }}
                  title="Tamaño real de posición (ej: 2000 para Quantfury). Usado para calcular uPnL."/>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:9, color:"#4a6280" }}>uPnL</span>
                <input type="number" defaultValue={pos.upnl}
                  onBlur={e => upd(pos.id, "upnl", e.target.value)}
                  style={{ width:65, padding:"3px 5px", fontSize:10 }}
                  step="0.01" title="Override manual (calculado automático si hay precio live y no es Limit)"/>
              </div>

              {/* §3 — Botón Cerrar: sin prompt, usa Binance API o live uPnL */}
              <button className="btn bs bxs" onClick={async () => {
                if (isPendingLimit) {
                  // Limit pendiente → cancelar en Binance si tiene bnOrderId
                  if (pos.bnOrderId) {
                    if (confirm(`¿Cancelar orden Limit ${pos.bnOrderId} en Binance?`))
                      cancelBinanceOrder(acc, pos, setPositions);
                  } else {
                    if (confirm(`¿Eliminar posición Limit ${pos.asset}?`))
                      setPositions(prev => prev.filter(x => x.id !== pos.id));
                  }
                  return;
                }
                const pnlStr = `${shownUpnl >= 0 ? "+" : ""}$${shownUpnl.toFixed(2)}`;
                if (pos.bnPositionKey && acc?.apiKey) {
                  // Posición activa Binance → cierre via API
                  if (!confirm(`¿Cerrar ${pos.asset} ${pos.type} en Binance Futures?\nPnL estimado: ${pnlStr}`)) return;
                  await closeBinancePosition(acc, pos, onClose, setPositions);
                } else {
                  // Manual / Quantfury / HL → usa live uPnL directamente
                  if (!confirm(`¿Cerrar ${pos.asset} ${pos.type}?\nPnL registrado: ${pnlStr}`)) return;
                  if (onClose) onClose(pos, shownUpnl);
                  else setPositions(prev => prev.filter(x => x.id !== pos.id));
                }
              }}>✅ Cerrar</button>

              {pos.bnOrderId && !pos.bnPositionKey && (
                <button className="btn bd bxs" title="Cancelar orden Limit en Binance Futures" onClick={() => {
                  if (confirm(`¿Cancelar orden ${pos.bnOrderId} en Binance Futures?`))
                    cancelBinanceOrder(acc, pos, setPositions);
                }}>🚫 Cancelar BN</button>
              )}
              {!pos.bnOrderId && !pos.bnPositionKey && (
                <button className="btn bd bxs" onClick={() => setPositions(p => p.filter(x => x.id !== pos.id))}>🛑 Stop</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
