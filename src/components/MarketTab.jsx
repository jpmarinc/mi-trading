import { useState } from "react";
import { PROXY } from "../constants";

export default function MarketTab({ watchlist, setWatchlist, prices, loading, refresh, proxyOk, toast }) {
  const [sym, setSym] = useState("");
  const [src, setSrc] = useState("auto");
  const [hlMeta, setHlMeta] = useState(null);
  const [loadMeta, setLoadMeta] = useState(false);
  const [hlSearch, setHlSearch] = useState("");
  const [stockSym, setStockSym] = useState("");
  const [stockResult, setStockResult] = useState(null);
  const [loadStock, setLoadStock] = useState(false);

  const add = () => {
    const s = sym.trim().toUpperCase();
    if (!s || watchlist.find(w => w.symbol === s)) { toast.warning("", "Ya existe o símbolo vacío"); return; }
    setWatchlist(p => [...p, { symbol:s, source:src }]);
    setSym("");
  };

  const testStock = async () => {
    const s = stockSym.trim().toUpperCase();
    if (!s) return;
    setLoadStock(true); setStockResult(null);
    try {
      const r = await fetch(`${PROXY}/api/prices/stock?symbol=${s}`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      setStockResult(d.ok ? { symbol: s, price: d.price, change24h: d.change24h, ok: true } : { ok: false, msg: d.msg });
    } catch(e) { setStockResult({ ok: false, msg: e.message }); }
    setLoadStock(false);
  };

  const fetchMeta = async () => {
    setLoadMeta(true);
    try {
      const r = await fetch(`${PROXY}/api/hyperliquid/meta`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) { const d = await r.json(); setHlMeta(d.assets); }
      else toast.error("HL Meta", "Proxy offline");
    } catch(e) { toast.error("HL Meta", e.message); }
    setLoadMeta(false);
  };

  return (
    <div className="page">
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:11, flexWrap:"wrap" }}>
        <div style={{
          padding:"5px 10px", borderRadius:5,
          background: proxyOk === true ? "#22c55e15" : proxyOk === false ? "#ef444415" : "#1e2d3d",
          border: `1px solid ${proxyOk === true ? "#22c55e33" : proxyOk === false ? "#ef444433" : "#1e2d3d"}`,
          fontSize:10,
          color: proxyOk === true ? "#86efac" : proxyOk === false ? "#fca5a5" : "#64748b"
        }}>
          {proxyOk === true ? "🟢 Proxy activo" : proxyOk === false ? "🔴 Proxy offline → node proxy.js" : "⚪ Verificando..."}
        </div>
        <button className="btn bg bsm" onClick={refresh}>{loading ? <span className="spin">↻</span> : "↻"} Refresh</button>
      </div>

      <div className="tkgrid">
        {watchlist.map(w => {
          const p = prices[w.symbol];
          return (
            <div key={w.symbol} className="tk">
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span className="tk-sym">{w.symbol}</span>
                <button className="btn bd bxs" onClick={() => setWatchlist(p => p.filter(x => x.symbol !== w.symbol))}>✕</button>
              </div>
              <div className="tk-px">{p ? `$${p.price.toLocaleString(undefined, { maximumFractionDigits: p.price > 100 ? 2 : 4 })}` : "—"}</div>
              {p?.change24h != null && (
                <div className="tk-chg" style={{ color: p.change24h >= 0 ? "#22c55e" : "#ef4444" }}>
                  {p.change24h >= 0 ? "▲" : "▼"} {Math.abs(p.change24h).toFixed(2)}%
                </div>
              )}
              <div className="tk-src">{p?.source || w.source}</div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="ct">➕ Agregar ticker</div>
        <div className="al ai" style={{ fontSize:10 }}>
          <strong>Binance spot</strong> (sin key): BTC, ETH, XRP, LTC, SOL, BNB, DOGE<br/>
          <strong>Binance futures</strong> (sin key): COIN, MSTR y otros perps → fuente "binance-futures"<br/>
          <strong>Hyperliquid perps</strong>: OIL, GOLD, BTC, ETH, SOL y más → usá Inspector abajo<br/>
          <strong>Stocks vía Yahoo</strong>: NVDA, MELI, AAPL, TSLA, NKE → fuente "stock"<br/>
          <strong>Commodities vía Yahoo</strong>: OIL, GOLD, SILVER, GAS, WHEAT → fuente "commodity"
        </div>
        <div className="g3">
          <div className="fi">
            <label>Símbolo</label>
            <input
              placeholder="BTC, NVDA, OIL, MELI..."
              value={sym}
              onChange={e => setSym(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && add()}
            />
          </div>
          <div className="fi">
            <label>Fuente</label>
            <select value={src} onChange={e => setSrc(e.target.value)}>
              <option value="auto">auto</option>
              <option value="binance">Binance Spot</option>
              <option value="binance-futures">Binance Futures (COIN, MSTR, etc.)</option>
              <option value="hyperliquid">Hyperliquid Perps</option>
              <option value="stock">Stock (Yahoo Finance)</option>
              <option value="commodity">Commodity (Yahoo Finance)</option>
              <option value="coingecko">CoinGecko</option>
            </select>
          </div>
          <div className="fi"><label>&nbsp;</label><button className="btn bp" style={{ width:"100%" }} onClick={add}>Agregar</button></div>
        </div>
      </div>

      {/* Inspector Yahoo Finance — Stocks */}
      <div className="card">
        <div className="ct"><span>📈 Inspector Stocks (Yahoo Finance)</span></div>
        <div style={{ fontSize:10, color:"#4a6280", marginBottom:8 }}>
          Validá si un ticker existe y su precio antes de agregarlo. Funciona para acciones (NVDA, MELI, AAPL, NKE) y ETFs.
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <input
            placeholder="NVDA, MELI, AAPL..."
            value={stockSym}
            onChange={e => setStockSym(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && testStock()}
            style={{ flex:1 }}
          />
          <button className="btn bpu bsm" onClick={testStock} disabled={loadStock}>
            {loadStock ? <span className="spin">⟳</span> : "🔍"} {loadStock ? "..." : "Buscar"}
          </button>
        </div>
        {stockResult && (
          <div style={{ marginTop:8 }}>
            {stockResult.ok ? (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontWeight:700, color:"#00d4ff" }}>{stockResult.symbol}</span>
                <span style={{ color:"#22c55e", fontWeight:700 }}>${stockResult.price?.toLocaleString(undefined, { maximumFractionDigits:2 })}</span>
                {stockResult.change24h != null && (
                  <span style={{ color: stockResult.change24h >= 0 ? "#22c55e" : "#ef4444", fontSize:10 }}>
                    {stockResult.change24h >= 0 ? "▲" : "▼"} {Math.abs(stockResult.change24h).toFixed(2)}%
                  </span>
                )}
                <button className="btn bp bsm" onClick={() => {
                  if (!watchlist.find(w => w.symbol === stockResult.symbol)) {
                    setWatchlist(p => [...p, { symbol: stockResult.symbol, source:"stock" }]);
                    toast.success("Watchlist", `${stockResult.symbol} agregado como stock`);
                  } else { toast.warning("", `${stockResult.symbol} ya está en watchlist`); }
                }}>+ Agregar</button>
              </div>
            ) : (
              <div style={{ color:"#ef4444", fontSize:10 }}>❌ {stockResult.msg || "No encontrado"}</div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="ct">
          <span>🔍 Inspector Hyperliquid</span>
          <button className="btn bpu bsm" onClick={fetchMeta} disabled={loadMeta}>
            {loadMeta ? <span className="spin">⟳</span> : "📋"} {loadMeta ? "..." : "Ver tickers"}
          </button>
        </div>
        {hlMeta ? (
          <div>
            <div style={{ fontSize:9, color:"#4a6280", marginBottom:6 }}>
              {hlMeta.length} assets. Los <span style={{ color:"#f97316" }}>numéricos</span> son vault tokens. Tocá uno para agregar.
            </div>
            <input
              placeholder="Buscar ticker... (BTC, OIL, GOLD)"
              value={hlSearch}
              onChange={e => setHlSearch(e.target.value.toUpperCase())}
              style={{ marginBottom:7, fontSize:11 }}
            />
            <div style={{ maxHeight:200, overflowY:"auto" }}>
              {hlMeta.filter(a => !a.isVault && (!hlSearch || a.name.includes(hlSearch))).map(a => (
                <span key={a.name} className="hl-key" onClick={() => { setSym(a.name); setSrc("hyperliquid"); toast.info("Ticker", `${a.name} = $${a.price}`); }}>
                  {a.name} <span style={{ color:"#4a6280" }}>${a.price}</span>
                </span>
              ))}
              {hlMeta.filter(a => a.isVault).length > 0 && (
                <>
                  <div style={{ fontSize:9, color:"#f97316", margin:"8px 0 4px" }}>⚠️ Vault tokens (índices de liquidez):</div>
                  {hlMeta.filter(a => a.isVault).map(a => (
                    <span key={a.name} className="hl-key" style={{ borderColor:"#f9731633", color:"#f97316" }}>{a.name}</span>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize:10, color:"#4a6280" }}>Presioná el botón para ver todos los tickers HL y sus nombres exactos.</div>
        )}
      </div>
    </div>
  );
}
