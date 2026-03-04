import { useState, useEffect, useRef } from "react";
import { usePersist } from "../hooks/usePersist";
import { REQUIRED_TRADE_FIELDS, PROXY } from "../constants";

// §2 — Formulario de edición de trade de BD
function DbTradeEditForm({ trade, accounts, callOpts, onSave, onCancel }) {
  const rawTime = trade.closed_at
    ? new Date(trade.closed_at).toTimeString().slice(0, 5)
    : "";
  const [vals, setVals] = useState({
    date:       trade.date ? String(trade.date).split("T")[0] : "",
    time:       rawTime,
    asset:      trade.asset      || "",
    type:       trade.type       || "Long",
    account:    trade.account    || "",
    entry:      trade.entry      ?? "",
    sl:         trade.sl         ?? "",
    tp:         trade.tp         ?? "",
    leverage:   trade.leverage   ?? 1,
    order_type: trade.order_type || "Market",
    outcome:    trade.outcome    || "WIN",
    pnl:        trade.pnl        ?? "",
    source:     trade.source     || "YO",
    reasoning:  trade.reasoning  || "",
  });
  const set = (k, v) => setVals(x => ({ ...x, [k]: v }));

  const buildClosedAt = () => {
    if (!vals.date) return null;
    return vals.time ? `${vals.date}T${vals.time}:00` : vals.date;
  };

  return (
    <div style={{ background:"#0d1520", border:"1px solid #1e3a5f", borderRadius:7, padding:12, marginTop:6 }}>
      <div style={{ fontSize:10, color:"#00d4ff", marginBottom:8, fontWeight:600 }}>Editando trade #{trade.id}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
        <div className="fi"><label>Fecha</label><input type="date" value={vals.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="fi"><label>Hora (HH:MM)</label><input type="time" value={vals.time} onChange={e=>set("time",e.target.value)}/></div>
        <div className="fi"><label>Asset</label><input value={vals.asset} onChange={e=>set("asset",e.target.value.toUpperCase())}/></div>
        <div className="fi"><label>Tipo</label><select value={vals.type} onChange={e=>set("type",e.target.value)}><option>Long</option><option>Short</option></select></div>
        <div className="fi"><label>Cuenta</label>
          <select value={vals.account} onChange={e=>set("account",e.target.value)}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="fi"><label>Orden</label><select value={vals.order_type} onChange={e=>set("order_type",e.target.value)}><option>Market</option><option>Limit</option></select></div>
        <div className="fi"><label>Resultado</label>
          <select value={vals.outcome} onChange={e=>set("outcome",e.target.value)}>
            <option>WIN</option><option>LOSS</option><option>BE</option><option>Partial W</option><option>Partial L</option>
          </select>
        </div>
        <div className="fi"><label>Entry</label><input type="number" value={vals.entry} onChange={e=>set("entry",e.target.value)}/></div>
        <div className="fi"><label>SL</label><input type="number" value={vals.sl} onChange={e=>set("sl",e.target.value)}/></div>
        <div className="fi"><label>TP</label><input type="number" value={vals.tp} onChange={e=>set("tp",e.target.value)}/></div>
        <div className="fi"><label>Leverage</label><input type="number" value={vals.leverage} onChange={e=>set("leverage",e.target.value)}/></div>
        <div className="fi"><label>P&L ($)</label><input type="number" step="0.01" value={vals.pnl} onChange={e=>set("pnl",e.target.value)}/></div>
        <div className="fi"><label>Call</label>
          <select value={vals.source} onChange={e=>set("source",e.target.value)}>
            {vals.source && !(callOpts||[]).includes(vals.source) && (
              <option value={vals.source}>{vals.source}</option>
            )}
            {(callOpts||["YO","Chroma","Silla","Mizer","Otro"]).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="fi" style={{ marginTop:8 }}><label>Reasoning</label><textarea rows={2} value={vals.reasoning} onChange={e=>set("reasoning",e.target.value)}/></div>
      <div style={{ display:"flex", gap:6, marginTop:8 }}>
        <button className="btn bs bsm" onClick={() => onSave({
          ...vals, id: trade.id,
          entry: parseFloat(vals.entry)||null, sl: parseFloat(vals.sl)||null,
          tp: parseFloat(vals.tp)||null, leverage: parseInt(vals.leverage)||1,
          pnl: parseFloat(vals.pnl)||0, closed_at: buildClosedAt()
        })}>💾 Guardar</button>
        <button className="btn bg bsm" onClick={onCancel}>✕ Cancelar</button>
      </div>
    </div>
  );
}

// §2.6 — detectar campos faltantes y marcar anomaly
function detectMissing(trade) {
  return REQUIRED_TRADE_FIELDS.filter(f => {
    const v = trade[f];
    return v === null || v === undefined || v === "";
  });
}

function fmtTime(ts) {
  if (!ts) return "";
  try { return new Date(ts).toTimeString().slice(0, 5); } catch { return ""; }
}

// Componente de filtro de columna (dropdown con checkboxes para distinct values)
function ColFilter({ label, values, active, onChange, onClose }) {
  return (
    <div style={{
      position:"absolute", top:"100%", left:0, zIndex:100,
      background:"#0d1520", border:"1px solid #1e3a5f", borderRadius:6,
      padding:8, minWidth:140, boxShadow:"0 4px 16px rgba(0,0,0,.5)"
    }}>
      <div style={{ fontSize:9, color:"#4a6280", marginBottom:5, fontWeight:600 }}>{label}</div>
      <div style={{ display:"flex", gap:4, marginBottom:6 }}>
        <button className="btn bg bxs" style={{ fontSize:9 }} onClick={() => onChange(new Set(values))}>Todos</button>
        <button className="btn bg bxs" style={{ fontSize:9 }} onClick={() => onChange(new Set())}>Ninguno</button>
      </div>
      <div style={{ maxHeight:160, overflowY:"auto" }}>
        {values.map(v => (
          <label key={v} style={{ display:"flex", alignItems:"center", gap:5, padding:"2px 0", cursor:"pointer", fontSize:10 }}>
            <input type="checkbox" checked={active.has(v)} onChange={() => {
              const s = new Set(active);
              s.has(v) ? s.delete(v) : s.add(v);
              onChange(s);
            }}/>
            <span style={{ color: active.has(v) ? "#e2e8f0" : "#4a6280" }}>{v || "(vacío)"}</span>
          </label>
        ))}
      </div>
      <button className="btn bg bxs" style={{ marginTop:6, fontSize:9, width:"100%" }} onClick={onClose}>✕ Cerrar</button>
    </div>
  );
}

export default function TradeTab({ onAdd, accounts, openPositions, setOpenPositions, leverageOpts, callOpts, toast, prices, sendTg, dbConfig }) {
  const [mode, setMode] = useState("open");
  const [paperOrders, setPaperOrders] = usePersist("paperOrders", []);
  const [bnOrder, setBnOrder] = useState(null);
  const [fetchingMargin, setFetchingMargin] = useState(false);

  // §2 — DB Trades Viewer state
  const [dbTrades, setDbTrades]     = useState([]);
  const [dbTotal, setDbTotal]       = useState(0);
  const [dbPage, setDbPage]         = useState(0);
  const [dbPageSize, setDbPageSize] = useState(20);
  const [dbLoading, setDbLoading]   = useState(false);
  const [dbEditId, setDbEditId]     = useState(null);
  const [dbMigrating, setDbMigrating] = useState(false);
  const [closedTrades] = usePersist("closedTrades", []);

  // Filtros de columna para BD Historial
  const [filters, setFilters] = useState({ asset: new Set(), type: new Set(), outcome: new Set(), account: new Set(), source: new Set() });
  const [openFilterCol, setOpenFilterCol] = useState(null); // columna cuyo dropdown está abierto
  const filterRef = useRef(null);

  // Cerrar dropdown al clickar fuera
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setOpenFilterCol(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const distinct = (field) => [...new Set(dbTrades.map(t => {
    if (field === "account") {
      const acc = accounts.find(a => a.id === t.account);
      return acc ? acc.name : t.account || "(sin cuenta)";
    }
    return t[field] || "(vacío)";
  }).filter(Boolean))].sort();

  const filteredTrades = dbTrades.filter(t => {
    const accName = accounts.find(a => a.id === t.account)?.name || t.account || "(sin cuenta)";
    if (filters.asset.size   && !filters.asset.has(t.asset || "(vacío)"))      return false;
    if (filters.type.size    && !filters.type.has(t.type || "(vacío)"))        return false;
    if (filters.outcome.size && !filters.outcome.has(t.outcome || "(vacío)"))  return false;
    if (filters.account.size && !filters.account.has(accName))                 return false;
    if (filters.source.size  && !filters.source.has(t.source || "(vacío)"))    return false;
    return true;
  });

  const activeFiltersCount = Object.values(filters).filter(s => s.size > 0).length;

  const setFilter = (col, val) => {
    setFilters(prev => ({ ...prev, [col]: val }));
  };

  const clearFilters = () => setFilters({ asset: new Set(), type: new Set(), outcome: new Set(), account: new Set(), source: new Set() });

  // §4 — Reconciliar Binance state
  const [bnRecAccount, setBnRecAccount]     = useState("");
  const [bnRecSymbol, setBnRecSymbol]       = useState("");
  const [bnRecStartDate, setBnRecStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [bnRecEndDate, setBnRecEndDate]     = useState(new Date().toISOString().split("T")[0]);
  const [bnRecLoading, setBnRecLoading]     = useState(false);
  const [bnRecTrades, setBnRecTrades]       = useState([]);
  const [bnRecSelected, setBnRecSelected]   = useState(new Set());
  const [bnRecImporting, setBnRecImporting] = useState(false);
  const [bnClearLoading, setBnClearLoading] = useState(false);

  // Auto-seleccionar la primera cuenta Binance con API configurada
  useEffect(() => {
    if (!bnRecAccount) {
      const first = accounts.find(a => a.type === "binance" && a.apiKey);
      if (first) setBnRecAccount(first.id);
    }
  }, [accounts]);

  const loadDbTrades = async () => {
    if (!dbConfig?.host || !dbConfig?.database) {
      toast.error("BD", "Configurá la conexión a PostgreSQL en Maintainers → Base de Datos");
      return;
    }
    setDbLoading(true);
    try {
      const r = await fetch(`${PROXY}/api/db/trades`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig, limit: dbPageSize, offset: dbPage * dbPageSize })
      });
      const d = await r.json();
      if (d.rows) { setDbTrades(d.rows); setDbTotal(d.total); }
      else toast.error("BD", d.error || "Error al cargar trades");
    } catch { toast.error("BD", "Proxy offline o BD desconectada"); }
    setDbLoading(false);
  };

  const saveDbTrade = async (trade) => {
    try {
      const r = await fetch(`${PROXY}/api/db/trades/${trade.id}`, {
        method:"PUT", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          config: dbConfig,
          fields: {
            date: trade.date, asset: trade.asset, type: trade.type,
            account: trade.account, entry: trade.entry, sl: trade.sl,
            tp: trade.tp, leverage: trade.leverage, order_type: trade.order_type,
            outcome: trade.outcome, pnl: trade.pnl, source: trade.source,
            reasoning: trade.reasoning, closed_at: trade.closed_at,
          }
        })
      });
      const d = await r.json();
      if (d.ok) { loadDbTrades(); setDbEditId(null); toast.success("Guardado ✅", "Trade actualizado en BD"); }
      else toast.error("BD", d.error);
    } catch(e) { toast.error("BD", e.message); }
  };

  // Soft delete — usa DELETE HTTP (semánticamente correcto)
  const deleteDbTrade = async (id) => {
    if (!confirm(`¿Borrar trade #${id}? Soft-delete (queda en BD, solo oculto).`)) return;
    try {
      const r = await fetch(`${PROXY}/api/db/trades/${id}`, {
        method:"DELETE", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig })
      });
      const d = await r.json();
      if (d.ok) { loadDbTrades(); toast.success("Eliminado", `Trade #${id} borrado`); }
      else toast.error("BD", d.error);
    } catch(e) { toast.error("BD", e.message); }
  };

  const migrateLocalTrades = async () => {
    if (!closedTrades.length) { toast.error("Migrar", "No hay trades en localStorage para migrar"); return; }
    if (!dbConfig?.host || !dbConfig?.database) { toast.error("BD", "Configurá la conexión en Maintainers → Base de Datos"); return; }
    setDbMigrating(true);
    try {
      // 1. Asegurar schema actualizado (idempotente)
      await fetch(`${PROXY}/api/db/migrate-schema`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig })
      });
      // 2. Migrar trades
      const r = await fetch(`${PROXY}/api/db/migrate-trades`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig, trades: closedTrades })
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("Migración OK", `${d.inserted} insertados de ${d.total} trades`);
        loadDbTrades();
      } else {
        toast.error("Migrar", d.error);
      }
    } catch(e) { toast.error("Migrar", e.message); }
    setDbMigrating(false);
  };

  useEffect(() => {
    if (mode === "db") loadDbTrades();
  }, [mode, dbPage, dbPageSize]);

  useEffect(() => {
    setPaperOrders(prev => prev.filter(po => {
      if (po.status !== "active") return true;
      return openPositions.some(op => op.sourcePaperId === po.id);
    }));
  }, [openPositions]);

  // §OPEN_FORM
  const [f, sf] = useState({
    asset:"", type:"Long", account:"quantfury", entry:"", sl:"", tp:"",
    leverage:20, reasoning:"", source:"YO", riesgo:"", orderType:"Market"
  });
  const [missingHighlight, setMissingHighlight] = useState([]);

  // §HIST_FORM
  const [fh, sfh] = useState({
    date: new Date().toISOString().split("T")[0],
    time: "",
    asset:"", type:"Long", account:"quantfury",
    entry:"", sl:"", tp:"", leverage:20,
    outcome:"WIN", pnl:"", source:"YO", reasoning:"", orderType:"Market"
  });

  const set  = (k, v) => sf(x  => ({ ...x, [k]: v }));
  const seth = (k, v) => sfh(x => ({ ...x, [k]: v }));
  const acc  = accounts.find(a => a.id === f.account);
  const acch = accounts.find(a => a.id === fh.account);

  const isMarket = f.orderType === "Market";

  const computedMargin = (() => {
    const en  = isMarket ? (prices[f.asset]?.price || 0) : parseFloat(f.entry);
    const sl  = parseFloat(f.sl);
    const lev = parseFloat(f.leverage), r = parseFloat(f.riesgo);
    if (!en || !sl || !lev || !r) return null;
    const slPct = Math.abs((sl - en) / en);
    if (slPct === 0) return null;
    return r / (slPct * lev);
  })();

  const fetch20PctRiesgo = async () => {
    if (!acc?.apiKey || !acc?.apiSecret) { toast.error("Binance", "Configurá API Key y Secret en Cuentas"); return; }
    setFetchingMargin(true);
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/balance`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!d.ok) { toast.error("Binance", d.msg); return; }
      const margin20 = d.availableBalance * 0.20;
      const en  = isMarket ? (prices[f.asset]?.price || 0) : parseFloat(f.entry);
      const sl  = parseFloat(f.sl), lev = parseFloat(f.leverage);
      if (en && sl && lev) {
        const slPct = Math.abs((sl - en) / en);
        if (slPct > 0) {
          set("riesgo", (margin20 * slPct * lev).toFixed(2));
          toast.success("Riesgo calculado", `20% margen ($${margin20.toFixed(2)})`);
        } else toast.error("Binance", "Entry y SL son iguales");
      } else {
        toast.success("Balance disponible", `20% = $${margin20.toFixed(2)}. Ingresá SL para auto-calcular.`);
      }
    } catch(e) {
      toast.error("Binance", e.name === "TypeError" ? "Proxy offline → node src/proxy.cjs" : e.message);
    }
    setFetchingMargin(false);
  };

  // SL/TP vía Binance Algo Order API (fapi/v1/algoOrder).
  // Desde nov-2025 Binance migró órdenes condicionales — fapi/v1/order devuelve -4120.
  // Patrón #27 → #28 actualizado en CLAUDE.md.
  const placeSLTPOrders = async (symbol, slTpSide, sl, tp, qty, isMarketOrder) => {
    if (!isMarketOrder) {
      // LIMIT pendiente: no hay posición aún, closePosition no aplica
      const lines = [sl && `SL: $${sl}`, tp && `TP: $${tp}`].filter(Boolean).join(" | ");
      toast.info?.(`SL/TP guardados — colocá en Binance al ejecutar`, `${symbol} — ${lines}`);
      return;
    }
    // MARKET: posición abierta → colocar vía algoOrder con closePosition=true
    const results = [];
    if (sl) {
      try {
        const r = await fetch(`${PROXY}/api/binance/futures/algoOrder`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            apiKey: acc.apiKey, apiSecret: acc.apiSecret,
            symbol, side: slTpSide, type: "STOP_MARKET",
            triggerPrice: sl, closePosition: "true", workingType: "MARK_PRICE"
          }),
          signal: AbortSignal.timeout(10000)
        });
        const d = await r.json();
        results.push({ label:"SL", ok: d.ok, msg: d.msg });
      } catch(e) { results.push({ label:"SL", ok: false, msg: e.message }); }
    }
    if (tp) {
      try {
        const r = await fetch(`${PROXY}/api/binance/futures/algoOrder`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            apiKey: acc.apiKey, apiSecret: acc.apiSecret,
            symbol, side: slTpSide, type: "TAKE_PROFIT_MARKET",
            triggerPrice: tp, closePosition: "true", workingType: "MARK_PRICE"
          }),
          signal: AbortSignal.timeout(10000)
        });
        const d = await r.json();
        results.push({ label:"TP", ok: d.ok, msg: d.msg });
      } catch(e) { results.push({ label:"TP", ok: false, msg: e.message }); }
    }
    const ok   = results.filter(r => r.ok).map(r => r.label);
    const fail = results.filter(r => !r.ok);
    if (ok.length)   toast.success(`${ok.join(" + ")} colocados en Binance ✅`, `${symbol} — Algo Order API`);
    if (fail.length) fail.forEach(f => toast.error(`Error ${f.label}`, f.msg));
  };

  const placeBinanceOrder = async (form, margin, posId) => {
    if (!acc?.apiKey || !acc?.apiSecret) return;
    const livePrice = prices[form.asset]?.price;
    const entry     = form.orderType === "Market" ? (livePrice || 0) : parseFloat(form.entry);
    const lev       = parseInt(form.leverage);
    const margAmt   = parseFloat(margin) || 0;
    if (!entry || !margAmt) { toast.warning("Binance", "Entry (o precio live) y Riesgo/Margen son obligatorios"); return; }
    const symbol    = form.asset.toUpperCase().replace("-","") + (form.asset.toUpperCase().endsWith("USDT") ? "" : "USDT");
    const notional  = margAmt * lev;
    const qty       = Math.floor((notional / entry) * 1000) / 1000;
    if (qty < 0.001) { toast.warning("Binance", `Qty ${qty} < mínimo 0.001. Aumentá riesgo o leverage`); return; }
    const orderType = form.orderType === "Limit" ? "LIMIT" : "MARKET";
    const bnSide    = form.type === "Long" ? "BUY" : "SELL";
    const slTpSide  = bnSide === "BUY" ? "SELL" : "BUY"; // lado inverso para SL/TP
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/order`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          apiKey: acc.apiKey, apiSecret: acc.apiSecret,
          symbol, side: bnSide, type: orderType, quantity: qty,
          price: orderType === "LIMIT" ? entry : undefined
        }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      if (d.ok) {
        setBnOrder(d.order);
        toast.success("Binance ✅", `${symbol} ${form.type} ${qty} — ID: ${d.order.orderId}`);
        sendTg?.(`📡 *Nueva orden Binance Futures*\n${form.type === "Long" ? "🟢 LONG" : "🔴 SHORT"} ${symbol}\n📍 Tipo: ${orderType}${orderType === "LIMIT" ? ` @ $${entry}` : ""}\nQty: ${qty} | Lev: x${form.leverage}\nRiesgo: $${form.riesgo} | Margen: $${margAmt.toFixed(2)}\nOrder ID: ${d.order.orderId}`);

        // LIMIT: actualizar pos local con bnOrderId para que sync no duplique
        if (orderType === "LIMIT" && posId) {
          setOpenPositions(p => p.map(x => x.id === posId
            ? { ...x, bnOrderId: String(d.order.orderId), bnStatus: "NEW" }
            : x
          ));
        }
        // MARKET: no hay pos local → sync la traerá via positionRisk
        if (orderType === "MARKET" && posId) {
          setOpenPositions(p => p.filter(x => x.id !== posId));
        }

        // Mostrar SL/TP para configuración manual en Binance UI
        const slVal = form.sl ? parseFloat(form.sl) : null;
        const tpVal = form.tp ? parseFloat(form.tp) : null;
        if (slVal || tpVal) {
          placeSLTPOrders(symbol, slTpSide, slVal, tpVal, qty, orderType === "MARKET");
        }
      } else {
        toast.error("Binance", d.msg);
        if (posId) setOpenPositions(p => p.filter(x => x.id !== posId));
      }
    } catch(e) {
      toast.error("Binance", e.message);
      if (posId) setOpenPositions(p => p.filter(x => x.id !== posId));
    }
  };

  const sugR = Math.max(1, (acc?.balance || 53) * 0.05).toFixed(2);
  const lp   = prices[f.asset]?.price;

  const submitOpen = () => {
    if (!f.asset) { toast.error("Error", "Asset es obligatorio"); return; }
    if (!isMarket && !f.entry) { toast.error("Error", "Entry es obligatorio para órdenes Limit"); return; }
    if (!f.sl && !confirm("⚠️ Sin SL. ¿Confirmar?")) return;

    const margin   = computedMargin;
    const entryVal = isMarket ? (lp || 0) : parseFloat(f.entry);

    if (mode === "open") {
      const isBinance = acc?.type === "binance" && acc?.apiKey && acc?.apiSecret;

      if (isBinance && isMarket) {
        placeBinanceOrder(f, margin, null);
        sf({ asset:"", type:"Long", account:"quantfury", entry:"", sl:"", tp:"", leverage:20, reasoning:"", source:"YO", riesgo:"", orderType:"Market" });
        return;
      }

      const pos = {
        id:`pos${Date.now()}`, asset:f.asset, type:f.type, account:f.account,
        entry: entryVal, sl:f.sl?parseFloat(f.sl):null, tp:f.tp?parseFloat(f.tp):null,
        leverage:parseInt(f.leverage), margin:margin||0,
        upnl:0, source:f.source, reasoning:f.reasoning,
        orderType:f.orderType, openedAt:new Date().toISOString().split("T")[0]
      };
      setOpenPositions(p => [...p, pos]);
      toast.success("Posición registrada localmente", `${f.type} ${f.asset} @ ${entryVal}`);
      if (isBinance) placeBinanceOrder(f, margin, pos.id);
    } else {
      const chroma = `${f.type==="Long"?"🟢 📈 LONG":"🔴 📉 SHORT"} $${f.asset}\n📍 Entry: ${f.entry}\n🛑 SL: ${f.sl||"?"}\n🎯 TP: ${f.tp||"?"}\nRisk: ${f.riesgo||sugR}$ | Lev: x${f.leverage}\n#${f.asset} #PriceAction #ChromaTrading`;
      setPaperOrders(p => [...p, {
        id:`paper${Date.now()}`, asset:f.asset, type:f.type, account:f.account,
        entry: entryVal, sl:f.sl?parseFloat(f.sl):null, tp:f.tp?parseFloat(f.tp):null,
        leverage:parseInt(f.leverage), source:f.source, reasoning:f.reasoning,
        orderType:f.orderType, status:"pending", chromaPost:chroma,
        createdAt:new Date().toISOString().split("T")[0]
      }]);
      toast.success("Paper order creada", `${f.type} ${f.asset} — pendiente de ejecución`);
    }
    sf({ asset:"", type:"Long", account:"quantfury", entry:"", sl:"", tp:"", leverage:20, reasoning:"", source:"YO", riesgo:"", orderType:"Market" });
    setMissingHighlight([]);
  };

  const submitHist = () => {
    if (!fh.asset || !fh.entry || !fh.pnl) { toast.error("Error", "Asset, entry y P&L son obligatorios"); return; }
    const closedAt = fh.time ? `${fh.date}T${fh.time}:00` : fh.date;
    const trade = {
      id: Date.now(), date: fh.date, closedAt,
      asset: fh.asset, type: fh.type, account: fh.account,
      entry: parseFloat(fh.entry),
      sl: fh.sl ? parseFloat(fh.sl) : null,
      tp: fh.tp ? parseFloat(fh.tp) : null,
      leverage: parseInt(fh.leverage), orderType: fh.orderType,
      outcome: fh.outcome, pnl: parseFloat(fh.pnl),
      source: fh.source, reasoning: fh.reasoning,
    };
    const missing = detectMissing(trade);
    onAdd({ ...trade, anomaly: missing.length > 0, missingFields: missing });
    if (missing.length > 0) toast.warning("Trade registrado", `⚠️ Faltan: ${missing.join(", ")}`);
    else toast.success("Trade histórico registrado", `${trade.type} ${trade.asset} P&L: ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}`);
    sfh({ date: new Date().toISOString().split("T")[0], time:"", asset:"", type:"Long", account:"quantfury", entry:"", sl:"", tp:"", leverage:20, outcome:"WIN", pnl:"", source:"YO", reasoning:"", orderType:"Market" });
  };

  const activatePaper = (po) => {
    setOpenPositions(p => [...p, { ...po, id:`pos${Date.now()}`, upnl:0, margin:0, openedAt:new Date().toISOString().split("T")[0], sourcePaperId: po.id }]);
    setPaperOrders(p => p.map(x => x.id === po.id ? { ...x, status:"active" } : x));
    toast.success("Orden activada", `${po.asset} movida a posiciones abiertas`);
  };

  const closePaper = (id, outcome, pnl) => {
    if (outcome) {
      const po = paperOrders.find(x => x.id === id);
      const trade = { ...po, id:Date.now(), date:new Date().toISOString().split("T")[0], outcome, pnl:parseFloat(pnl)||0 };
      const missing = detectMissing(trade);
      onAdd({ ...trade, anomaly: missing.length > 0, missingFields: missing });
      setPaperOrders(p => p.filter(x => x.id !== id));
      if (missing.length > 0) toast.warning("Trade registrado", `⚠️ Faltan: ${missing.join(", ")}`);
      else toast.success("Paper cerrada", "Movida al historial");
    } else {
      setPaperOrders(p => p.filter(x => x.id !== id));
    }
  };

  // §4 — Reconciliación Binance
  // Normaliza símbolo: "BTC" → "BTCUSDT", "ETH" → "ETHUSDT", etc.
  const normalizeSymbol = (raw) => {
    const s = raw.trim().toUpperCase();
    const QUOTES = ["USDT","BUSD","USDC","BTC","ETH","BNB"];
    // s.length > q.length garantiza que "BTC" no matchee contra sí mismo como quote
    if (QUOTES.some(q => s.endsWith(q) && s.length > q.length)) return s;
    return s + "USDT";
  };

  const fetchBnTradeHistory = async () => {
    const recAcc = accounts.find(a => a.id === bnRecAccount);
    if (!recAcc?.apiKey || !recAcc?.apiSecret) { toast.error("Reconciliar", "Elegí una cuenta Binance con API configurada"); return; }
    if (!bnRecSymbol.trim()) { toast.error("Reconciliar", "Ingresá un símbolo (ej: BTC, ETHUSDT)"); return; }
    const symbol  = normalizeSymbol(bnRecSymbol);
    const startTs = new Date(bnRecStartDate).getTime();
    const endTs   = new Date(bnRecEndDate + "T23:59:59").getTime();
    setBnRecLoading(true);
    setBnRecTrades([]);
    setBnRecSelected(new Set());
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/tradeHistory`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          apiKey: recAcc.apiKey, apiSecret: recAcc.apiSecret,
          symbol, startTime: startTs, endTime: endTs
        }),
        signal: AbortSignal.timeout(60000)
      });
      const d = await r.json();
      if (!d.ok) { toast.error("Binance", d.msg); setBnRecLoading(false); return; }

      // PnL = Closing PnL + Opening Fee + Closing Fees + Funding Fee proporcional (todo incluido)
      const trades = (d.trades || []).map(t => ({ ...t, account: recAcc.id }));

      if (d.funding_period && Math.abs(d.funding_period) > 0.001)
        toast.info("Funding Fee", `Funding fee período: ${d.funding_period > 0 ? "+" : ""}${d.funding_period} USDT (ya incluido en cada posición)`);

      setBnRecTrades(trades);
      setBnRecSelected(new Set(trades.map(t => t.bn_order_id)));
      if (trades.length === 0) toast.warning("Sin resultados", "No hay trades en ese período para ese símbolo");
      else toast.success(`${trades.length} posiciones encontradas`, "Seleccioná las que querés importar");
    } catch(e) { toast.error("Binance", e.message); }
    setBnRecLoading(false);
  };

  const importBnTrades = async () => {
    const toImport = bnRecTrades.filter(t => bnRecSelected.has(t.bn_order_id));
    if (!toImport.length) { toast.error("Importar", "No hay trades seleccionados"); return; }
    if (!dbConfig?.host) { toast.error("BD", "Configurá PostgreSQL en Maintainers"); return; }
    setBnRecImporting(true);
    try {
      const r = await fetch(`${PROXY}/api/db/import-bn-trades`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig, trades: toImport })
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("Importado ✅", `${d.inserted} nuevos, ${d.skipped} ya existían (${d.total} total)`);
        setBnRecTrades([]);
        setBnRecSelected(new Set());
      } else toast.error("BD", d.error);
    } catch(e) { toast.error("BD", e.message); }
    setBnRecImporting(false);
  };

  const clearBnTrades = async () => {
    if (!dbConfig?.host) { toast.error("BD", "Configurá PostgreSQL en Maintainers"); return; }
    if (!confirm("¿Borrar TODOS los trades importados desde Binance (bn_order_id IS NOT NULL)?\nEsta acción es irreversible — hacelo antes de reimportar con los datos corregidos.")) return;
    setBnClearLoading(true);
    try {
      const r = await fetch(`${PROXY}/api/db/clear-bn-trades`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig })
      });
      const d = await r.json();
      if (d.ok) toast.success("Borrado ✅", `${d.deleted} trades de Binance eliminados de la BD`);
      else toast.error("BD", d.msg || d.error);
    } catch(e) { toast.error("BD", e.message); }
    setBnClearLoading(false);
  };

  const toggleRecSel = (id) => {
    setBnRecSelected(prev => {
      const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
    });
  };

  // Header de columna filtrable
  const FilterHeader = ({ col, label }) => {
    const vals = distinct(col);
    const active = filters[col];
    const isOpen = openFilterCol === col;
    const hasFilter = active.size > 0;
    return (
      <th style={{ cursor:"pointer", userSelect:"none" }}
          onClick={() => setOpenFilterCol(isOpen ? null : col)}>
        <div style={{ position:"relative", display:"inline-block" }}>
          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
            {label}
            <span style={{ fontSize:8, color: hasFilter ? "#00d4ff" : "#4a6280" }}>▼{hasFilter ? ` (${active.size})` : ""}</span>
          </span>
          {isOpen && (
            <div ref={filterRef} onClick={e => e.stopPropagation()}>
              <ColFilter
                label={label}
                values={vals}
                active={active}
                onChange={(s) => setFilter(col, s)}
                onClose={() => setOpenFilterCol(null)}
              />
            </div>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="page">
      <div style={{ display:"flex", gap:6, marginBottom:11, flexWrap:"wrap" }}>
        {[["open","📈 Posición real"],["paper","📝 Paper / Chroma"],["close","✅ Cerrar posición"],["hist","📥 Histórico"],["db","🗄 BD Historial"],["reconcile","🔄 Reconciliar BN"]].map(([v, l]) => (
          <button key={v} className={`btn ${mode === v ? "bp" : "bg"} bsm`} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>

      {/* Open / Paper form */}
      {(mode === "open" || mode === "paper") && (
        <div className="card">
          <div className="ct">{mode === "open" ? "📈 Nueva Posición Real" : "📝 Nueva Paper Order (Chroma tracking)"}</div>
          {mode === "paper" && <div className="al ai" style={{ fontSize:10 }}>Las paper orders se guardan para hacer seguimiento. Podés activarlas cuando se ejecuten.</div>}
          {!isMarket && f.entry && !f.sl && <div className="al ad">🚨 Sin SL</div>}
          {isMarket && lp && <div className="al ai" style={{ fontSize:10 }}>🎯 Precio live: <strong>${lp?.toFixed(2)}</strong> — se usará como entry al ejecutar</div>}
          <div className="al aw" style={{ fontSize:10 }}>💡 {acc?.name} (${(acc?.balance||0).toFixed(2)}) → R recomendado: <strong>${sugR}</strong></div>
          <div className="g3">
            <div className="fi">
              <label>Asset</label>
              <div style={{ display:"flex", gap:4 }}>
                <input placeholder="BTC, OIL..." value={f.asset} onChange={e => set("asset", e.target.value.toUpperCase())}/>
                {lp && !isMarket && <button className="btn bg bxs" onClick={() => set("entry", lp.toString())} title="Usar precio live">📡</button>}
              </div>
            </div>
            <div className="fi"><label>Dirección</label><select value={f.type} onChange={e => set("type", e.target.value)}><option>Long</option><option>Short</option></select></div>
            <div className="fi"><label>Cuenta</label><select value={f.account} onChange={e => set("account", e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          </div>
          <div className="g3">
            {!isMarket && (
              <div className="fi"><label>Entry</label><input type="number" value={f.entry} onChange={e => set("entry", e.target.value)}/></div>
            )}
            <div className="fi"><label>SL 🛑</label><input type="number" value={f.sl} onChange={e => set("sl", e.target.value)}/></div>
            <div className="fi"><label>TP 🎯</label><input type="number" value={f.tp} onChange={e => set("tp", e.target.value)}/></div>
          </div>
          <div className="g4">
            <div className="fi"><label>Leverage</label><select value={f.leverage} onChange={e => set("leverage", e.target.value)}>{leverageOpts.map(l => <option key={l} value={l}>x{l}</option>)}</select></div>
            <div className="fi"><label>Orden</label><select value={f.orderType} onChange={e => set("orderType", e.target.value)}><option>Market</option><option>Limit</option></select></div>
            {mode === "open" && (
              <div className="fi">
                <label>Riesgo ($)</label>
                <div style={{ display:"flex", gap:4 }}>
                  <input type="number" placeholder={`Ej: ${sugR}`} value={f.riesgo} onChange={e => set("riesgo", e.target.value)}/>
                  {acc?.type === "binance" && acc?.apiKey && (
                    <button className="btn by bxs" title="Calcular riesgo desde 20% del balance Binance" onClick={fetch20PctRiesgo} disabled={fetchingMargin}>
                      {fetchingMargin ? "⟳" : "📥"}
                    </button>
                  )}
                </div>
                {computedMargin !== null && (
                  <div style={{ fontSize:9, color:"#4a6280", marginTop:3 }}>Margen: <strong style={{ color:"#00d4ff" }}>${computedMargin.toFixed(2)}</strong></div>
                )}
              </div>
            )}
            <div className="fi"><label>Call</label>
              <select value={f.source} onChange={e => set("source", e.target.value)}>
                {(callOpts||["YO","Chroma","Silla","Mizer","Otro"]).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="fi"><label>Reasoning</label><textarea placeholder="Setup, confluencias..." value={f.reasoning} onChange={e => set("reasoning", e.target.value)}/></div>
          {mode === "open" && acc?.type === "binance" && acc?.apiKey && (
            <div className="al ai" style={{ fontSize:9, marginBottom:6 }}>
              📡 Cuenta Binance — se colocará la orden en Binance Futures al registrar.
              {isMarket
                ? <span style={{ color:"#22c55e" }}> Market: entra al precio live. Sincronizá para ver en dashboard.</span>
                : !f.riesgo && <span style={{ color:"#f97316" }}> Ingresá Riesgo ($) o usá 📥.</span>
              }
              {(f.sl || f.tp) && <span style={{ color:"#22c55e" }}> SL/TP se colocarán en Binance tras la orden principal.</span>}
            </div>
          )}
          <button className="btn bp" style={{ width:"100%" }} onClick={submitOpen}>{mode === "open" ? "Registrar Posición →" : "Crear Paper Order →"}</button>
          {bnOrder && (
            <div className="al aok" style={{ fontSize:9, marginTop:6 }}>
              ✅ Orden Binance: {bnOrder.symbol} {bnOrder.side} {bnOrder.origQty} — ID: {bnOrder.orderId}
              <button className="btn bg bxs" style={{ marginLeft:6 }} onClick={() => setBnOrder(null)}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* §HIST */}
      {mode === "hist" && (
        <div className="card">
          <div className="ct">📥 Registrar Trade Histórico</div>
          <div className="al ai" style={{ fontSize:10, marginBottom:8 }}>
            Para trades ya ejecutados/cerrados. Se agregan directamente al historial.
          </div>
          <div className="g3">
            <div className="fi"><label>Fecha</label><input type="date" value={fh.date} onChange={e => seth("date", e.target.value)}/></div>
            <div className="fi"><label>Hora (HH:MM)</label><input type="time" value={fh.time} onChange={e => seth("time", e.target.value)}/></div>
            <div className="fi"><label>Asset</label><input placeholder="BTC, ETH..." value={fh.asset} onChange={e => seth("asset", e.target.value.toUpperCase())}/></div>
          </div>
          <div className="g3">
            <div className="fi"><label>Dirección</label><select value={fh.type} onChange={e => seth("type", e.target.value)}><option>Long</option><option>Short</option></select></div>
            <div className="fi"><label>Cuenta</label><select value={fh.account} onChange={e => seth("account", e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="fi"><label>Orden</label><select value={fh.orderType} onChange={e => seth("orderType", e.target.value)}><option>Market</option><option>Limit</option></select></div>
          </div>
          <div className="g3">
            <div className="fi"><label>Entry</label><input type="number" value={fh.entry} onChange={e => seth("entry", e.target.value)}/></div>
            <div className="fi"><label>SL 🛑</label><input type="number" value={fh.sl} onChange={e => seth("sl", e.target.value)}/></div>
            <div className="fi"><label>TP 🎯</label><input type="number" value={fh.tp} onChange={e => seth("tp", e.target.value)}/></div>
          </div>
          <div className="g3">
            <div className="fi"><label>Leverage</label><select value={fh.leverage} onChange={e => seth("leverage", e.target.value)}>{leverageOpts.map(l => <option key={l} value={l}>x{l}</option>)}</select></div>
            <div className="fi">
              <label>Resultado</label>
              <select value={fh.outcome} onChange={e => seth("outcome", e.target.value)}>
                <option>WIN</option><option>LOSS</option><option>BE</option>
              </select>
            </div>
            <div className="fi"><label>P&L ($)</label><input type="number" step="0.01" placeholder="Ej: 42.5 o -20" value={fh.pnl} onChange={e => seth("pnl", e.target.value)}/></div>
          </div>
          <div className="g2">
            <div className="fi"><label>Call</label>
              <select value={fh.source} onChange={e => seth("source", e.target.value)}>
                {(callOpts||["YO","Chroma","Silla","Mizer","Otro"]).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="fi" style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
              <label style={{ fontSize:9, color:"#4a6280" }}>Cuenta: {acch?.name}</label>
            </div>
          </div>
          <div className="fi"><label>Reasoning</label><textarea placeholder="Setup, motivo del trade..." value={fh.reasoning} onChange={e => seth("reasoning", e.target.value)}/></div>
          <button className="btn bp" style={{ width:"100%" }} onClick={submitHist}>📥 Registrar en Historial →</button>
        </div>
      )}

      {/* §2 — BD Historial con filtros */}
      {mode === "db" && (
        <div className="card">
          <div className="ct">
            <span>
              🗄 Historial en BD {dbTotal > 0 && <span style={{ color:"#4a6280", fontSize:11 }}>({dbTotal} trades)</span>}
              {activeFiltersCount > 0 && (
                <span style={{ marginLeft:8, fontSize:10, color:"#00d4ff" }}>
                  {filteredTrades.length} filtrados
                  <button className="btn bg bxs" style={{ marginLeft:6, fontSize:9 }} onClick={clearFilters}>✕ Limpiar filtros</button>
                </span>
              )}
            </span>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <select value={dbPageSize} onChange={e => { setDbPageSize(parseInt(e.target.value)); setDbPage(0); }}
                style={{ padding:"2px 6px", fontSize:11 }}>
                {[10,20,50,100].map(n => <option key={n} value={n}>{n} por página</option>)}
              </select>
              <button className="btn bp bxs" onClick={loadDbTrades} disabled={dbLoading}>
                {dbLoading ? "⟳ Cargando..." : "🔄 Cargar"}
              </button>
              <button className="btn bg bxs" onClick={migrateLocalTrades} disabled={dbMigrating || dbLoading}
                title={`Migrar ${closedTrades.length} trades de localStorage a la BD`}>
                {dbMigrating ? "⟳ Migrando..." : `📥 Migrar local (${closedTrades.length})`}
              </button>
            </div>
          </div>
          {!dbTrades.length && !dbLoading && (
            <div style={{ textAlign:"center", color:"#4a6280", padding:"24px 0", fontSize:11 }}>
              Sin datos — hacé clic en "Cargar".<br/>
              Si tenés trades en localStorage, usá <strong>"Migrar local"</strong> para subirlos a la BD.
            </div>
          )}
          {dbTrades.length > 0 && (
            <>
              <div style={{ overflowX:"auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha / Hora</th>
                      <FilterHeader col="asset"   label="Asset" />
                      <FilterHeader col="type"    label="Tipo" />
                      <FilterHeader col="account" label="Cuenta" />
                      <th>Orden</th>
                      <FilterHeader col="outcome" label="Resultado" />
                      <th>P&L</th>
                      <FilterHeader col="source"  label="Call" />
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrades.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ textAlign:"center", color:"#4a6280", padding:"32px 0", fontSize:11, minHeight:80 }}>
                          Sin resultados para los filtros activos.{" "}
                          <button className="btn bg bxs" style={{ fontSize:9 }} onClick={clearFilters}>Limpiar filtros</button>
                        </td>
                      </tr>
                    )}
                    {filteredTrades.map(t => {
                      const accName = accounts.find(a => a.id === t.account)?.name || t.account || "—";
                      return (
                        <>
                          <tr key={t.id}>
                            <td className="grey" style={{ fontSize:9 }}>{t.id}</td>
                            <td className="grey">
                              <div>{t.date ? String(t.date).split("T")[0] : "-"}</div>
                              {t.closed_at && <div style={{ fontSize:9, color:"#4a6280" }}>{fmtTime(t.closed_at)}</div>}
                            </td>
                            <td style={{ fontWeight:600 }}>{t.asset}</td>
                            <td><span className={`badge ${t.type==="Short"?"bsh":"blo"}`}>{t.type}</span></td>
                            <td className="grey" style={{ fontSize:10 }}>{accName}</td>
                            <td>
                              <span className="badge" style={{
                                background:t.order_type==="Limit"?"#f0b90b20":"#00d4ff15",
                                color:t.order_type==="Limit"?"#f0b90b":"#00d4ff",
                                border:`1px solid ${t.order_type==="Limit"?"#f0b90b40":"#00d4ff30"}`
                              }}>{t.order_type||"Market"}</span>
                            </td>
                            <td><span className={`badge ${t.outcome==="WIN"?"bw":t.outcome==="BE"?"bbe":t.outcome?.includes("Partial")?"bpa":"bl"}`}>{t.outcome}</span></td>
                            <td className={parseFloat(t.pnl)>=0?"green":"red"} style={{ fontWeight:600 }}>
                              {parseFloat(t.pnl)>=0?"+":""}{parseFloat(t.pnl||0).toFixed(2)}
                            </td>
                            <td className="grey">{t.source}</td>
                            <td style={{ display:"flex", gap:4 }}>
                              <button className="btn bg bxs" style={{ fontSize:9 }}
                                onClick={() => setDbEditId(dbEditId === t.id ? null : t.id)}>
                                {dbEditId === t.id ? "✕" : "✏️"}
                              </button>
                              <button className="btn bd bxs" style={{ fontSize:9 }}
                                onClick={() => deleteDbTrade(t.id)}>
                                🗑
                              </button>
                            </td>
                          </tr>
                          {dbEditId === t.id && (
                            <tr key={`edit-${t.id}`}>
                              <td colSpan={10} style={{ padding:"0 4px 8px" }}>
                                <DbTradeEditForm
                                  trade={t}
                                  accounts={accounts}
                                  callOpts={callOpts}
                                  onSave={saveDbTrade}
                                  onCancel={() => setDbEditId(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:10, justifyContent:"center" }}>
                <button className="btn bg bxs" disabled={dbPage === 0} onClick={() => setDbPage(p => p - 1)}>← Anterior</button>
                <span style={{ fontSize:11, color:"#4a6280" }}>
                  Página {dbPage + 1} / {Math.max(1, Math.ceil(dbTotal / dbPageSize))}
                </span>
                <button className="btn bg bxs" disabled={(dbPage + 1) * dbPageSize >= dbTotal} onClick={() => setDbPage(p => p + 1)}>Siguiente →</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* §4 — Reconciliar trades desde Binance */}
      {mode === "reconcile" && (
        <div className="card">
          <div className="ct">🔄 Importar Historial de Trades desde Binance</div>
          <div className="al ai" style={{ fontSize:10, marginBottom:8 }}>
            <strong>¿Para qué sirve?</strong> Trae los trades de Binance Futures del período seleccionado y los guarda en tu BD PostgreSQL.<br/>
            Ingresá solo el par base (ej: <code>BTC</code>) y se buscará <code>BTCUSDT</code> automáticamente. La deduplicación es por Order ID — podés correrlo varias veces sin duplicar.
          </div>
          <div className="g3" style={{ marginBottom:8 }}>
            <div className="fi">
              <label>Cuenta Binance</label>
              <select value={bnRecAccount} onChange={e => setBnRecAccount(e.target.value)}>
                <option value="">— Elegir cuenta —</option>
                {accounts.filter(a => a.type === "binance" && a.apiKey).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="fi">
              <label>Símbolo <span style={{ color:"#8899aa", fontSize:9 }}>(ej: BTC → BTCUSDT automático)</span></label>
              <input placeholder="BTC, ETH, LTC..." value={bnRecSymbol}
                onChange={e => setBnRecSymbol(e.target.value.toUpperCase())}/>
            </div>
            <div className="fi">
              <label>Rango de fechas</label>
              <div style={{ display:"flex", gap:4 }}>
                <input type="date" value={bnRecStartDate} onChange={e => setBnRecStartDate(e.target.value)} style={{ flex:1 }}/>
                <input type="date" value={bnRecEndDate}   onChange={e => setBnRecEndDate(e.target.value)}   style={{ flex:1 }}/>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <button className="btn bp" style={{ flex:1 }}
              onClick={fetchBnTradeHistory}
              disabled={bnRecLoading || !bnRecAccount || !bnRecSymbol.trim()}>
              {bnRecLoading ? "⟳ Consultando..." : "🔍 Consultar historial"}
            </button>
            <button className="btn br" style={{ flex:"0 0 auto" }}
              onClick={clearBnTrades}
              disabled={bnClearLoading}
              title="Borra TODOS los trades importados desde Binance para reimportarlos con datos corregidos">
              {bnClearLoading ? "⟳ Borrando..." : "🗑️ Limpiar BD Binance"}
            </button>
          </div>

          {bnRecTrades.length > 0 && (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:11, color:"#4a6280" }}>{bnRecTrades.length} trades — {bnRecSelected.size} seleccionados</span>
                <div style={{ display:"flex", gap:6 }}>
                  <button className="btn bg bxs" onClick={() => setBnRecSelected(new Set(bnRecTrades.map(t => t.bn_order_id)))}>Todos</button>
                  <button className="btn bg bxs" onClick={() => setBnRecSelected(new Set())}>Ninguno</button>
                </div>
              </div>
              <div style={{ overflowX:"auto", maxHeight:350, overflowY:"auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width:30 }}></th>
                      <th>Fecha / Hora</th><th>Asset</th><th>Tipo</th><th>Entry</th>
                      <th>P&L</th><th>Resultado</th><th>Order ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bnRecTrades.map(t => (
                      <tr key={t.bn_order_id} style={{ opacity: bnRecSelected.has(t.bn_order_id) ? 1 : 0.4 }}>
                        <td>
                          <input type="checkbox" checked={bnRecSelected.has(t.bn_order_id)}
                            onChange={() => toggleRecSel(t.bn_order_id)}/>
                        </td>
                        <td className="grey">
                          <div>{t.date}</div>
                          <div style={{ fontSize:9 }}>{fmtTime(t.closed_at)}</div>
                        </td>
                        <td style={{ fontWeight:600 }}>{t.asset}</td>
                        <td><span className={`badge ${t.type==="Short"?"bsh":"blo"}`}>{t.type}</span></td>
                        <td className="grey">{t.entry?.toFixed(4)}</td>
                        <td className={t.pnl>=0?"green":"red"} style={{ fontWeight:600 }}>
                          {t.pnl>=0?"+":""}{t.pnl.toFixed(2)}
                        </td>
                        <td><span className={`badge ${t.outcome==="WIN"?"bw":t.outcome==="BE"?"bbe":"bl"}`}>{t.outcome}</span></td>
                        <td className="grey" style={{ fontSize:9 }}>{t.bn_order_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn bp" style={{ width:"100%", marginTop:10 }}
                onClick={importBnTrades}
                disabled={bnRecImporting || !bnRecSelected.size}>
                {bnRecImporting ? "⟳ Importando..." : `📥 Importar ${bnRecSelected.size} trades a BD`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Paper Orders list */}
      {paperOrders.length > 0 && (
        <div className="card">
          <div className="ct">📋 Paper Orders ({paperOrders.length})</div>
          {paperOrders.map(po => {
            const lp2 = prices[po.asset]?.price;
            const dist = lp2 && po.entry ? ((lp2 - po.entry) / po.entry * 100).toFixed(2) : null;
            return (
              <div key={po.id} className="paper">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                  <div>
                    <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13 }}>{po.asset}</span>
                    <span className={`badge ${po.type === "Long" ? "blo" : "bsh"}`} style={{ marginLeft:7 }}>{po.type}</span>
                    <span className="badge bpend" style={{ marginLeft:5 }}>{po.status}</span>
                    <span className="badge" style={{ marginLeft:5, background:"#00d4ff15", color:"#00d4ff", border:"1px solid #00d4ff30" }}>{po.source}</span>
                  </div>
                  <div style={{ fontSize:9, color:"#4a6280" }}>{po.createdAt}</div>
                </div>
                <div style={{ display:"flex", gap:14, fontSize:10, marginBottom:6 }}>
                  <span>Entry: <strong>{po.entry}</strong></span>
                  <span>SL: <strong style={{ color:po.sl?"#ef4444":"#4a6280" }}>{po.sl||"❌"}</strong></span>
                  <span>TP: <strong style={{ color:po.tp?"#22c55e":"#4a6280" }}>{po.tp||"-"}</strong></span>
                  {lp2 && <span>Live: <strong style={{ color:"#00d4ff" }}>${lp2.toFixed(2)}</strong> {dist && <span style={{ color:parseFloat(dist)>=0?"#22c55e":"#ef4444" }}>({parseFloat(dist)>=0?"+":""}{dist}%)</span>}</span>}
                </div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  <button className="btn bs bxs" onClick={() => activatePaper(po)}>⚡ Activar</button>
                  <button className="btn bp bxs" onClick={() => { const pnl=prompt("P&L final ($):"); if(pnl!==null) closePaper(po.id,"WIN",pnl); }}>✅ WIN</button>
                  <button className="btn bd bxs" onClick={() => { const pnl=prompt("P&L final ($):"); if(pnl!==null) closePaper(po.id,"LOSS",pnl); }}>❌ LOSS</button>
                  <button className="btn bg bxs" onClick={() => { if(confirm("¿Cancelar?")) setPaperOrders(p=>p.filter(x=>x.id!==po.id)); }}>✕ Cancel</button>
                  <button className="btn bg bxs" onClick={() => { if(po.chromaPost){ const w=window.open("","_blank"); w.document.write(`<pre style="font-family:monospace;background:#080c10;color:#e2e8f0;padding:20px">${po.chromaPost}</pre>`); } }}>📣 Post</button>
                  <button className="cpbtn" onClick={() => po.chromaPost && navigator.clipboard.writeText(po.chromaPost)}>📋 Copiar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cerrar posición */}
      {mode === "close" && (
        <div className="card">
          <div className="ct">✅ Cerrar Posición</div>
          {openPositions.length === 0
            ? <div style={{ color:"#4a6280", textAlign:"center", padding:"24px 0" }}>Sin posiciones abiertas</div>
            : openPositions.map(pos => (
              <div key={pos.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #0f1e2e" }}>
                <div>
                  <span style={{ fontWeight:600 }}>{pos.asset}</span>
                  <span className={`badge ${pos.type === "Long" ? "blo" : "bsh"}`} style={{ marginLeft:6 }}>{pos.type}</span>
                  <div style={{ fontSize:9, color:"#4a6280", marginTop:1 }}>Entry: {pos.entry} | uPnL: {pos.upnl>=0?"+":""}${pos.upnl?.toFixed(2)}</div>
                </div>
                <button className="btn bs bsm" onClick={() => {
                  const pnlStr = prompt("P&L final ($):", pos.upnl);
                  if (pnlStr === null) return;
                  const pnl = parseFloat(pnlStr);
                  if (isNaN(pnl)) return;
                  const trade = { ...pos, id:Date.now(), date:new Date().toISOString().split("T")[0], outcome: pnl > 0 ? "WIN" : pnl === 0 ? "BE" : "LOSS", pnl };
                  const missing = detectMissing(trade);
                  if (missing.length > 0) { setMissingHighlight(missing); toast.warning("Trade registrado con anomalía", `⚠️ Faltan: ${missing.join(", ")}`); }
                  onAdd({ ...trade, anomaly: missing.length > 0, missingFields: missing });
                  setOpenPositions(p => p.filter(x => x.id !== pos.id));
                  if (missing.length === 0) toast.success("Cerrado", `${pos.asset} P&L: ${pnl>=0?"+":""}$${pnl.toFixed(2)}`);
                }}>Cerrar →</button>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
