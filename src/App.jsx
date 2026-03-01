import { useState, useCallback, useEffect, useRef } from "react";
import { usePersist }    from "./hooks/usePersist";
import { useToast, ToastItem } from "./hooks/useToast";
import { useMarketData } from "./hooks/useMarketData";
import Header          from "./components/Header";
import Dashboard       from "./components/Dashboard";
import PerformanceTab  from "./components/PerformanceTab";
import RiskCalc        from "./components/RiskCalc";
import MarketTab       from "./components/MarketTab";
import DebtPlan        from "./components/DebtPlan";
import TradeTab        from "./components/TradeTab";
import AccountsTab     from "./components/AccountsTab";
import MaintainersTab  from "./components/MaintainersTab";
import {
  ACCOUNTS_INIT, CLOSED_INIT, OPEN_INIT,
  DEFAULT_LEV, WATCHLIST_INIT, DEFAULT_R_VALUES, REQUIRED_TRADE_FIELDS,
  PROXY
} from "./constants";
import "./styles/global.css";

export default function App() {
  const [tab, setTab]              = useState("dashboard");
  const [closedTrades, setCT]      = usePersist("closedTrades",  CLOSED_INIT);
  const [openPositions, setOP]     = usePersist("openPositions", OPEN_INIT);
  const [accounts, setAccounts]    = usePersist("accounts",      ACCOUNTS_INIT);
  const [leverageOpts, setLev]     = usePersist("leverage",      DEFAULT_LEV);
  const [callOpts, setCallOpts]    = usePersist("callOpts",      ["YO","Chroma","Silla","Mizer","Otro"]);
  const [watchlist, setWL]         = usePersist("watchlist",     WATCHLIST_INIT);
  const [rValues, setRV]           = usePersist("rValues",       DEFAULT_R_VALUES);
  const [sheetsConfig, setSC]      = usePersist("sheetsConfig",  {});
  const [dbConfig, setDBC]         = usePersist("dbConfig",      { host:"localhost", port:"5432", database:"trading_fw", user:"postgres", password:"" });
  const [clpSource, setClpSource]  = usePersist("clpSource",     "dolarapi");
  const [tgConfig, setTgConfig]    = usePersist("telegramConfig", { token:"", chatId:"" });
  const [syncing, setSyncing]      = useState(false);
  const [dbTrades, setDbTrades]    = useState([]);
  const alertsSentRef              = useRef(new Set()); // deduplicar alertas Telegram fase II
  // Ref siempre actualizado a la última versión de openPositions
  // Evita stale closure en syncBinancePositions (useCallback captura versión vieja)
  const openPositionsRef           = useRef(openPositions);
  useEffect(() => { openPositionsRef.current = openPositions; }, [openPositions]);

  // Cargar todos los trades de BD cuando dbConfig tiene password
  useEffect(() => {
    if (!dbConfig?.host || !dbConfig?.database || !dbConfig?.password) return;
    fetch(`${PROXY}/api/db/trades`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ config: dbConfig, limit: 5000, offset: 0 })
    }).then(r => r.json()).then(d => {
      if (d.rows) setDbTrades(d.rows);
    }).catch(() => {});
  }, [dbConfig?.host, dbConfig?.database, dbConfig?.password]);

  const { toasts, rm, toast } = useToast();
  const { prices, clpRate, clpOk, loading, refresh, proxyOk } = useMarketData(watchlist, toast, clpSource);

  // Ensure BTC always in watchlist for header
  useEffect(() => {
    if (!watchlist.find(w => w.symbol === "BTC")) setWL(p => [{ symbol:"BTC", source:"binance" }, ...p]);
  }, []);

  // Auto-add open position assets to watchlist
  useEffect(() => {
    openPositions.forEach(pos => {
      if (!watchlist.find(w => w.symbol === pos.asset)) setWL(p => [...p, { symbol:pos.asset, source:"auto" }]);
    });
  }, [openPositions.length]);

  const sendTg = useCallback(async (text) => {
    if (!tgConfig?.token || !tgConfig?.chatId) return;
    try {
      await fetch(`${PROXY}/api/telegram/send`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ token: tgConfig.token, chatId: tgConfig.chatId, text })
      });
    } catch { /* silent */ }
  }, [tgConfig]);

  const persistTrade = useCallback(async (trade, config) => {
    if (!config?.host || !config?.database) return;
    try {
      await fetch(`${PROXY}/api/db/query`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          // Columnas alineadas con schema v2 (db-setup.sql)
          sql: `INSERT INTO trades (local_id, date, asset, type, account, entry, sl, tp, leverage, order_type, outcome, pnl, source, reasoning, anomaly, closed_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                ON CONFLICT (local_id) DO NOTHING`,
          params: [
            trade.id || null,
            trade.date, trade.asset, trade.type, trade.account,
            trade.entry || null, trade.sl || null, trade.tp || null,
            trade.leverage || 1, trade.orderType || "Market",
            trade.outcome, trade.pnl || 0,
            trade.source || null, trade.reasoning || null,
            trade.anomaly || false,
            trade.closedAt || null,
          ]
        })
      });
    } catch { /* silent — localStorage es la fuente de verdad */ }
  }, []);

  const addClosed = useCallback(t => {
    const trade = { ...t, id: Date.now() };
    setCT(p => [...p, trade]);
    persistTrade(trade, dbConfig);
  }, [dbConfig]);

  const updateClosed = useCallback(t => { setCT(p => p.map(x => x.id === t.id ? t : x)); }, []);

  // Cerrar posición desde cualquier punto (Dashboard o TradeTab)
  const closePosition = useCallback((pos, pnl) => {
    const trade = { ...pos, id: Date.now(), date: new Date().toISOString().split("T")[0], pnl, outcome: pnl > 0 ? "WIN" : pnl === 0 ? "BE" : "LOSS" };
    const missing = REQUIRED_TRADE_FIELDS.filter(f => { const v = trade[f]; return v === null || v === undefined || v === ""; });
    const full = { ...trade, anomaly: missing.length > 0, missingFields: missing };
    setCT(p => [...p, full]);
    setOP(p => p.filter(x => x.id !== pos.id));
    persistTrade(full, dbConfig);
    const sign = pnl >= 0 ? "✅" : "❌";
    sendTg(`${sign} *Posición cerrada*\n📍 ${pos.asset} ${pos.type} @ ${pos.entry}\nP&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}\nCuenta: ${pos.account}`);
  }, [dbConfig, tgConfig]);

  // §6 — Alertas Telegram fase II: entry hit / SL hit / TP hit
  // Dispara cada vez que cambian los precios (cada ~15s según useMarketData)
  useEffect(() => {
    if (!openPositions.length || !tgConfig?.token) return;
    openPositions.forEach(pos => {
      const lp = prices[pos.asset]?.price;
      if (!lp || !pos.entry) return;

      // Entry hit — solo para órdenes Limit pendientes
      if (pos.orderType === "Limit") {
        const key = `entry_${pos.id}_${pos.entry}`;
        if (!alertsSentRef.current.has(key)) {
          const hit = pos.type === "Long" ? lp <= pos.entry : lp >= pos.entry;
          if (hit) {
            alertsSentRef.current.add(key);
            sendTg(`📡 *Entry alcanzado*\n${pos.asset} ${pos.type}\nPrecio: $${lp.toFixed(2)} | Entry: $${pos.entry}`);
          }
        }
      }

      // SL hit — clave incluye valor: si cambia el SL, se genera nueva alerta
      if (pos.sl) {
        const key = `sl_${pos.id}_${pos.sl}`;
        if (!alertsSentRef.current.has(key)) {
          const hit = pos.type === "Long" ? lp <= pos.sl : lp >= pos.sl;
          if (hit) {
            alertsSentRef.current.add(key);
            sendTg(`🛑 *Stop Loss alcanzado*\n${pos.asset} ${pos.type}\nPrecio: $${lp.toFixed(2)} | SL: $${pos.sl}`);
          }
        }
      }

      // TP hit — clave incluye valor: si cambia el TP, se genera nueva alerta
      if (pos.tp) {
        const key = `tp_${pos.id}_${pos.tp}`;
        if (!alertsSentRef.current.has(key)) {
          const hit = pos.type === "Long" ? lp >= pos.tp : lp <= pos.tp;
          if (hit) {
            alertsSentRef.current.add(key);
            sendTg(`🎯 *Take Profit alcanzado*\n${pos.asset} ${pos.type}\nPrecio: $${lp.toFixed(2)} | TP: $${pos.tp}`);
          }
        }
      }
    });
  }, [prices]);

  // §8 — Sync open Binance Futures orders + active positions into openPositions
  // openOrders → pending LIMIT orders | positionRisk → market-executed positions
  // IMPORTANTE: usar openPositionsRef.current (no openPositions del closure) para evitar
  // stale closure que genera duplicados cuando el bnOrderId aún no se propagó al state.
  const syncBinancePositions = useCallback(async () => {
    const bnAccounts = accounts.filter(a => a.type === "binance" && a.apiKey && a.apiSecret);
    if (!bnAccounts.length) { toast.error("Sync", "No hay cuentas Binance con API configuradas"); return; }
    setSyncing(true);
    let added = 0;
    for (const acc of bnAccounts) {
      // 1. Pending LIMIT entry orders (openOrders)
      let liveOrderIds = new Set();
      let slTpMap = {};
      try {
        const r = await fetch(`${PROXY}/api/binance/futures/openOrders`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret }),
          signal: AbortSignal.timeout(10000)
        });
        const d = await r.json();
        if (d.ok) {
          d.orders.forEach(o => liveOrderIds.add(String(o.orderId)));

          for (const order of d.orders) {
            const sym = order.symbol.replace(/USDT$/i, "");
            const sp  = parseFloat(order.stopPrice);
            if (!slTpMap[sym]) slTpMap[sym] = {};
            if (order.type === "STOP_MARKET"        && sp > 0) slTpMap[sym].sl = sp;
            if (order.type === "TAKE_PROFIT_MARKET" && sp > 0) slTpMap[sym].tp = sp;
          }

          setOP(p => p.map(pos => {
            if (pos.account !== acc.id || !slTpMap[pos.asset]) return pos;
            const upd = {};
            if (slTpMap[pos.asset].sl) upd.sl = slTpMap[pos.asset].sl;
            if (slTpMap[pos.asset].tp) upd.tp = slTpMap[pos.asset].tp;
            return Object.keys(upd).length ? { ...pos, ...upd } : pos;
          }));

          for (const order of d.orders) {
            if (order.type !== "LIMIT" || parseFloat(order.price) <= 0) continue;
            const symbol = order.symbol.replace(/USDT$/i, "");
            // Usar ref para ver la versión MÁS RECIENTE de openPositions (evita duplicados)
            const alreadyTracked = openPositionsRef.current.some(p => p.bnOrderId === String(order.orderId));
            if (!alreadyTracked) {
              const newPos = {
                id: `pos_bn_${order.orderId}`,
                asset: symbol,
                type: order.side === "BUY" ? "Long" : "Short",
                account: acc.id,
                entry: parseFloat(order.price) || 0,
                sl: slTpMap[symbol]?.sl || null,
                tp: slTpMap[symbol]?.tp || null,
                leverage: 20, margin: 0, upnl: 0,
                source: "Binance Sync",
                reasoning: `Importado desde Binance — Order ID: ${order.orderId}`,
                orderType: "Limit",
                openedAt: new Date().toISOString().split("T")[0],
                bnOrderId: String(order.orderId),
                bnStatus: order.status,
                qty: parseFloat(order.origQty),
              };
              setOP(p => [...p, newPos]);
              setWL(p => p.find(w => w.symbol === symbol) ? p : [...p, { symbol, source:"auto" }]);
              sendTg(`📡 *Nueva orden detectada (Binance)*\n📍 ${symbol} ${order.side === "BUY" ? "Long" : "Short"}\nTipo: Limit @ $${parseFloat(order.price).toFixed(2)}\nCuenta: ${acc.name}`);
              added++;
            }
          }

          setOP(p => p.filter(pos => {
            if (!pos.bnOrderId || pos.account !== acc.id) return true;
            if (liveOrderIds.has(pos.bnOrderId)) return true;
            return false;
          }));
        }
      } catch { /* silent per account */ }

      // 2. Active positions from positionRisk (market orders ejecutadas)
      try {
        const r = await fetch(`${PROXY}/api/binance/futures/positions`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret }),
          signal: AbortSignal.timeout(10000)
        });
        const d = await r.json();
        if (d.ok) {
          const activePosKeys = new Set(d.positions.map(p => `bn_pos_${acc.id}_${p.symbol}`));

          for (const pos of d.positions) {
            const symbol = pos.symbol.replace(/USDT$/i, "");
            const posKey = `bn_pos_${acc.id}_${pos.symbol}`;
            // Usar ref aquí también
            const alreadyTracked = openPositionsRef.current.some(p => p.bnPositionKey === posKey);
            if (!alreadyTracked) {
              const amt  = parseFloat(pos.positionAmt);
              const upnl = parseFloat(pos.unRealizedProfit);
              const newPos = {
                id: posKey,
                asset: symbol,
                type: amt > 0 ? "Long" : "Short",
                account: acc.id,
                entry: parseFloat(pos.entryPrice),
                sl: slTpMap[symbol]?.sl || null,
                tp: slTpMap[symbol]?.tp || null,
                leverage: parseInt(pos.leverage) || 20,
                margin: 0, upnl,
                source: "Binance Position Sync",
                reasoning: `Posición activa importada — ${pos.positionSide}`,
                orderType: "Market",
                openedAt: new Date().toISOString().split("T")[0],
                bnPositionKey: posKey,
                bnStatus: "ACTIVE",
                qty: Math.abs(amt),
              };
              setOP(p => [...p, newPos]);
              setWL(p => p.find(w => w.symbol === symbol) ? p : [...p, { symbol, source:"auto" }]);
              sendTg(`📡 *Posición activa detectada (Binance)*\n📍 ${symbol} ${amt > 0 ? "Long" : "Short"} @ $${parseFloat(pos.entryPrice).toFixed(2)}\nuPnL: ${upnl >= 0 ? "+" : ""}$${upnl.toFixed(2)}\nCuenta: ${acc.name}`);
              added++;
            }
          }

          setOP(p => p.filter(pos => {
            if (!pos.bnPositionKey || pos.account !== acc.id) return true;
            return activePosKeys.has(pos.bnPositionKey);
          }));
        }
      } catch { /* silent per account */ }
    }
    setSyncing(false);
    if (added > 0) toast.success("Sync Binance ✅", `${added} posición${added > 1 ? "es" : ""} importada${added > 1 ? "s" : ""}`);
    else toast.success("Sync Binance", "Sin posiciones nuevas — todo sincronizado");
  }, [accounts, sendTg]); // openPositions removido de deps: accedemos via ref siempre fresco

  // §2.6 — anomaly badge for Dashboard tab
  const anomalyCount = closedTrades.filter(t => t.anomaly).length;

  const tabs = [
    { id:"dashboard", label:"📊 Dashboard",    badge: anomalyCount, badgeColor:"#f97316" },
    { id:"perf",      label:"📈 Performance" },
    { id:"calc",      label:"🎯 Risk Calc" },
    { id:"market",    label:"🌐 Market" },
    { id:"debts",     label:"💰 Deudas" },
    { id:"trade",     label:"➕ Trade",         badge: openPositions.length },
    { id:"accounts",  label:"🔑 Cuentas" },
    { id:"maint",     label:"⚙️ Maintainers" },
  ];

  return (
    <>
      <div className="tc">
        {toasts.map(t => <ToastItem key={t.id} t={t} onClose={() => rm(t.id)}/>)}
      </div>
      <div className="wrap">
        <Header
          accounts={accounts}
          openPositions={openPositions}
          prices={prices}
          clpRate={clpRate}
          clpOk={clpOk}
          loading={loading}
          refresh={refresh}
          clpSource={clpSource}
          setClpSource={setClpSource}
        />
        <div className="tabs">
          {tabs.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.badge > 0 && (
                <span className="bc" style={t.badgeColor ? { background:t.badgeColor } : {}}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "dashboard" && <Dashboard closedTrades={closedTrades} dbTrades={dbTrades} openPositions={openPositions} setOpenPositions={setOP} accounts={accounts} prices={prices} onUpdate={updateClosed} onClose={closePosition} onSyncBinance={syncBinancePositions} syncing={syncing}/>}
        {tab === "perf"      && <PerformanceTab closedTrades={closedTrades} dbTrades={dbTrades} rValues={rValues} accounts={accounts}/>}
        {tab === "calc"      && <RiskCalc accounts={accounts} leverageOpts={leverageOpts} prices={prices} rValues={rValues} sendTg={sendTg}/>}
        {tab === "market"    && <MarketTab watchlist={watchlist} setWatchlist={setWL} prices={prices} loading={loading} refresh={refresh} proxyOk={proxyOk} toast={toast}/>}
        {tab === "debts"     && <DebtPlan rValues={rValues} accounts={accounts}/>}
        {tab === "trade"     && <TradeTab onAdd={addClosed} accounts={accounts} openPositions={openPositions} setOpenPositions={setOP} leverageOpts={leverageOpts} callOpts={callOpts} toast={toast} prices={prices} sendTg={sendTg} dbConfig={dbConfig}/>}
        {tab === "accounts"  && <AccountsTab accounts={accounts} setAccounts={setAccounts} toast={toast}/>}
        {tab === "maint"     && <MaintainersTab accounts={accounts} leverageOpts={leverageOpts} setLeverageOpts={setLev} callOpts={callOpts} setCallOpts={setCallOpts} rValues={rValues} setRValues={setRV} sheetsConfig={sheetsConfig} setSheetsConfig={setSC} dbConfig={dbConfig} setDbConfig={setDBC} tgConfig={tgConfig} setTgConfig={setTgConfig} toast={toast}/>}
      </div>
    </>
  );
}
