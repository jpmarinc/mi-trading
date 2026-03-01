import { useState, useCallback, useEffect } from "react";
import { PROXY, BN_SPOT, HL_MAP, COMMODITY_MAP } from "../constants";

// §MARKET_HOOK — hook de precios
export function useMarketData(watchlist, toast, clpSource = "dolarapi") {
  const [prices, setPrices] = useState({});
  const [clpRate, setClpRate] = useState(857);
  const [clpOk, setClpOk] = useState(null); // null=unknown, true=OK, false=failed
  const [loading, setLoading] = useState(false);
  const [proxyOk, setProxyOk] = useState(null);

  const checkProxy = useCallback(async () => {
    try {
      const r = await fetch(`${PROXY}/api/health`, { signal: AbortSignal.timeout(2000) });
      setProxyOk(r.ok);
      return r.ok;
    } catch { setProxyOk(false); return false; }
  }, []);

  const fetchCLP = useCallback(async () => {
    try {
      const r = await fetch(`${PROXY}/api/clp-rate?source=${clpSource}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const d = await r.json();
        if (d.rate) { setClpRate(d.rate); setClpOk(true); }
        else setClpOk(false);
      } else { setClpOk(false); }
    } catch { setClpOk(false); }
  }, [clpSource]);

  // §REFRESH_INTERVAL — intervalo 15s
  const fetchAll = useCallback(async (silent = false) => {
    if (watchlist.length === 0) return;
    setLoading(true);
    const px = { ...prices };
    const useProxy = await checkProxy();

    // BTC via Binance siempre (para header)
    if (!watchlist.find(w => w.symbol === "BTC")) watchlist.push({ symbol:"BTC", source:"binance" });

    // Agrupar por fuente
    const bnAssets = watchlist.filter(w => w.source === "binance" && BN_SPOT[w.symbol]);
    const bnFut    = watchlist.filter(w => w.source === "binance-futures");
    const hlAssets = watchlist.filter(w => w.source === "hyperliquid");
    const autoA    = watchlist.filter(w => w.source === "auto");

    // Binance spot (público)
    const allBn = [...bnAssets, ...autoA.filter(w => BN_SPOT[w.symbol])];
    if (allBn.length > 0 && useProxy) {
      try {
        const syms = [...new Set(allBn.map(w => BN_SPOT[w.symbol]))];
        const r = await fetch(`${PROXY}/api/binance/prices?symbols=${syms.join(",")}`, { signal: AbortSignal.timeout(7000) });
        if (r.ok) {
          const d = await r.json();
          d.forEach(item => {
            const e = allBn.find(w => BN_SPOT[w.symbol] === item.symbol);
            if (e) px[e.symbol] = { price: parseFloat(item.lastPrice), change24h: parseFloat(item.priceChangePercent), source:"Binance" };
          });
        }
      } catch(e) { if (!silent) toast.warning("Binance spot", e.message); }
    }

    // Binance futuros
    if (bnFut.length > 0 && useProxy) {
      try {
        const syms = [...new Set(bnFut.map(w => w.symbol.includes("USDT") ? w.symbol : w.symbol + "USDT"))];
        const r = await fetch(`${PROXY}/api/binance/futures?symbols=${syms.join(",")}`, { signal: AbortSignal.timeout(7000) });
        if (r.ok) {
          const d = await r.json();
          d.forEach(item => {
            const base = item.symbol.replace("USDT","");
            const e = bnFut.find(w => w.symbol === base || w.symbol === item.symbol);
            if (e) px[e.symbol] = { price: parseFloat(item.lastPrice), change24h: parseFloat(item.priceChangePercent), source:"BN Futures" };
          });
        } else if (!silent) {
          const err = await r.json().catch(() => ({}));
          toast.warning("Binance Futures", err?.error || `HTTP ${r.status}`);
        }
      } catch(e) { if (!silent) toast.warning("Binance Futures", e.message); }
    }

    // Stocks via Yahoo Finance (NVDA, MELI, AAPL, etc.)
    const stockAssets = watchlist.filter(w => w.source === "stock");
    if (stockAssets.length > 0 && useProxy) {
      for (const w of stockAssets) {
        try {
          const r = await fetch(`${PROXY}/api/prices/stock?symbol=${w.symbol}`, { signal: AbortSignal.timeout(7000) });
          if (r.ok) {
            const d = await r.json();
            if (d.ok && d.price) px[w.symbol] = { price: d.price, change24h: d.change24h, source:"Yahoo Finance (Stock)" };
            else if (!silent) toast.warning(`${w.symbol} (stock)`, d.msg || "Sin precio");
          }
        } catch(e) { if (!silent) toast.warning(`${w.symbol}`, e.message); }
      }
    }

    // Commodities via Yahoo Finance (OIL, GOLD, SILVER, etc.)
    const commodityAssets = watchlist.filter(w => w.source === "commodity" || (w.source === "auto" && COMMODITY_MAP[w.symbol]));
    if (commodityAssets.length > 0 && useProxy) {
      for (const w of commodityAssets) {
        if (!COMMODITY_MAP[w.symbol]) continue;
        try {
          const r = await fetch(`${PROXY}/api/prices/commodity?symbol=${w.symbol}`, { signal: AbortSignal.timeout(7000) });
          if (r.ok) {
            const d = await r.json();
            if (d.ok && d.price) px[w.symbol] = { price: d.price, change24h: null, source:"Yahoo Finance" };
            else if (!silent) toast.warning(`${w.symbol} (commodity)`, d.msg || "Sin precio");
          }
        } catch(e) { if (!silent) toast.warning(`${w.symbol}`, e.message); }
      }
    }

    // Hyperliquid — incluye auto assets NO commodity y explicitos HL
    const allHL = [...hlAssets, ...autoA.filter(w => !BN_SPOT[w.symbol] && !COMMODITY_MAP[w.symbol])];
    if (allHL.length > 0) {
      try {
        let mids;
        const hlUrl = useProxy ? `${PROXY}/api/hyperliquid/mids` : "https://api.hyperliquid.xyz/info";
        const opts = useProxy
          ? { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}", signal:AbortSignal.timeout(7000) }
          : { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type:"allMids"}), signal:AbortSignal.timeout(7000) };
        const r = await fetch(hlUrl, opts);
        if (r.ok) {
          mids = await r.json();
          allHL.forEach(w => {
            // Fix 2.4: check HL_MAP first, fall back to raw symbol
            const hlKey = HL_MAP[w.symbol] || w.symbol;
            const v = mids[hlKey];
            if (v) {
              px[w.symbol] = { price: parseFloat(v), change24h: null, source:"Hyperliquid" };
            } else if (!silent && w.source === "hyperliquid") {
              toast.warning(`${w.symbol}`, `No encontrado en HL (buscado como "${hlKey}"). Usá Inspector para ver tickers reales.`, 5000);
            }
          });
        }
      } catch(e) {
        if (!silent) toast.error("Hyperliquid", useProxy ? e.message : "CORS — corré: node proxy.js");
      }
    }

    setPrices(px);
    setLoading(false);
    if (useProxy) fetchCLP();
  }, [watchlist, checkProxy, fetchCLP]);

  useEffect(() => {
    fetchAll(true);
    const iv = setInterval(() => fetchAll(true), 15000);
    return () => clearInterval(iv);
  }, [watchlist.length]);

  // Re-fetch CLP when source changes
  useEffect(() => {
    if (proxyOk) fetchCLP();
  }, [clpSource]);

  return { prices, clpRate, clpOk, loading, refresh: () => fetchAll(false), proxyOk };
}
