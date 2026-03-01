import { useState } from "react";
import { PROXY } from "../constants";

export default function AccountsTab({ accounts, setAccounts, toast }) {
  const [sk, setSk]           = useState({});
  const [conn, setConn]       = useState({});
  const [testing, setTesting] = useState({});
  const [ftState, setFtState] = useState({}); // futures test state per account
  const [openOrders, setOO]   = useState({}); // open futures orders per account

  const upd = (id, f, v) => setAccounts(p => p.map(a => a.id === id ? { ...a, [f]: v } : a));

  const testBN = async (acc) => {
    setTesting(t => ({ ...t, [acc.id]: true }));
    try {
      const r = await fetch(`${PROXY}/api/binance/ping`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      setConn(s => ({ ...s, [acc.id]: d }));
      if (d.ok) toast.success("Binance ✅", d.msg);
      else toast.error("Binance", d.msg);
    } catch(e) {
      const m = e.name === "TypeError" ? "Proxy offline → node proxy.js" : e.message;
      setConn(s => ({ ...s, [acc.id]: { ok:false, msg:m } }));
      toast.error("Binance", m, 7000);
    }
    setTesting(t => ({ ...t, [acc.id]: false }));
  };

  // §1 — Sync Binance Futures balance → update acc.balance
  const syncBalance = async (acc) => {
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/balance`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!d.ok) { toast.error("Sync balance", d.msg); return; }
      upd(acc.id, "balance", d.availableBalance);
      toast.success("Balance actualizado ✅", `Binance Futures: $${d.availableBalance.toFixed(2)} disponible`);
    } catch(e) {
      toast.error("Sync balance", e.name === "TypeError" ? "Proxy offline" : e.message);
    }
  };

  const fetchFuturesBalance = async (acc) => {
    setFtState(s => ({ ...s, [acc.id]: { step:"loading" } }));
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/balance`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!d.ok) {
        toast.error("Futures", d.msg);
        setFtState(s => ({ ...s, [acc.id]: { step:"idle" } }));
        return;
      }
      const avail    = d.availableBalance;
      const margin20 = avail * 0.20;
      const leverage = 20;
      const entry    = 1000;
      const notional = margin20 * leverage;
      // ETH step = 0.001 — floor to avoid "lot size" error
      const qty = Math.floor((notional / entry) * 1000) / 1000;
      setFtState(s => ({ ...s, [acc.id]: { step:"preview", avail, margin20, leverage, entry, notional, qty } }));
    } catch(e) {
      toast.error("Futures", e.name === "TypeError" ? "Proxy offline → node proxy.cjs" : e.message);
      setFtState(s => ({ ...s, [acc.id]: { step:"idle" } }));
    }
  };

  const placeFuturesOrder = async (acc) => {
    const ft = ftState[acc.id];
    if (!ft || ft.qty < 0.001) { toast.error("Futures", "Quantity mínima: 0.001 ETH"); return; }
    setFtState(s => ({ ...s, [acc.id]: { ...ft, step:"placing" } }));
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/order`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret, symbol:"ETHUSDT", side:"BUY", type:"LIMIT", quantity: ft.qty, price: ft.entry, timeInForce:"GTC" }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      if (!d.ok) {
        toast.error("Futures", d.msg);
        setFtState(s => ({ ...s, [acc.id]: { ...ft, step:"preview" } }));
        return;
      }
      toast.success("Orden colocada ✅", `ETHUSDT LONG ${ft.qty} @ $${ft.entry} — ID: ${d.order.orderId}`);
      setFtState(s => ({ ...s, [acc.id]: { ...ft, step:"done", orderId: d.order.orderId } }));
    } catch(e) {
      toast.error("Futures", e.message);
      setFtState(s => ({ ...s, [acc.id]: { ...ft, step:"preview" } }));
    }
  };

  const fetchOpenOrders = async (acc) => {
    setOO(s => ({ ...s, [acc.id]: { loading:true, orders:[], error:null } }));
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/openOrders`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      if (d.ok) setOO(s => ({ ...s, [acc.id]: { loading:false, orders: d.orders, error:null } }));
      else setOO(s => ({ ...s, [acc.id]: { loading:false, orders:[], error: d.msg } }));
    } catch(e) {
      setOO(s => ({ ...s, [acc.id]: { loading:false, orders:[], error: e.message } }));
    }
  };

  const cancelOrder = async (acc, symbol, orderId) => {
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/cancelOrder`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret, symbol, orderId }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("Cancelada ✅", `Orden ${orderId} cancelada`);
        // Refresh orders list
        fetchOpenOrders(acc);
      } else {
        toast.error("Cancelar", d.msg);
      }
    } catch(e) {
      toast.error("Cancelar", e.message);
    }
  };

  const testHL = async (acc) => {
    setTesting(t => ({ ...t, [acc.id]: true }));
    const addr = acc.apiKey.trim();
    if (!addr.startsWith("0x")) {
      toast.warning("HL", "Wallet pública 0x... (no el private key)");
      setTesting(t => ({ ...t, [acc.id]: false }));
      return;
    }
    try {
      const r = await fetch(`${PROXY}/api/hyperliquid/user`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ address: addr }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (d.error) {
        toast.error("HL", d.error);
        setConn(s => ({ ...s, [acc.id]: { ok:false, msg:d.error } }));
      } else {
        const eq = d.marginSummary?.accountValue || "?";
        const m = `✅ Equity: $${parseFloat(eq).toFixed(2)}`;
        setConn(s => ({ ...s, [acc.id]: { ok:true, msg:m } }));
        toast.success("HL ✅", m);
        upd(acc.id, "balance", parseFloat(eq) || acc.balance);
      }
    } catch(e) {
      const m = e.name === "TypeError" ? "Proxy offline → node proxy.js" : e.message;
      setConn(s => ({ ...s, [acc.id]: { ok:false, msg:m } }));
      toast.error("HL", m);
    }
    setTesting(t => ({ ...t, [acc.id]: false }));
  };

  return (
    <div className="page">
      <div className="al ad" style={{ fontSize:10 }}>
        🔐 API keys guardadas en localStorage (solo accesible desde tu localhost). Para HL: wallet pública 0x..., NUNCA el private key.
      </div>
      {accounts.map(acc => (
        <div key={acc.id} style={{ border:"1px solid #1e2d3d", borderRadius:8, padding:13, marginBottom:11 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:acc.color }}/>
              <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13 }}>{acc.name}</span>
              <span style={{
                display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:9,
                background: acc.type === "manual" ? "#ef444415" : "#22c55e15",
                color: acc.type === "manual" ? "#ef4444" : "#22c55e",
                border: `1px solid ${acc.type === "manual" ? "#ef444430" : "#22c55e30"}`
              }}>{acc.type === "manual" ? "Manual" : "API"}</span>
            </div>
            <div style={{ display:"flex", gap:7, alignItems:"center" }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:8, color:"#4a6280" }}>Balance</div>
                <div style={{ fontWeight:700, color:acc.color, fontFamily:"'Syne',sans-serif", fontSize:13 }}>${acc.balance.toFixed(2)}</div>
              </div>
              <button className="btn bd bxs" onClick={() => { if (confirm("¿Eliminar?")) setAccounts(p => p.filter(a => a.id !== acc.id)); }}>✕</button>
            </div>
          </div>
          <div className="fi">
            <label>Balance</label>
            <div style={{ display:"flex", gap:4 }}>
              <input type="number" value={acc.balance} onChange={e => upd(acc.id, "balance", parseFloat(e.target.value) || 0)} step="0.01"/>
              {acc.type === "binance" && acc.apiKey && acc.apiSecret && (
                <button className="btn bpu bxs" title="Sincronizar balance desde Binance Futures" onClick={() => syncBalance(acc)}>🔄</button>
              )}
            </div>
          </div>
          <div style={{ fontSize:10, color:"#4a6280", background:"#070e18", padding:"6px 9px", borderRadius:5, marginBottom:9 }}>ℹ️ {acc.note}</div>
          {acc.type !== "manual" && (
            <>
              <div className="fi">
                <label>{acc.type === "hyperliquid" ? "Wallet pública (0x...)" : "API Key"}</label>
                <div style={{ display:"flex", gap:4 }}>
                  <input
                    type={sk[acc.id] ? "text" : "password"}
                    value={acc.apiKey}
                    onChange={e => upd(acc.id, "apiKey", e.target.value)}
                    placeholder={acc.type === "hyperliquid" ? "0x..." : "API Key..."}
                  />
                  <button className="btn bg bsm" onClick={() => setSk(s => ({ ...s, [acc.id]: !s[acc.id] }))}>👁</button>
                </div>
              </div>
              {acc.type === "binance" && (
                <div className="fi">
                  <label>API Secret</label>
                  <input type={sk[acc.id] ? "text" : "password"} value={acc.apiSecret} onChange={e => upd(acc.id, "apiSecret", e.target.value)} placeholder="Secret..."/>
                </div>
              )}
              {acc.apiKey && (
                <div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <button
                      className={`btn ${acc.type === "binance" ? "by" : "bpu"} bsm`}
                      onClick={() => acc.type === "binance" ? testBN(acc) : testHL(acc)}
                      disabled={testing[acc.id]}
                    >
                      {testing[acc.id] ? <span className="spin">⟳</span> : "⚡"} {testing[acc.id] ? "Probando..." : acc.type === "binance" ? "Test Spot" : "Test HL"}
                    </button>
                    {acc.type === "binance" && acc.apiSecret && (
                      <button
                        className="btn bg bsm"
                        onClick={() => fetchFuturesBalance(acc)}
                        disabled={ftState[acc.id]?.step === "loading" || ftState[acc.id]?.step === "placing"}
                      >
                        🔬 Test Futures Position
                      </button>
                    )}
                    {acc.type === "binance" && acc.apiSecret && (
                      <button
                        className="btn bpu bsm"
                        onClick={() => fetchOpenOrders(acc)}
                        disabled={openOrders[acc.id]?.loading}
                      >
                        {openOrders[acc.id]?.loading ? <span className="spin">⟳</span> : "📋"} {openOrders[acc.id]?.loading ? "..." : "Órdenes activas"}
                      </button>
                    )}
                  </div>
                  {conn[acc.id] && (
                    <div className="cs" style={{
                      background: conn[acc.id].ok ? "#22c55e15" : "#ef444415",
                      border: `1px solid ${conn[acc.id].ok ? "#22c55e33" : "#ef444433"}`
                    }}>
                      <div className="cd" style={{ background: conn[acc.id].ok ? "#22c55e" : "#ef4444" }}/>
                      <span style={{ color: conn[acc.id].ok ? "#86efac" : "#fca5a5", fontSize:10 }}>{conn[acc.id].msg}</span>
                    </div>
                  )}
                  {/* Open orders list */}
                  {acc.type === "binance" && openOrders[acc.id] && !openOrders[acc.id].loading && (
                    <div style={{ marginTop:8 }}>
                      {openOrders[acc.id].error ? (
                        <div className="al ad" style={{ fontSize:10 }}>❌ {openOrders[acc.id].error}</div>
                      ) : openOrders[acc.id].orders.length === 0 ? (
                        <div className="al aok" style={{ fontSize:10 }}>✅ Sin órdenes activas en Binance Futures</div>
                      ) : (
                        <div>
                          <div style={{ fontSize:10, color:"#00d4ff", marginBottom:5, fontWeight:600 }}>
                            📋 Órdenes activas ({openOrders[acc.id].orders.length})
                          </div>
                          {openOrders[acc.id].orders.map(o => (
                            <div key={o.orderId} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #0f1e2e", fontSize:10 }}>
                              <div>
                                <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11 }}>{o.symbol}</span>
                                <span className={`badge ${o.side === "BUY" ? "blo" : "bsh"}`} style={{ marginLeft:5 }}>{o.side === "BUY" ? "LONG" : "SHORT"}</span>
                                <div style={{ color:"#4a6280", fontSize:9, marginTop:1 }}>
                                  {o.type} @ ${parseFloat(o.price).toFixed(2)} × {o.origQty} — ID: {o.orderId}
                                </div>
                                <div style={{ color:"#4a6280", fontSize:9 }}>Status: <span style={{ color: o.status === "NEW" ? "#22c55e" : "#f97316" }}>{o.status}</span></div>
                              </div>
                              <button className="btn bd bxs" onClick={() => {
                                if (confirm(`¿Cancelar orden ${o.orderId}?`)) cancelOrder(acc, o.symbol, o.orderId);
                              }}>✕ Cancelar</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Futures test flow */}
                  {acc.type === "binance" && (() => {
                    const ft = ftState[acc.id];
                    if (!ft || ft.step === "idle") return null;
                    if (ft.step === "loading") return <div style={{ fontSize:10, color:"#4a6280", marginTop:7 }}>⟳ Cargando balance futures...</div>;
                    if (ft.step === "preview" || ft.step === "placing") return (
                      <div className="al ai" style={{ fontSize:10, marginTop:7 }}>
                        <div style={{ marginBottom:6, fontWeight:600, color:"#00d4ff" }}>📊 Test Posición Calculada</div>
                        <div className="rb" style={{ marginBottom:8 }}>
                          {[
                            ["Balance disponible USDT", `$${ft.avail.toFixed(2)}`],
                            ["20% margen", `$${ft.margin20.toFixed(2)}`],
                            ["Leverage", `x${ft.leverage}`],
                            ["Notional", `$${ft.notional.toFixed(2)}`],
                            ["Par", "ETH-USDT"],
                            ["Dirección", "LONG (BUY)"],
                            ["Entry (Limit)", `$${ft.entry} ← no ejecutará`],
                            ["Cantidad", `${ft.qty} ETH`],
                          ].map(([k, v]) => (
                            <div key={k} className="rr" style={{ fontSize:9 }}>
                              <span className="k">{k}</span>
                              <span className="v grey">{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:5 }}>
                          <button className="btn bs bsm" onClick={() => placeFuturesOrder(acc)} disabled={ft.step === "placing"}>
                            {ft.step === "placing" ? "Colocando..." : "✅ Confirmar y colocar orden"}
                          </button>
                          <button className="btn bg bxs" onClick={() => setFtState(s => ({ ...s, [acc.id]: { step:"idle" } }))}>Cancelar</button>
                        </div>
                      </div>
                    );
                    if (ft.step === "done") return (
                      <div className="al aok" style={{ fontSize:10, marginTop:7 }}>
                        ✅ Orden colocada en Binance Futures<br/>
                        ETHUSDT LONG {ft.qty} ETH @ $1000 (Limit, pendiente)<br/>
                        Order ID: <strong>{ft.orderId}</strong>
                        <div style={{ marginTop:5 }}>
                          <button className="btn bg bxs" onClick={() => setFtState(s => ({ ...s, [acc.id]: { step:"idle" } }))}>OK</button>
                        </div>
                      </div>
                    );
                    return null;
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      ))}
      <button className="btn bg" style={{ width:"100%" }} onClick={() => {
        const n = prompt("Nombre:");
        const t = prompt("Tipo (manual/binance/hyperliquid):") || "manual";
        if (n) setAccounts(p => [...p, { id:`${n.toLowerCase().replace(/\s/g,"_")}_${Date.now()}`, name:n, balance:0, color:"#9b59b6", apiKey:"", apiSecret:"", type:t, note:`Configurá ${n}` }]);
      }}>+ Agregar cuenta</button>
    </div>
  );
}
