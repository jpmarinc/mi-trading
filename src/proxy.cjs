/**
 * TRADING FRAMEWORK — PROXY LOCAL v3
 * Resuelve CORS y firma requests a Binance
 *
 * SETUP (una vez):
 *   cd ~/Desktop/mi-trading
 *   npm install express cors
 *   (opcional para DB): npm install pg
 *
 * CORRER cada sesión en una terminal nueva:
 *   node proxy.js
 */

const express  = require("express");
const cors     = require("cors");
const crypto   = require("crypto"); // nativo Node.js, sin instalar
const path     = require("path");
const app      = express();
const PORT     = process.env.PORT || 3001;
const IS_PROD  = process.env.NODE_ENV === "production";

app.use(cors({ origin: IS_PROD ? true : ["http://localhost:5173", "http://localhost:5174"] }));
app.use(express.json());

// ── helper fetch con timeout ────────────────────────────────────────────────
async function pf(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(t); return r;
  } catch(e) { clearTimeout(t); throw e; }
}

// ── HMAC-SHA256 para Binance ────────────────────────────────────────────────
function signBinance(queryString, secret) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

// ── health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ ok: true, ts: Date.now() }));

// ── BINANCE: test account (necesita key + secret + firma) ───────────────────
app.post("/api/binance/ping", async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret)
    return res.status(400).json({ ok: false, msg: "Falta apiKey o apiSecret en el body" });

  const ts = Date.now();
  const qs = `timestamp=${ts}`;
  const sig = signBinance(qs, apiSecret);

  try {
    const r = await pf(
      `https://api.binance.com/api/v3/account?${qs}&signature=${sig}`,
      { headers: { "X-MBX-APIKEY": apiKey } }
    );
    const d = await r.json();
    if (d.code && d.code < 0)
      return res.json({ ok: false, msg: `Binance error ${d.code}: ${d.msg}` });

    const usdt  = (d.balances||[]).find(b => b.asset === "USDT");
    const busd  = (d.balances||[]).find(b => b.asset === "BUSD");
    const bal   = parseFloat(usdt?.free||0) + parseFloat(busd?.free||0);
    res.json({
      ok: true,
      msg: `✅ Conectado — USDT: $${bal.toFixed(2)}`,
      balances: d.balances
    });
  } catch(e) {
    res.status(500).json({ ok: false, msg: `Error de red: ${e.message}` });
  }
});

// ── BINANCE: precios SPOT públicos (sin key) ────────────────────────────────
// GET /api/binance/prices?symbols=BTCUSDT,ETHUSDT
app.get("/api/binance/prices", async (req, res) => {
  const syms = (req.query.symbols || "BTCUSDT").split(",").filter(Boolean);
  try {
    const url = syms.length === 1
      ? `https://api.binance.com/api/v3/ticker/24hr?symbol=${syms[0]}`
      : `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`;
    const r = await pf(url);
    const d = await r.json();
    res.json(Array.isArray(d) ? d : [d]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BINANCE: precios FUTUROS perpetuos (sin key) ────────────────────────────
// Incluye pares crypto Y "stock futures" como COINUSDT
// GET /api/binance/futures?symbols=BTCUSDT,COINUSDT
app.get("/api/binance/futures", async (req, res) => {
  const syms = (req.query.symbols || "BTCUSDT").split(",").filter(Boolean);
  try {
    // fapi = crypto perpetuos (BTC, ETH, COIN, etc.)
    const url = syms.length === 1
      ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${syms[0]}`
      : `https://fapi.binance.com/fapi/v1/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`;
    const r = await pf(url);
    if (!r.ok) {
      const err = await r.json().catch(()=>({}));
      return res.status(r.status).json({ error: err.msg || `HTTP ${r.status}` });
    }
    const d = await r.json();
    res.json(Array.isArray(d) ? d : [d]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BINANCE FUTURES: balance de cuenta (firmado) ────────────────────────────
// POST /api/binance/futures/balance  { apiKey, apiSecret }
app.post("/api/binance/futures/balance", async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret)
    return res.status(400).json({ ok: false, msg: "Falta apiKey o apiSecret" });

  const ts = Date.now();
  const qs  = `timestamp=${ts}`;
  const sig = signBinance(qs, apiSecret);

  try {
    const r = await pf(
      `https://fapi.binance.com/fapi/v2/balance?${qs}&signature=${sig}`,
      { headers: { "X-MBX-APIKEY": apiKey } }
    );
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0))
      return res.json({ ok: false, msg: d.msg || `HTTP ${r.status}` });
    const usdt = (Array.isArray(d) ? d : []).find(b => b.asset === "USDT");
    res.json({
      ok:               true,
      availableBalance: parseFloat(usdt?.availableBalance || 0),
      walletBalance:    parseFloat(usdt?.walletBalance    || 0),
      balances:         d,
    });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── Helper: redondear al step de Binance (evita error -1111 precision) ───────
function roundToStep(value, step) {
  if (!step || parseFloat(step) === 0) return value;
  const precision = (step.split(".")[1] || "").replace(/0+$/, "").length;
  const factor = parseFloat(step);
  // toFixed(10) en la división evita que floating point dé 801281.9999... en vez de 801282
  const steps = Math.floor(parseFloat((value / factor).toFixed(10)));
  return parseFloat((steps * factor).toFixed(precision));
}

// Cache de filtros por símbolo — evita llamada extra en cada orden
const _filterCache = {};

// Obtener stepSize (qty) y tickSize (precio) para un símbolo de futuros
// Reintenta 1 vez ante fallo de red para reducir falsos negativos
async function getBnFuturesFilters(symbol, attempt = 0) {
  if (_filterCache[symbol]) return _filterCache[symbol];
  try {
    const r = await pf(`https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${symbol}`);
    const d = await r.json();
    const sym = d.symbols?.find(s => s.symbol === symbol);
    if (!sym) throw new Error(`symbol ${symbol} not found in exchangeInfo`);
    const lot   = sym.filters.find(f => f.filterType === "LOT_SIZE");
    const price = sym.filters.find(f => f.filterType === "PRICE_FILTER");
    const result = { stepSize: lot?.stepSize || "0.001", tickSize: price?.tickSize || "0.01" };
    _filterCache[symbol] = result;
    return result;
  } catch {
    if (attempt < 1) return getBnFuturesFilters(symbol, attempt + 1);
    return null;
  }
}

// ── BINANCE FUTURES: colocar orden (firmado) ─────────────────────────────────
// POST /api/binance/futures/order
//   { apiKey, apiSecret, symbol, side, type, quantity, price, timeInForce, stopPrice, closePosition, reduceOnly }
// Auto-redondea qty y price al stepSize/tickSize del símbolo para evitar error -1111
// stopPrice: requerido para STOP_MARKET y TAKE_PROFIT_MARKET
// closePosition: "true" = cierra toda la posición sin especificar qty (para SL/TP)
app.post("/api/binance/futures/order", async (req, res) => {
  const { apiKey, apiSecret, symbol, side, type, quantity, price, timeInForce, stopPrice, closePosition, reduceOnly } = req.body;
  if (!apiKey || !apiSecret || !symbol || !side)
    return res.status(400).json({ ok: false, msg: "Faltan: apiKey, apiSecret, symbol, side" });

  // Binance Futures: closePosition requiere MAYÚSCULAS ("TRUE"/"FALSE")
  const useClosePos = String(closePosition).toLowerCase() === "true";
  // Si closePosition=TRUE no se envía quantity; si no, quantity es obligatorio
  if (!useClosePos && !quantity)
    return res.status(400).json({ ok: false, msg: "Falta quantity" });

  // Obtener filtros del símbolo y redondear (falla explícito si no se obtienen)
  const filters = await getBnFuturesFilters(symbol);
  if (!filters) return res.json({ ok: false, msg: `No se pudo obtener filtros de precisión para ${symbol}. Reintentar.` });
  const roundQty  = (!useClosePos && quantity) ? roundToStep(parseFloat(quantity), filters.stepSize) : parseFloat(quantity || 0);
  const roundPx   = price     ? roundToStep(parseFloat(price),     filters.tickSize) : price;
  const roundStop = stopPrice ? roundToStep(parseFloat(stopPrice), filters.tickSize) : stopPrice;

  const ts    = Date.now();
  const parts = [`symbol=${symbol}`, `side=${side}`, `type=${type || "LIMIT"}`];
  if (!useClosePos)                        parts.push(`quantity=${roundQty}`);
  if (roundPx)                             parts.push(`price=${roundPx}`);
  if (roundStop)                           parts.push(`stopPrice=${roundStop}`);
  if (type === "LIMIT" || timeInForce)     parts.push(`timeInForce=${timeInForce || "GTC"}`);
  if (useClosePos)                         parts.push(`closePosition=TRUE`);  // Binance requiere MAYÚSCULAS
  else if (reduceOnly)                     parts.push(`reduceOnly=true`);
  parts.push(`timestamp=${ts}`);

  const qs  = parts.join("&");
  const sig = signBinance(qs, apiSecret);

  try {
    const r = await pf("https://fapi.binance.com/fapi/v1/order", {
      method:  "POST",
      headers: { "X-MBX-APIKEY": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body:    `${qs}&signature=${sig}`,
    });
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0))
      return res.json({ ok: false, msg: `Binance ${d.code}: ${d.msg}` });
    res.json({ ok: true, order: d });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BINANCE FUTURES: SL/TP vía nuevo Algo Order API (desde 2025-11-06) ────────
// POST /api/binance/futures/algoOrder
// { apiKey, apiSecret, symbol, side, type, triggerPrice, closePosition?, quantity?, workingType? }
// type: STOP_MARKET | TAKE_PROFIT_MARKET
// Nota: desde nov-2025 Binance migró órdenes condicionales a fapi/v1/algoOrder.
//       El endpoint fapi/v1/order devuelve -4120 para estas órdenes.
app.post("/api/binance/futures/algoOrder", async (req, res) => {
  const { apiKey, apiSecret, symbol, side, type, triggerPrice, closePosition, quantity, workingType } = req.body;
  if (!apiKey || !apiSecret || !symbol || !side || !type || !triggerPrice)
    return res.status(400).json({ ok: false, msg: "Faltan: symbol, side, type, triggerPrice" });

  const filters        = await getBnFuturesFilters(symbol);
  const roundTrigger   = filters ? roundToStep(parseFloat(triggerPrice), filters.tickSize) : parseFloat(triggerPrice);
  const useClosePos    = String(closePosition).toLowerCase() === "true";
  const roundQty       = (!useClosePos && quantity && filters) ? roundToStep(parseFloat(quantity), filters.stepSize) : parseFloat(quantity || 0);

  const ts    = Date.now();
  const parts = [
    `algoType=CONDITIONAL`,
    `symbol=${symbol}`,
    `side=${side}`,
    `type=${type}`,
    `triggerPrice=${roundTrigger}`,
    `workingType=${workingType || "MARK_PRICE"}`,
    `timestamp=${ts}`,
  ];
  if (useClosePos) parts.push(`closePosition=true`);
  else if (roundQty > 0) parts.push(`quantity=${roundQty}`);

  const qs  = parts.join("&");
  const sig = signBinance(qs, apiSecret);

  try {
    const r = await pf("https://fapi.binance.com/fapi/v1/algoOrder", {
      method:  "POST",
      headers: { "X-MBX-APIKEY": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body:    `${qs}&signature=${sig}`,
    });
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0))
      return res.json({ ok: false, msg: `Binance ${d.code}: ${d.msg}` });
    res.json({ ok: true, order: d, algoId: d.algoId });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BINANCE FUTURES: consultar algo orders abiertos (SL/TP condicionales) ─────
// POST /api/binance/futures/algoOpenOrders
// { apiKey, apiSecret }
// Devuelve las órdenes condicionales activas (STOP_MARKET / TAKE_PROFIT_MARKET)
// que desde nov-2025 ya no aparecen en /fapi/v1/openOrders
app.post("/api/binance/futures/algoOpenOrders", async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret)
    return res.status(400).json({ ok: false, msg: "Faltan: apiKey, apiSecret" });

  const ts  = Date.now();
  const qs  = `algoType=CONDITIONAL&timestamp=${ts}`;
  const sig = signBinance(qs, apiSecret);

  try {
    const r = await pf(`https://fapi.binance.com/fapi/v1/algoOrders/openOrders?${qs}&signature=${sig}`, {
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0))
      return res.json({ ok: false, msg: `Binance ${d.code}: ${d.msg}` });
    res.json({ ok: true, orders: d.orders || [] });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BINANCE FUTURES: probar TODAS las estrategias SL/TP ───────────────────────
// POST /api/binance/futures/try-sltp
// { apiKey, apiSecret, symbol, slSide, sl, tp, qty }
// Prueba 5 estrategias por SL y por TP. Devuelve qué funcionó.
// NUNCA para producción — solo para diagnosticar cuál strategy acepta la cuenta.
app.post("/api/binance/futures/try-sltp", async (req, res) => {
  const { apiKey, apiSecret, symbol, slSide, sl, tp, qty } = req.body;
  if (!apiKey || !apiSecret || !symbol || !slSide)
    return res.status(400).json({ ok: false, msg: "Faltan: apiKey, apiSecret, symbol, slSide" });

  const filters   = await getBnFuturesFilters(symbol);
  const roundQty  = (qty && filters) ? roundToStep(parseFloat(qty), filters.stepSize) : parseFloat(qty || 0);
  const roundSl   = (sl  && filters) ? roundToStep(parseFloat(sl),  filters.tickSize) : parseFloat(sl || 0);
  const roundTp   = (tp  && filters) ? roundToStep(parseFloat(tp),  filters.tickSize) : parseFloat(tp || 0);

  // Helper: construir y enviar una orden a Binance Futures (sin errores fatales)
  const tryOrder = async (params) => {
    try {
      const ts    = Date.now();
      const parts = Object.entries({ ...params, timestamp: ts }).map(([k, v]) => `${k}=${v}`);
      const qs    = parts.join("&");
      const sig   = signBinance(qs, apiSecret);
      const r = await pf("https://fapi.binance.com/fapi/v1/order", {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
        body: `${qs}&signature=${sig}`,
      });
      const d = await r.json();
      if (!r.ok || (d.code && d.code < 0)) return { ok: false, msg: `Binance ${d.code}: ${d.msg}`, orderId: null };
      return { ok: true, msg: "OK", orderId: d.orderId };
    } catch(e) { return { ok: false, msg: e.message, orderId: null }; }
  };

  // Cancelar una orden de test si fue creada (limpieza automática)
  const cancelOrder = async (orderId) => {
    if (!orderId) return;
    try {
      const ts   = Date.now();
      const qs   = `symbol=${symbol}&orderId=${orderId}&timestamp=${ts}`;
      const sig  = signBinance(qs, apiSecret);
      await pf(`https://fapi.binance.com/fapi/v1/order?${qs}&signature=${sig}`, {
        method: "DELETE", headers: { "X-MBX-APIKEY": apiKey }
      });
    } catch { /* ignorar error al cancelar */ }
  };

  const results = [];

  // ── SL strategies ─────────────────────────────────────────────────────────
  if (roundSl) {
    const slStrats = [
      { label:"SL-A: STOP_MARKET + closePosition=TRUE + MARK_PRICE",     params:{ symbol, side:slSide, type:"STOP_MARKET", stopPrice:roundSl, closePosition:"TRUE", workingType:"MARK_PRICE" } },
      { label:"SL-B: STOP_MARKET + closePosition=TRUE + CONTRACT_PRICE", params:{ symbol, side:slSide, type:"STOP_MARKET", stopPrice:roundSl, closePosition:"TRUE", workingType:"CONTRACT_PRICE" } },
      { label:"SL-C: STOP_MARKET + reduceOnly + qty + MARK_PRICE",       params:{ symbol, side:slSide, type:"STOP_MARKET", stopPrice:roundSl, reduceOnly:"true", quantity:roundQty, workingType:"MARK_PRICE" } },
      { label:"SL-D: STOP_MARKET + reduceOnly + qty + CONTRACT_PRICE",   params:{ symbol, side:slSide, type:"STOP_MARKET", stopPrice:roundSl, reduceOnly:"true", quantity:roundQty, workingType:"CONTRACT_PRICE" } },
      { label:"SL-E: STOP (Limit) + reduceOnly + qty + price offset",    params:{ symbol, side:slSide, type:"STOP", stopPrice:roundSl, price: parseFloat((roundSl * (slSide === "SELL" ? 0.998 : 1.002)).toFixed(filters?.tickSize?.toString().split(".")[1]?.length || 2)), reduceOnly:"true", quantity:roundQty, timeInForce:"GTC" } },
    ];
    for (const s of slStrats) {
      const r = await tryOrder(s.params);
      results.push({ type:"SL", label:s.label, ...r });
      if (r.ok) await cancelOrder(r.orderId); // limpiar orden de test
    }
  }

  // ── TP strategies ─────────────────────────────────────────────────────────
  if (roundTp) {
    const tpStrats = [
      { label:"TP-A: TAKE_PROFIT_MARKET + closePosition=TRUE + MARK_PRICE",     params:{ symbol, side:slSide, type:"TAKE_PROFIT_MARKET", stopPrice:roundTp, closePosition:"TRUE", workingType:"MARK_PRICE" } },
      { label:"TP-B: TAKE_PROFIT_MARKET + closePosition=TRUE + CONTRACT_PRICE", params:{ symbol, side:slSide, type:"TAKE_PROFIT_MARKET", stopPrice:roundTp, closePosition:"TRUE", workingType:"CONTRACT_PRICE" } },
      { label:"TP-C: TAKE_PROFIT_MARKET + reduceOnly + qty + MARK_PRICE",       params:{ symbol, side:slSide, type:"TAKE_PROFIT_MARKET", stopPrice:roundTp, reduceOnly:"true", quantity:roundQty, workingType:"MARK_PRICE" } },
      { label:"TP-D: TAKE_PROFIT_MARKET + reduceOnly + qty + CONTRACT_PRICE",   params:{ symbol, side:slSide, type:"TAKE_PROFIT_MARKET", stopPrice:roundTp, reduceOnly:"true", quantity:roundQty, workingType:"CONTRACT_PRICE" } },
      { label:"TP-E: TAKE_PROFIT (Limit) + reduceOnly + qty + price offset",    params:{ symbol, side:slSide, type:"TAKE_PROFIT", stopPrice:roundTp, price: parseFloat((roundTp * (slSide === "SELL" ? 0.998 : 1.002)).toFixed(filters?.tickSize?.toString().split(".")[1]?.length || 2)), reduceOnly:"true", quantity:roundQty, timeInForce:"GTC" } },
    ];
    for (const s of tpStrats) {
      const r = await tryOrder(s.params);
      results.push({ type:"TP", label:s.label, ...r });
      if (r.ok) await cancelOrder(r.orderId); // limpiar orden de test
    }
  }

  const worked  = results.filter(r => r.ok).map(r => r.label);
  const failed  = results.filter(r => !r.ok);
  res.json({ ok: worked.length > 0, worked, failed: failed.map(f => ({ label:f.label, msg:f.msg })), results });
});

// ── HYPERLIQUID: todos los mids ─────────────────────────────────────────────
app.post("/api/hyperliquid/mids", async (req, res) => {
  try {
    const r = await pf("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" })
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── HYPERLIQUID: metadata de assets (nombres reales) ───────────────────────
// Devuelve la lista completa con nombres — los numéricos son vault tokens
app.get("/api/hyperliquid/meta", async (req, res) => {
  try {
    const [metaRes, midsRes] = await Promise.all([
      pf("https://api.hyperliquid.xyz/info", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "meta" })
      }),
      pf("https://api.hyperliquid.xyz/info", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "allMids" })
      })
    ]);
    const meta = await metaRes.json();
    const mids = await midsRes.json();

    const universe = meta?.universe || [];
    const assets = universe.map(a => ({
      name:  a.name,
      price: mids[a.name] ? parseFloat(mids[a.name]).toFixed(4) : "0",
      isVault: /^\d+$/.test(a.name),  // nombre solo numerico = vault token
      maxLev: a.maxLeverage
    }));

    // También agregar los que están en mids pero no en universe
    Object.entries(mids).forEach(([k, v]) => {
      if (!assets.find(a => a.name === k)) {
        assets.push({ name: k, price: parseFloat(v).toFixed(4), isVault: false });
      }
    });

    res.json({ count: assets.length, assets });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── HYPERLIQUID: user state ─────────────────────────────────────────────────
app.post("/api/hyperliquid/user", async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Falta address" });
  try {
    const r = await pf("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: address })
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CoinGecko proxy (crypto) ─────────────────────────────────────────────────
app.get("/api/prices/crypto", async (req, res) => {
  const { ids } = req.query;
  try {
    const r = await pf(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CLP/USD rate — §2.3 múltiples fuentes seleccionables ────────────────────
// GET /api/clp-rate?source=dolarapi|binancep2p|exchangerate
// Fuente 1 (default): cl.dolarapi.com → promedio compra/venta
// Fuente 2: p2p.army Binance P2P
// Fuente 3 (fallback): api.exchangerate-api.com
app.get("/api/clp-rate", async (req, res) => {
  const source = req.query.source || "dolarapi";

  // Helper: fallback to exchangerate-api
  async function exchangeRateFallback() {
    try {
      const r = await pf("https://api.exchangerate-api.com/v4/latest/USD");
      if (r.ok) {
        const d = await r.json();
        const clp = d.rates?.CLP;
        if (clp) return { rate: clp, source: "exchangerate-api" };
      }
    } catch {}
    return null;
  }

  try {
    // Fuente 1: dolarapi.com (Chile)
    if (source === "dolarapi" || source === "default") {
      try {
        const r = await pf("https://cl.dolarapi.com/v1/cotizaciones/usd");
        if (r.ok) {
          const d = await r.json();
          if (d.compra && d.venta) {
            const rate = (d.compra + d.venta) / 2;
            return res.json({ rate, source: "dolarapi", ts: Date.now() });
          }
        }
      } catch {}
      // Fallback on dolarapi failure
      const fb = await exchangeRateFallback();
      if (fb) return res.json({ ...fb, ts: Date.now(), fallback: true });
    }

    // Fuente 2: Binance P2P via p2p.army
    if (source === "binancep2p") {
      try {
        const r = await pf("https://p2p.army/api/v1/prices?market=binance&fiatUnit=CLP&asset=USDT");
        if (r.ok) {
          const d = await r.json();
          // p2p.army returns array or object with price field
          const price = d?.price || d?.data?.[0]?.price || (Array.isArray(d) && d[0]?.price);
          if (price) return res.json({ rate: parseFloat(price), source: "binancep2p", ts: Date.now() });
        }
      } catch {}
      // Fallback
      const fb = await exchangeRateFallback();
      if (fb) return res.json({ ...fb, ts: Date.now(), fallback: true });
    }

    // Fuente 3: exchangerate-api (original)
    if (source === "exchangerate") {
      const fb = await exchangeRateFallback();
      if (fb) return res.json({ ...fb, ts: Date.now() });
    }

    res.status(500).json({ error: "No se pudo obtener CLP/USD" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GOOGLE SHEETS: push trades ───────────────────────────────────────────────
// Requiere setup previo (ver DOCS.md para instrucciones)
// npm install googleapis
app.post("/api/sheets/push", async (req, res) => {
  const { spreadsheetId, sheetName, rows, serviceAccountKey } = req.body;
  if (!spreadsheetId || !rows)
    return res.status(400).json({ error: "Falta spreadsheetId o rows" });
  try {
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName||"Trades"}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
    res.json({ ok: true, pushed: rows.length });
  } catch(e) {
    // googleapis no instalado todavía — instrucciones en DOCS.md
    if (e.code === "MODULE_NOT_FOUND")
      return res.status(503).json({ error: "Corré: npm install googleapis (ver DOCS.md)" });
    res.status(500).json({ error: e.message });
  }
});

// ── TELEGRAM: enviar mensaje ─────────────────────────────────────────────────
// POST /api/telegram/send  { token, chatId, text }
app.post("/api/telegram/send", async (req, res) => {
  const { token, chatId, text } = req.body;
  if (!token || !chatId || !text)
    return res.status(400).json({ ok: false, msg: "Falta token, chatId o text" });
  try {
    const r = await pf(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const d = await r.json();
    if (!d.ok) return res.json({ ok: false, msg: d.description });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BINANCE FUTURES: órdenes abiertas (signed) ────────────────────────────────
// POST /api/binance/futures/openOrders  { apiKey, apiSecret, symbol? }
app.post("/api/binance/futures/openOrders", async (req, res) => {
  const { apiKey, apiSecret, symbol } = req.body;
  if (!apiKey || !apiSecret) return res.status(400).json({ ok: false, msg: "Falta apiKey o apiSecret" });
  const ts  = Date.now();
  const qs  = symbol ? `symbol=${symbol}&timestamp=${ts}` : `timestamp=${ts}`;
  const sig = signBinance(qs, apiSecret);
  try {
    const r = await pf(`https://fapi.binance.com/fapi/v1/openOrders?${qs}&signature=${sig}`,
      { headers: { "X-MBX-APIKEY": apiKey } });
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0)) return res.json({ ok: false, msg: d.msg || `HTTP ${r.status}` });
    res.json({ ok: true, orders: d });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BINANCE FUTURES: cancelar orden (signed) ──────────────────────────────────
// POST /api/binance/futures/cancelOrder  { apiKey, apiSecret, symbol, orderId }
app.post("/api/binance/futures/cancelOrder", async (req, res) => {
  const { apiKey, apiSecret, symbol, orderId } = req.body;
  if (!apiKey || !apiSecret || !symbol || !orderId)
    return res.status(400).json({ ok: false, msg: "Falta apiKey, apiSecret, symbol u orderId" });
  const ts  = Date.now();
  const qs  = `symbol=${symbol}&orderId=${orderId}&timestamp=${ts}`;
  const sig = signBinance(qs, apiSecret);
  try {
    const r = await pf("https://fapi.binance.com/fapi/v1/order", {
      method: "DELETE",
      headers: { "X-MBX-APIKEY": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: `${qs}&signature=${sig}`,
    });
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0)) return res.json({ ok: false, msg: d.msg || `HTTP ${r.status}` });
    res.json({ ok: true, order: d });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BINANCE FUTURES: posiciones activas (positionRisk) ──────────────────────
// Market orders ejecutadas → aparecen aquí, NO en openOrders
// POST /api/binance/futures/positions  { apiKey, apiSecret }
app.post("/api/binance/futures/positions", async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) return res.status(400).json({ ok: false, msg: "Falta apiKey o apiSecret" });
  const ts  = Date.now();
  const qs  = `timestamp=${ts}`;
  const sig = signBinance(qs, apiSecret);
  try {
    const r = await pf(`https://fapi.binance.com/fapi/v2/positionRisk?${qs}&signature=${sig}`,
      { headers: { "X-MBX-APIKEY": apiKey } });
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0)) return res.json({ ok: false, msg: d.msg || `HTTP ${r.status}` });
    // Filtrar solo posiciones con qty != 0
    const active = (Array.isArray(d) ? d : []).filter(p => parseFloat(p.positionAmt) !== 0);
    res.json({ ok: true, positions: active });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── Yahoo Finance: stocks (NVDA, MELI, AAPL, etc.) ──────────────────────────
// GET /api/prices/stock?symbol=NVDA
app.get("/api/prices/stock", async (req, res) => {
  const sym = (req.query.symbol || "").toUpperCase();
  if (!sym) return res.status(400).json({ ok: false, msg: "Falta symbol" });
  try {
    const r = await pf(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const d = await r.json();
    const meta  = d?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!price) return res.json({ ok: false, msg: `No se encontró precio para ${sym} en Yahoo Finance` });
    const change = meta?.regularMarketChangePercent ?? null;
    res.json({ ok: true, symbol: sym, price, change24h: change });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── Yahoo Finance: commodities (OIL, GOLD, SILVER, etc.) ────────────────────
// GET /api/prices/commodity?symbol=OIL
const YAHOO_MAP = { OIL:"CL=F", GOLD:"GC=F", SILVER:"SI=F", GAS:"NG=F", WHEAT:"ZW=F" };
app.get("/api/prices/commodity", async (req, res) => {
  const sym = (req.query.symbol || "").toUpperCase();
  const yahooSym = YAHOO_MAP[sym];
  if (!yahooSym) return res.status(400).json({ ok: false, msg: `Símbolo desconocido: ${sym}. Disponibles: ${Object.keys(YAHOO_MAP).join(",")}` });
  try {
    const r = await pf(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const d = await r.json();
    const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!price) return res.json({ ok: false, msg: "No se pudo obtener precio desde Yahoo Finance" });
    res.json({ ok: true, symbol: sym, yahooSymbol: yahooSym, price });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BINANCE FUTURES: cerrar posición activa (reduceOnly market) ───────────────
// POST /api/binance/futures/closePosition  { apiKey, apiSecret, symbol, side, qty }
// side = SELL para Long, BUY para Short
app.post("/api/binance/futures/closePosition", async (req, res) => {
  const { apiKey, apiSecret, symbol, side, qty } = req.body;
  if (!apiKey || !apiSecret || !symbol || !side || !qty)
    return res.status(400).json({ ok: false, msg: "Faltan: apiKey, apiSecret, symbol, side, qty" });

  // Paso 1: obtener uPnL actual antes de cerrar
  let estimatedPnl = 0;
  try {
    const ts1  = Date.now();
    const qs1  = `symbol=${symbol}&timestamp=${ts1}`;
    const sig1 = signBinance(qs1, apiSecret);
    const pr   = await pf(`https://fapi.binance.com/fapi/v2/positionRisk?${qs1}&signature=${sig1}`,
      { headers: { "X-MBX-APIKEY": apiKey } });
    const pd = await pr.json();
    if (Array.isArray(pd) && pd.length > 0)
      estimatedPnl = parseFloat(pd[0].unRealizedProfit || 0);
  } catch { /* continuar aunque falle — lo importante es cerrar */ }

  // Paso 2: colocar orden de cierre (MARKET reduceOnly)
  const ts    = Date.now();
  const parts = [
    `symbol=${symbol}`,
    `side=${side}`,
    `type=MARKET`,
    `quantity=${qty}`,
    `reduceOnly=true`,
    `timestamp=${ts}`,
  ];
  const qs  = parts.join("&");
  const sig = signBinance(qs, apiSecret);
  try {
    const r = await pf("https://fapi.binance.com/fapi/v1/order", {
      method:  "POST",
      headers: { "X-MBX-APIKEY": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body:    `${qs}&signature=${sig}`,
    });
    const d = await r.json();
    if (!r.ok || (d.code && d.code < 0))
      return res.json({ ok: false, msg: d.msg || `Binance ${d.code}` });
    res.json({ ok: true, order: d, pnl: estimatedPnl });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── PostgreSQL: CRUD de trades ────────────────────────────────────────────────
// npm install pg
// Requiere BD corriendo — ver db-setup.sql y DOCS.md
let pgPool    = null;
let pgCfgKey  = null;

function sanitizePgCfg(cfg) {
  const base = {
    host:     cfg.host     || "localhost",
    port:     parseInt(cfg.port, 10) || 5432,
    database: cfg.database || "trading_fw",
    user:     cfg.user     || "postgres",
    // empty string → undefined: evita error SASL "client password must be a string"
    password: cfg.password ? String(cfg.password) : undefined,
  };
  // SSL automático para Supabase y otras BDs cloud (o si el usuario activa ssl:true)
  const isCloud = cfg.ssl || (cfg.host && (
    cfg.host.includes("supabase") || cfg.host.includes("neon") ||
    cfg.host.includes("railway")  || cfg.host.includes("render")
  ));
  if (isCloud) {
    base.ssl = { rejectUnauthorized: false };
    base.options = "-c search_path=public"; // Supabase pooler requiere esto
  }
  return base;
}

function getPool(cfg) {
  const sanitized = sanitizePgCfg(cfg);
  const key = JSON.stringify(sanitized);
  if (pgPool && pgCfgKey === key) return pgPool;
  // Config cambió o primera vez — destruir pool anterior y crear uno nuevo
  if (pgPool) { pgPool.end().catch(() => {}); pgPool = null; }
  try {
    const { Pool } = require("pg");
    pgPool   = new Pool(sanitized);
    pgCfgKey = key;
    return pgPool;
  } catch { return null; }
}

app.post("/api/db/query", async (req, res) => {
  const { config, sql, params } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado — corré: npm install pg" });
  try {
    const result = await pool.query(sql, params || []);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DB: migrar trades desde localStorage (bulk insert con deduplicación) ──────
// POST /api/db/migrate-trades  { config, trades: [...] }
app.post("/api/db/migrate-trades", async (req, res) => {
  const { config, trades } = req.body;
  if (!Array.isArray(trades) || !trades.length)
    return res.status(400).json({ error: "Se esperaba array 'trades' no vacío" });
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado — corré: npm install pg" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;
    for (const t of trades) {
      const r = await client.query(
        `INSERT INTO trades (local_id, date, asset, type, account, entry, sl, tp, leverage, order_type, outcome, pnl, source, reasoning, anomaly, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (local_id) DO NOTHING`,
        [
          t.id || null,
          t.date || null,
          t.asset,
          t.type,
          t.account || null,
          t.entry || null,
          t.sl || null,
          t.tp || null,
          t.leverage || 1,
          t.orderType || "Market",
          t.outcome || null,
          t.pnl || 0,
          t.source || null,
          t.reasoning || null,
          t.anomaly || false,
          t.closedAt || null,
        ]
      );
      if (r.rowCount > 0) inserted++;
    }
    await client.query("COMMIT");
    res.json({ ok: true, inserted, total: trades.length });
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── DB: listar trades paginado (excluye soft-deleted) ────────────────────────
// POST /api/db/trades  { config, limit, offset }
app.post("/api/db/trades", async (req, res) => {
  const { config, limit = 20, offset = 0 } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const [rows, cnt] = await Promise.all([
      pool.query("SELECT * FROM trades WHERE deleted_at IS NULL ORDER BY COALESCE(closed_at, created_at) DESC LIMIT $1 OFFSET $2", [limit, offset]),
      pool.query("SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL"),
    ]);
    res.json({ rows: rows.rows, total: parseInt(cnt.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DB: actualizar trade por id ───────────────────────────────────────────────
// PUT /api/db/trades/:id  { config, fields: { date, asset, ... } }
const TRADE_EDITABLE = ["date","asset","type","account","entry","sl","tp","leverage","order_type","outcome","pnl","source","reasoning","closed_at"];
app.put("/api/db/trades/:id", async (req, res) => {
  const { config, fields } = req.body;
  const { id } = req.params;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  const keys = Object.keys(fields || {}).filter(k => TRADE_EDITABLE.includes(k));
  if (!keys.length) return res.status(400).json({ error: "No hay campos válidos para actualizar" });
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const vals = keys.map(k => fields[k]);
  try {
    await pool.query(`UPDATE trades SET ${setClause} WHERE id = $${keys.length + 1}`, [...vals, id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DB: soft delete trade ─────────────────────────────────────────────────────
// DELETE /api/db/trades/:id  { config }
// Soft delete: marca deleted_at con timestamp actual, nunca borra el row
app.delete("/api/db/trades/:id", async (req, res) => {
  const { config } = req.body;
  const { id } = req.params;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    await pool.query("UPDATE trades SET deleted_at = NOW() WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DB: migración de schema (ALTER TABLE sin recrear la BD) ───────────────────
// POST /api/db/migrate-schema  { config }
// Idempotente: usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
app.post("/api/db/migrate-schema", async (req, res) => {
  const { config } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  const migrations = [
    "ALTER TABLE trades ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
    "ALTER TABLE trades ADD COLUMN IF NOT EXISTS bn_order_id VARCHAR(50)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_bn_order_id ON trades(bn_order_id) WHERE bn_order_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_trades_deleted_at ON trades(deleted_at)",
  ];
  const results = [];
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      results.push({ sql: sql.slice(0, 60), ok: true });
    } catch(e) {
      results.push({ sql: sql.slice(0, 60), ok: false, error: e.message });
    }
  }
  res.json({ ok: true, results });
});

// ── DB: listar trades (excluye soft-deleted) ──────────────────────────────────
// POST /api/db/trades/list  { config, limit, offset }  (alias para evitar conflicto con el PUT)
app.post("/api/db/trades/list", async (req, res) => {
  const { config, limit = 20, offset = 0 } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const [rows, cnt] = await Promise.all([
      pool.query("SELECT * FROM trades WHERE deleted_at IS NULL ORDER BY COALESCE(closed_at, created_at) DESC LIMIT $1 OFFSET $2", [limit, offset]),
      pool.query("SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL"),
    ]);
    res.json({ rows: rows.rows, total: parseInt(cnt.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BINANCE FUTURES: historial de trades → posiciones reconciliadas ───────────
// POST /api/binance/futures/tradeHistory
//   { apiKey, apiSecret, symbol, startTime?, endTime? }
//
// Estrategia:
//   1. userTrades     → fills para dirección, qty, entry price y positionTracking
//   2. income COMMISSION → fees en USDT (independiente del asset, ya convertido)
//   3. income FUNDING_FEE → fee de financiamiento del período
//   4. Tracking de qty: agrega cierres parciales de la misma posición en 1 entrada
//      (ej: LITUSDT cerrado en 2 órdenes → 1 posición, igual que Position History)
//
// PnL final = Closing PnL + Trading Fee (COMMISSION) + Funding Fee proporcional
app.post("/api/binance/futures/tradeHistory", async (req, res) => {
  const { apiKey, apiSecret, symbol, startTime, endTime } = req.body;
  if (!apiKey || !apiSecret) return res.status(400).json({ ok: false, msg: "Falta apiKey o apiSecret" });
  if (!symbol) return res.status(400).json({ ok: false, msg: "Binance requiere symbol (ej: BTCUSDT). Ingresá el par exacto." });

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const start = startTime || (Date.now() - SEVEN_DAYS);
  const end   = endTime   || Date.now();

  const windows = [];
  let wStart = start;
  while (wStart < end) {
    windows.push({ wStart, wEnd: Math.min(wStart + SEVEN_DAYS - 1, end) });
    wStart = Math.min(wStart + SEVEN_DAYS - 1, end) + 1;
  }

  // Helper: fetch Binance signed endpoint con paginación por ventanas
  async function bnFetch(path, extraParams, allWindows) {
    const out = [];
    for (const { wStart: ws, wEnd: we } of allWindows) {
      const ts  = Date.now();
      const qs  = [...extraParams, `startTime=${ws}`, `endTime=${we}`, `timestamp=${ts}`].join("&");
      const sig = signBinance(qs, apiSecret);
      const r   = await pf(`https://fapi.binance.com${path}?${qs}&signature=${sig}`,
        { headers: { "X-MBX-APIKEY": apiKey } });
      const d   = await r.json();
      if (!r.ok || (d.code && d.code < 0)) throw new Error(d.msg || `HTTP ${r.status}`);
      out.push(...(Array.isArray(d) ? d : []));
    }
    return out;
  }

  try {
    const asset = symbol.replace(/USDT$/i, "");

    // 1. Fills de userTrades
    const fills = await bnFetch("/fapi/v1/userTrades",
      [`symbol=${symbol}`, "limit=1000"], windows);

    // 2. Commissions desde income (en USDT, ya convertidas por Binance)
    let incomeComm = [];
    try {
      incomeComm = await bnFetch("/fapi/v1/income",
        [`symbol=${symbol}`, "incomeType=COMMISSION", "limit=1000"], windows);
    } catch { /* tolerar si la cuenta no tiene permisos de income */ }

    // 3. Funding fees desde income (en USDT)
    let incomeFunding = [];
    try {
      incomeFunding = await bnFetch("/fapi/v1/income",
        [`symbol=${symbol}`, "incomeType=FUNDING_FEE", "limit=1000"], windows);
    } catch { /* tolerar */ }

    // Mapas de fee por orderId (COMMISSION) y lista de funding con timestamp
    const commByOrder = {};
    for (const e of incomeComm) {
      const oid = String(e.info);
      commByOrder[oid] = (commByOrder[oid] || 0) + parseFloat(e.income || 0); // negativo
    }
    const fundingList = incomeFunding.map(e => ({
      time: parseInt(e.time),
      amount: parseFloat(e.income || 0),
    }));
    const totalFunding = fundingList.reduce((s, f) => s + f.amount, 0);

    // 4. Agrupar fills por orderId — incluir commission directamente de los fills
    const byOrder = {};
    for (const f of fills) {
      const oid = String(f.orderId);
      if (!byOrder[oid]) {
        byOrder[oid] = { oid, buyer: f.buyer, price: parseFloat(f.price), time: f.time,
                         qty: 0, realizedPnl: 0, commission: 0, commAsset: f.commissionAsset };
      }
      byOrder[oid].qty         += parseFloat(f.qty);
      byOrder[oid].realizedPnl += parseFloat(f.realizedPnl || 0);
      byOrder[oid].commission  += parseFloat(f.commission  || 0);
      byOrder[oid].commAsset    = f.commissionAsset; // mismo asset en todos los fills de una orden
    }

    // Helper: fee en USDT para una orden. Prioriza commission directa de fills (USDT)
    // para no depender de income API (puede fallar silenciosamente).
    // Para accounts BNB, income API (commByOrder) ya devuelve el valor negativo en USDT.
    const getCommUSDT = (ord) => {
      if (ord.commAsset === "USDT") return -(ord.commission || 0); // negativo = costo
      return commByOrder[ord.oid] || 0;                             // income API fallback
    };

    // 5. Position tracking: agrega cierres parciales de la misma posición
    //    isClose se determina por dirección relativa a curPos (no por realizedPnl)
    //    → funciona incluso en trades breakeven (realizedPnl exactamente 0)
    //    Si no hay curPos (sin posición abierta), se usa realizedPnl para detectar
    //    cierres huérfanos (posición abierta antes del período consultado).
    //    Cuando closedQty >= openQty → posición completamente cerrada → 1 entrada
    const allOrders = Object.values(byOrder).sort((a, b) => a.time - b.time);
    const positions = [];
    let curPos = null, openQty = 0, closedQty = 0;

    for (const ord of allOrders) {
      // Dirección opuesta a la posición actual = cierre (Long+SELL, Short+BUY)
      // Fallback a realizedPnl sólo cuando no hay posición abierta (cierres huérfanos)
      const isClose = curPos
        ? (curPos.type === "Long" ? !ord.buyer : ord.buyer)
        : Math.abs(ord.realizedPnl) > 0.0001;

      if (!isClose) {
        // Orden de apertura — incluir fee de apertura en el PnL
        openQty += ord.qty;
        const openComm = getCommUSDT(ord);
        if (!curPos) {
          curPos = {
            // buyer=true en apertura → LONG; buyer=false → SHORT
            type: ord.buyer ? "Long" : "Short",
            entry: ord.price, openTime: ord.time,
            pnl: openComm, firstOid: null, closeTime: null,
          };
        } else {
          // Apertura adicional (add-to-position)
          curPos.pnl += openComm;
        }
      } else {
        // Orden de cierre
        if (!curPos) {
          // Cierre huérfano: la apertura fue antes del período consultado
          // buyer=false en cierre → cerrando LONG; buyer=true → cerrando SHORT
          curPos = {
            type: ord.buyer ? "Short" : "Long",
            entry: ord.price, openTime: ord.time,
            pnl: 0, firstOid: null, closeTime: null,
          };
          openQty = ord.qty; // asumir fully closed
        }
        closedQty += ord.qty;
        const comm = getCommUSDT(ord);
        curPos.pnl      += ord.realizedPnl + comm;
        curPos.closeTime = ord.time;
        if (!curPos.firstOid) curPos.firstOid = ord.oid;

        // Posición totalmente cerrada cuando closedQty ≈ openQty
        const diff = Math.abs(closedQty - openQty);
        if (diff < Math.max(openQty * 0.001, 0.0001)) {
          // Sumar funding fees que ocurrieron durante esta posición
          const fundingForPos = fundingList
            .filter(f => f.time >= curPos.openTime && f.time <= (curPos.closeTime || Date.now()))
            .reduce((s, f) => s + f.amount, 0);
          const pnlNet = parseFloat((curPos.pnl + fundingForPos).toFixed(4));
          positions.push({
            bn_order_id: curPos.firstOid,
            asset,
            type:       curPos.type,
            entry:      curPos.entry,
            pnl:        pnlNet,
            qty:        parseFloat(closedQty.toFixed(8)),
            date:       new Date(curPos.openTime).toISOString().split("T")[0],
            closed_at:  new Date(curPos.closeTime).toISOString(),
            order_type: "Market",
            source:     "S/E",
            outcome:    pnlNet > 0 ? "WIN" : pnlNet < 0 ? "LOSS" : "BE",
          });
          curPos = null; openQty = 0; closedQty = 0;
        }
      }
    }

    res.json({ ok: true, trades: positions, windows: windows.length, funding_period: parseFloat(totalFunding.toFixed(4)) });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── DB: importar trades de Binance con deduplicación por bn_order_id ──────────
// POST /api/db/import-bn-trades  { config, trades: [...] }
// trades: array de objetos mapeados desde Binance userTrades
app.post("/api/db/import-bn-trades", async (req, res) => {
  const { config, trades } = req.body;
  if (!Array.isArray(trades) || !trades.length)
    return res.status(400).json({ error: "Se esperaba array 'trades' no vacío" });
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0, skipped = 0;
    for (const t of trades) {
      const r = await client.query(
        `INSERT INTO trades (bn_order_id, date, asset, type, account, entry, sl, tp, leverage, order_type, outcome, pnl, source, reasoning, anomaly, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (bn_order_id) WHERE bn_order_id IS NOT NULL DO NOTHING`,
        [
          t.bn_order_id || null,
          t.date || null,
          t.asset,
          t.type || "Long",
          t.account || null,
          t.entry || null,
          t.sl || null,
          t.tp || null,
          t.leverage || 1,
          t.order_type || "Market",
          t.outcome || null,
          t.pnl || 0,
          t.source || "S/E",
          t.reasoning || null,
          t.anomaly || false,
          t.closed_at || null,
        ]
      );
      if (r.rowCount > 0) inserted++; else skipped++;
    }
    await client.query("COMMIT");
    res.json({ ok: true, inserted, skipped, total: trades.length });
  } catch(e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── DB: borrar todos los trades importados desde Binance ──────────────────────
// POST /api/db/clear-bn-trades  { config }
// Hard-delete todos los registros con bn_order_id IS NOT NULL.
// Usar antes de reimportar con el motor corregido.
app.post("/api/db/clear-bn-trades", async (req, res) => {
  const { config } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ ok: false, msg: "pg no instalado" });
  const client = await pool.connect();
  try {
    const r = await client.query(
      `DELETE FROM trades WHERE bn_order_id IS NOT NULL`
    );
    res.json({ ok: true, deleted: r.rowCount });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
  finally { client.release(); }
});

// ── DB: migrar todo de local a cloud (Supabase) ───────────────────────────────
// POST /api/db/migrate-to-cloud  { localConfig, cloudConfig }
// Copia trades, gastos, gasto_categorias, gasto_config de local → cloud
// Usa ON CONFLICT DO NOTHING para no duplicar. IDs serial se omiten (cloud asigna nuevos).
app.post("/api/db/migrate-to-cloud", async (req, res) => {
  const { localConfig, cloudConfig } = req.body;
  const { Pool } = require("pg");
  const localPool = new Pool(sanitizePgCfg(localConfig));
  const cloudPool = new Pool(sanitizePgCfg(cloudConfig));
  const results = {};
  try {
    // ── trades ──────────────────────────────────────────────────────────────
    const trades = (await localPool.query("SELECT * FROM trades WHERE deleted_at IS NULL")).rows;
    let tIns = 0;
    for (const t of trades) {
      try {
        const r = await cloudPool.query(
          `INSERT INTO trades (local_id,bn_order_id,date,asset,type,account,entry,sl,tp,leverage,order_type,outcome,pnl,pnl_r,source,reasoning,anomaly,closed_at,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (local_id) DO NOTHING`,
          [t.local_id,t.bn_order_id,t.date,t.asset,t.type,t.account,t.entry,t.sl,t.tp,
           t.leverage,t.order_type,t.outcome,t.pnl,t.pnl_r,t.source,t.reasoning,t.anomaly,
           t.closed_at,t.created_at]
        );
        if (r.rowCount > 0) tIns++;
        else if (!t.local_id && t.bn_order_id) {
          // fallback: dedup por bn_order_id para trades de Binance sin local_id
          const r2 = await cloudPool.query(
            `INSERT INTO trades (local_id,bn_order_id,date,asset,type,account,entry,sl,tp,leverage,order_type,outcome,pnl,pnl_r,source,reasoning,anomaly,closed_at,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             ON CONFLICT (bn_order_id) DO NOTHING`,
            [t.local_id,t.bn_order_id,t.date,t.asset,t.type,t.account,t.entry,t.sl,t.tp,
             t.leverage,t.order_type,t.outcome,t.pnl,t.pnl_r,t.source,t.reasoning,t.anomaly,
             t.closed_at,t.created_at]
          );
          if (r2.rowCount > 0) tIns++;
        }
      } catch { /* skip row on error */ }
    }
    results.trades = { total: trades.length, inserted: tIns };

    // ── gasto_categorias ─────────────────────────────────────────────────────
    const cats = (await localPool.query("SELECT nombre, icono, orden FROM gasto_categorias")).rows;
    let cIns = 0;
    for (const c of cats) {
      try {
        const r = await cloudPool.query(
          `INSERT INTO gasto_categorias (nombre,icono,orden) VALUES ($1,$2,$3) ON CONFLICT (nombre) DO NOTHING`,
          [c.nombre, c.icono, c.orden]
        );
        if (r.rowCount > 0) cIns++;
      } catch { /* skip */ }
    }
    results.gasto_categorias = { total: cats.length, inserted: cIns };

    // ── gasto_config ─────────────────────────────────────────────────────────
    const cfgs = (await localPool.query("SELECT tipo, nombre, orden FROM gasto_config")).rows;
    let cfgIns = 0;
    for (const c of cfgs) {
      try {
        const r = await cloudPool.query(
          `INSERT INTO gasto_config (tipo,nombre,orden) VALUES ($1,$2,$3) ON CONFLICT (tipo,nombre) DO NOTHING`,
          [c.tipo, c.nombre, c.orden]
        );
        if (r.rowCount > 0) cfgIns++;
      } catch { /* skip */ }
    }
    results.gasto_config = { total: cfgs.length, inserted: cfgIns };

    // ── gastos ───────────────────────────────────────────────────────────────
    const gastos = (await localPool.query("SELECT * FROM gastos WHERE deleted_at IS NULL ORDER BY fecha, created_at")).rows;
    let gIns = 0;
    for (const g of gastos) {
      try {
        await cloudPool.query(
          `INSERT INTO gastos (fecha,importe,moneda,concepto,entidad,nombre_producto,tipo_movimiento,categoria,nota,usd_equiv,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [g.fecha,g.importe,g.moneda,g.concepto,g.entidad,g.nombre_producto,
           g.tipo_movimiento,g.categoria,g.nota,g.usd_equiv,g.created_at]
        );
        gIns++;
      } catch { /* skip */ }
    }
    results.gastos = { total: gastos.length, inserted: gIns };

    res.json({ ok: true, results });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    await localPool.end().catch(() => {});
    await cloudPool.end().catch(() => {});
  }
});

// ── DB: backup cloud → local ──────────────────────────────────────────────────
// POST /api/db/backup-from-cloud  { localConfig, cloudConfig }
// Copia trades, gastos, gasto_categorias, gasto_config de Supabase → local
// Mismo mecanismo que migrate-to-cloud pero en sentido inverso.
app.post("/api/db/backup-from-cloud", async (req, res) => {
  const { localConfig, cloudConfig } = req.body;
  const { Pool } = require("pg");
  const localPool = new Pool(sanitizePgCfg(localConfig));
  const cloudPool = new Pool(sanitizePgCfg(cloudConfig));
  const results = {};
  try {
    // ── trades ──────────────────────────────────────────────────────────────
    const trades = (await cloudPool.query("SELECT * FROM trades WHERE deleted_at IS NULL")).rows;
    let tIns = 0;
    for (const t of trades) {
      try {
        const r = await localPool.query(
          `INSERT INTO trades (local_id,bn_order_id,date,asset,type,account,entry,sl,tp,leverage,order_type,outcome,pnl,pnl_r,source,reasoning,anomaly,closed_at,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (local_id) DO NOTHING`,
          [t.local_id,t.bn_order_id,t.date,t.asset,t.type,t.account,t.entry,t.sl,t.tp,
           t.leverage,t.order_type,t.outcome,t.pnl,t.pnl_r,t.source,t.reasoning,t.anomaly,
           t.closed_at,t.created_at]
        );
        if (r.rowCount > 0) tIns++;
        else if (!t.local_id && t.bn_order_id) {
          const r2 = await localPool.query(
            `INSERT INTO trades (local_id,bn_order_id,date,asset,type,account,entry,sl,tp,leverage,order_type,outcome,pnl,pnl_r,source,reasoning,anomaly,closed_at,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             ON CONFLICT (bn_order_id) DO NOTHING`,
            [t.local_id,t.bn_order_id,t.date,t.asset,t.type,t.account,t.entry,t.sl,t.tp,
             t.leverage,t.order_type,t.outcome,t.pnl,t.pnl_r,t.source,t.reasoning,t.anomaly,
             t.closed_at,t.created_at]
          );
          if (r2.rowCount > 0) tIns++;
        }
      } catch { /* skip */ }
    }
    results.trades = { total: trades.length, inserted: tIns };

    // ── gasto_categorias ─────────────────────────────────────────────────────
    const cats = (await cloudPool.query("SELECT nombre, icono, orden FROM gasto_categorias")).rows;
    let cIns = 0;
    for (const c of cats) {
      try {
        const r = await localPool.query(
          `INSERT INTO gasto_categorias (nombre,icono,orden) VALUES ($1,$2,$3) ON CONFLICT (nombre) DO NOTHING`,
          [c.nombre, c.icono, c.orden]
        );
        if (r.rowCount > 0) cIns++;
      } catch { /* skip */ }
    }
    results.gasto_categorias = { total: cats.length, inserted: cIns };

    // ── gasto_config ─────────────────────────────────────────────────────────
    const cfgs = (await cloudPool.query("SELECT tipo, nombre, orden FROM gasto_config")).rows;
    let cfgIns = 0;
    for (const c of cfgs) {
      try {
        const r = await localPool.query(
          `INSERT INTO gasto_config (tipo,nombre,orden) VALUES ($1,$2,$3) ON CONFLICT (tipo,nombre) DO NOTHING`,
          [c.tipo, c.nombre, c.orden]
        );
        if (r.rowCount > 0) cfgIns++;
      } catch { /* skip */ }
    }
    results.gasto_config = { total: cfgs.length, inserted: cfgIns };

    // ── gastos ───────────────────────────────────────────────────────────────
    const gastos = (await cloudPool.query("SELECT * FROM gastos WHERE deleted_at IS NULL ORDER BY fecha, created_at")).rows;
    let gIns = 0;
    for (const g of gastos) {
      try {
        await localPool.query(
          `INSERT INTO gastos (fecha,importe,moneda,concepto,entidad,nombre_producto,tipo_movimiento,categoria,nota,usd_equiv,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [g.fecha,g.importe,g.moneda,g.concepto,g.entidad,g.nombre_producto,
           g.tipo_movimiento,g.categoria,g.nota,g.usd_equiv,g.created_at]
        );
        gIns++;
      } catch { /* skip */ }
    }
    results.gastos = { total: gastos.length, inserted: gIns };

    res.json({ ok: true, results });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    await localPool.end().catch(() => {});
    await cloudPool.end().catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO GASTOS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Migrar schema de gastos (idempotente) ─────────────────────────────────────
// POST /api/gastos/migrate-schema  { config }
app.post("/api/gastos/migrate-schema", async (req, res) => {
  const { config } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gasto_categorias (
        id        BIGSERIAL PRIMARY KEY,
        nombre    VARCHAR(100) NOT NULL UNIQUE,
        icono     VARCHAR(10)  DEFAULT '💰',
        orden     INT          DEFAULT 0,
        created_at TIMESTAMP  DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gasto_config (
        id     BIGSERIAL PRIMARY KEY,
        tipo   VARCHAR(50)  NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        orden  INT          DEFAULT 0,
        UNIQUE(tipo, nombre)
      );
      CREATE TABLE IF NOT EXISTS gastos (
        id               BIGSERIAL PRIMARY KEY,
        fecha            DATE           NOT NULL,
        importe          DECIMAL(12,2)  NOT NULL,
        moneda           VARCHAR(10)    NOT NULL DEFAULT 'CLP',
        concepto         TEXT,
        entidad          VARCHAR(100),
        nombre_producto  VARCHAR(100),
        tipo_movimiento  VARCHAR(50)    NOT NULL DEFAULT 'Gasto',
        categoria        VARCHAR(100)   NOT NULL,
        nota             VARCHAR(255),
        usd_equiv        DECIMAL(12,4),
        created_at       TIMESTAMP      DEFAULT NOW(),
        deleted_at       TIMESTAMP      DEFAULT NULL
      );
    `);
    // Insertar categorías por defecto si la tabla está vacía
    const cnt = await client.query("SELECT COUNT(*) FROM gasto_categorias");
    if (parseInt(cnt.rows[0].count) === 0) {
      const cats = [
        ["Alimentación","🍔",1], ["Transporte","🚗",2], ["Arriendo","🏠",3],
        ["Salud","🏥",4], ["Entretenimiento","🎬",5], ["Tecnología","💻",6],
        ["Deuda","💳",7], ["Educación","📚",8], ["Ropa","👕",9], ["Otro","📦",10]
      ];
      for (const [nombre, icono, orden] of cats)
        await client.query("INSERT INTO gasto_categorias (nombre,icono,orden) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [nombre,icono,orden]);
    }
    // Insertar config por defecto si la tabla está vacía
    const cntCfg = await client.query("SELECT COUNT(*) FROM gasto_config");
    if (parseInt(cntCfg.rows[0].count) === 0) {
      const defaults = [
        ["tipo_movimiento","Gasto",1], ["tipo_movimiento","Ingreso",2], ["tipo_movimiento","No computable",3],
        ["entidad","Itaú",1], ["entidad","Scotiabank",2], ["entidad","Tenpo",3],
        ["producto","Tarjeta Mastercard Tenpo",1], ["producto","Tarjeta BCI Black",2], ["producto","Efectivo",3],
      ];
      for (const [tipo, nombre, orden] of defaults)
        await client.query("INSERT INTO gasto_config (tipo,nombre,orden) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [tipo,nombre,orden]);
    }
    res.json({ ok: true, msg: "Schema gastos creado/verificado" });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── Categorías: listar ────────────────────────────────────────────────────────
// GET /api/gastos/categorias?host=...&port=...&database=...&user=...&password=...
app.get("/api/gastos/categorias", async (req, res) => {
  const pool = getPool(req.query);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const r = await pool.query("SELECT * FROM gasto_categorias ORDER BY orden, nombre");
    res.json({ ok: true, rows: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Categorías: crear ─────────────────────────────────────────────────────────
// POST /api/gastos/categorias  { config, nombre, icono }
app.post("/api/gastos/categorias", async (req, res) => {
  const { config, nombre, icono = "📦" } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: "nombre requerido" });
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const r = await pool.query(
      "INSERT INTO gasto_categorias (nombre, icono) VALUES ($1,$2) RETURNING *",
      [nombre.trim(), icono]
    );
    res.json({ ok: true, row: r.rows[0] });
  } catch(e) {
    if (e.code === "23505") return res.status(409).json({ error: "Categoría ya existe" });
    res.status(500).json({ error: e.message });
  }
});

// ── Categorías: eliminar ──────────────────────────────────────────────────────
// DELETE /api/gastos/categorias/:id  body: { config }
app.delete("/api/gastos/categorias/:id", async (req, res) => {
  const { config } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    await pool.query("DELETE FROM gasto_categorias WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Config gastos: listar por tipo ───────────────────────────────────────────
// GET /api/gastos/config?tipo=tipo_movimiento&host=...
app.get("/api/gastos/config", async (req, res) => {
  const { tipo, ...dbParams } = req.query;
  const pool = getPool(dbParams);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const q = tipo
      ? pool.query("SELECT * FROM gasto_config WHERE tipo=$1 ORDER BY orden,nombre", [tipo])
      : pool.query("SELECT * FROM gasto_config ORDER BY tipo,orden,nombre");
    const r = await q;
    res.json({ ok: true, rows: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Config gastos: crear ──────────────────────────────────────────────────────
// POST /api/gastos/config  { config, tipo, nombre }
app.post("/api/gastos/config", async (req, res) => {
  const { config, tipo, nombre } = req.body;
  if (!tipo || !nombre?.trim()) return res.status(400).json({ error: "tipo y nombre requeridos" });
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const r = await pool.query(
      "INSERT INTO gasto_config (tipo, nombre) VALUES ($1,$2) RETURNING *",
      [tipo, nombre.trim()]
    );
    res.json({ ok: true, row: r.rows[0] });
  } catch(e) {
    if (e.code === "23505") return res.status(409).json({ error: "Ya existe" });
    res.status(500).json({ error: e.message });
  }
});

// ── Config gastos: eliminar ───────────────────────────────────────────────────
// DELETE /api/gastos/config/:id  body: { config }
app.delete("/api/gastos/config/:id", async (req, res) => {
  const { config } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    await pool.query("DELETE FROM gasto_config WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Gastos: listar ────────────────────────────────────────────────────────────
// POST /api/gastos/list  { config, fecha_inicio, fecha_fin, categoria, entidad, tipo_movimiento, limit, offset }
app.post("/api/gastos/list", async (req, res) => {
  const { config, fecha_inicio, fecha_fin, categoria, entidad, tipo_movimiento, limit = 100, offset = 0 } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const conditions = ["deleted_at IS NULL"];
    const params = [];
    if (fecha_inicio) { params.push(fecha_inicio); conditions.push(`fecha >= $${params.length}`); }
    if (fecha_fin)    { params.push(fecha_fin);     conditions.push(`fecha <= $${params.length}`); }
    if (categoria)    { params.push(categoria);     conditions.push(`categoria = $${params.length}`); }
    if (entidad)      { params.push(entidad);       conditions.push(`entidad = $${params.length}`); }
    if (tipo_movimiento) { params.push(tipo_movimiento); conditions.push(`tipo_movimiento = $${params.length}`); }
    const where = conditions.join(" AND ");
    params.push(limit, offset);
    const [rows, cnt] = await Promise.all([
      pool.query(`SELECT * FROM gastos WHERE ${where} ORDER BY fecha DESC, created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      pool.query(`SELECT COUNT(*), COALESCE(SUM(CASE WHEN tipo_movimiento = 'Gasto' THEN importe ELSE 0 END),0) as total_real FROM gastos WHERE ${where}`, params.slice(0, -2)),
    ]);
    res.json({ ok: true, rows: rows.rows, total: parseInt(cnt.rows[0].count), total_real: parseFloat(cnt.rows[0].total_real) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Gastos: crear ─────────────────────────────────────────────────────────────
// POST /api/gastos  { config, fecha, importe, moneda, concepto, entidad, nombre_producto, tipo_movimiento, categoria, nota, usd_equiv }
app.post("/api/gastos", async (req, res) => {
  const { config, fecha, importe, moneda = "CLP", concepto, entidad, nombre_producto, tipo_movimiento = "Cargo", categoria, nota, usd_equiv } = req.body;
  if (!fecha || !importe || !categoria) return res.status(400).json({ error: "fecha, importe y categoria son requeridos" });
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const r = await pool.query(
      `INSERT INTO gastos (fecha, importe, moneda, concepto, entidad, nombre_producto, tipo_movimiento, categoria, nota, usd_equiv)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [fecha, parseFloat(importe), moneda, concepto || null, entidad || null, nombre_producto || null, tipo_movimiento, categoria, nota || null, usd_equiv ? parseFloat(usd_equiv) : null]
    );
    res.json({ ok: true, row: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Gastos: actualizar ────────────────────────────────────────────────────────
// PUT /api/gastos/:id  { config, ...fields }
app.put("/api/gastos/:id", async (req, res) => {
  const { config, fecha, importe, moneda, concepto, entidad, nombre_producto, tipo_movimiento, categoria, nota, usd_equiv } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const r = await pool.query(
      `UPDATE gastos SET fecha=$1, importe=$2, moneda=$3, concepto=$4, entidad=$5, nombre_producto=$6, tipo_movimiento=$7, categoria=$8, nota=$9, usd_equiv=$10
       WHERE id=$11 AND deleted_at IS NULL RETURNING *`,
      [fecha, parseFloat(importe), moneda || "CLP", concepto || null, entidad || null, nombre_producto || null, tipo_movimiento || "Cargo", categoria, nota || null, usd_equiv ? parseFloat(usd_equiv) : null, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Gasto no encontrado" });
    res.json({ ok: true, row: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Gastos: soft delete ───────────────────────────────────────────────────────
// DELETE /api/gastos/:id  body: { config }
app.delete("/api/gastos/:id", async (req, res) => {
  const { config } = req.body;
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    await pool.query("UPDATE gastos SET deleted_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Gastos: resumen mensual ───────────────────────────────────────────────────
// POST /api/gastos/resumen  { config, year, month }
// Retorna totales por categoría del mes, excluyendo tipo_movimiento = 'Pago tarjeta'
app.post("/api/gastos/resumen", async (req, res) => {
  const { config, year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: "year y month requeridos" });
  const pool = getPool(config);
  if (!pool) return res.status(503).json({ error: "pg no instalado" });
  try {
    const [byCat, byDay, totals] = await Promise.all([
      pool.query(
        `SELECT categoria, SUM(importe) as total, COUNT(*) as count
         FROM gastos
         WHERE EXTRACT(YEAR FROM fecha) = $1 AND EXTRACT(MONTH FROM fecha) = $2
           AND tipo_movimiento = 'Gasto' AND deleted_at IS NULL
         GROUP BY categoria ORDER BY total DESC`,
        [year, month]
      ),
      pool.query(
        `SELECT fecha::text as dia, SUM(importe) as total
         FROM gastos
         WHERE EXTRACT(YEAR FROM fecha) = $1 AND EXTRACT(MONTH FROM fecha) = $2
           AND tipo_movimiento = 'Gasto' AND deleted_at IS NULL
         GROUP BY fecha ORDER BY fecha`,
        [year, month]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN tipo_movimiento = 'Gasto' THEN importe ELSE 0 END),0) as total_mes,
           COALESCE(SUM(CASE WHEN tipo_movimiento = 'Gasto' THEN usd_equiv ELSE 0 END),0) as total_usd
         FROM gastos
         WHERE EXTRACT(YEAR FROM fecha) = $1 AND EXTRACT(MONTH FROM fecha) = $2 AND deleted_at IS NULL`,
        [year, month]
      ),
    ]);
    res.json({
      ok: true,
      by_categoria: byCat.rows,
      by_dia:       byDay.rows,
      total_mes:    parseFloat(totals.rows[0].total_mes),
      total_usd:    parseFloat(totals.rows[0].total_usd),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── USD/CLP rate via Yahoo Finance ────────────────────────────────────────────
// GET /api/gastos/usd-rate
app.get("/api/gastos/usd-rate", async (req, res) => {
  try {
    const r = await pf("https://query1.finance.yahoo.com/v8/finance/chart/CLP=X?interval=1d&range=1d");
    const d = await r.json();
    const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!price) return res.status(502).json({ error: "Sin datos de Yahoo Finance" });
    // CLP=X = precio de 1 USD en CLP
    res.json({ ok: true, clp_per_usd: price });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Telegram: webhook bidireccional (gastos via bot) ──────────────────────────
//
// Variables de entorno necesarias en Fly.io (flyctl secrets set ...):
//   TG_TOKEN   → token del bot (el mismo que usas en Maintainers)
//   TG_CHAT_ID → tu chat ID personal (solo tú puede usar el bot)
//   DB_HOST    → aws-1-sa-east-1.pooler.supabase.com
//   DB_PORT    → 5432
//   DB_NAME    → postgres
//   DB_USER    → postgres.fwcjolnhghqqbclrbdrc
//   DB_PASS    → tu password de Supabase
//
// El webhook se registra automáticamente al arrancar si TG_TOKEN está configurado.

function getEnvPool() {
  if (!process.env.DB_HOST || !process.env.DB_USER) return null;
  return getPool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || "5432",
    database: process.env.DB_NAME || "postgres",
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    ssl:      true,
  });
}

async function tgSend(chatId, text) {
  const token = process.env.TG_TOKEN;
  if (!token) return;
  await pf(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

async function tgCmdGasto(chatId, args) {
  if (args.length < 2)
    return tgSend(chatId, "Uso: /gasto &lt;importe&gt; &lt;categoria&gt; [nota]\nEj: <code>/gasto 195000 Arriendo Marzo</code>");

  const importe = parseFloat(args[0]);
  if (isNaN(importe)) return tgSend(chatId, `"${args[0]}" no es un número válido.`);

  const categoria = args[1];
  const nota      = args.slice(2).join(" ") || null;
  const fecha     = new Date().toISOString().split("T")[0];

  let usd_equiv = null;
  try {
    const r = await pf("https://query1.finance.yahoo.com/v8/finance/chart/CLP=X?interval=1d&range=1d");
    const d = await r.json();
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate) usd_equiv = parseFloat((importe / rate).toFixed(2));
  } catch {}

  const pool = getEnvPool();
  if (!pool) return tgSend(chatId, "Error: BD no configurada en el servidor.");

  try {
    await pool.query(
      `INSERT INTO gastos (fecha, importe, moneda, tipo_movimiento, categoria, nota, usd_equiv)
       VALUES ($1,$2,'CLP','Gasto',$3,$4,$5)`,
      [fecha, importe, categoria, nota, usd_equiv]
    );
    const usdStr = usd_equiv ? ` (~$${usd_equiv} USD)` : "";
    await tgSend(chatId,
      `✅ Gasto guardado\n💰 $${importe.toLocaleString("es-CL")} CLP${usdStr}\n📂 ${categoria}${nota ? `\n📝 ${nota}` : ""}`
    );
  } catch(e) { await tgSend(chatId, `Error al guardar: ${e.message}`); }
}

async function tgCmdGastos(chatId) {
  const pool = getEnvPool();
  if (!pool) return tgSend(chatId, "Error: BD no configurada en el servidor.");
  try {
    const mes = new Date().toISOString().slice(0, 7);
    const r = await pool.query(
      `SELECT categoria, SUM(importe) as total
       FROM gastos
       WHERE to_char(fecha,'YYYY-MM') = $1 AND tipo_movimiento = 'Gasto' AND deleted_at IS NULL
       GROUP BY categoria ORDER BY total DESC`,
      [mes]
    );
    if (r.rows.length === 0) return tgSend(chatId, `Sin gastos registrados en ${mes}.`);
    const total = r.rows.reduce((s, row) => s + parseFloat(row.total), 0);
    let msg = `📊 <b>Gastos ${mes}</b>\n\n`;
    for (const row of r.rows) {
      const pct = ((parseFloat(row.total) / total) * 100).toFixed(0);
      msg += `• ${row.categoria}: $${parseInt(row.total).toLocaleString("es-CL")} (${pct}%)\n`;
    }
    msg += `\n<b>Total: $${Math.round(total).toLocaleString("es-CL")} CLP</b>`;
    await tgSend(chatId, msg);
  } catch(e) { await tgSend(chatId, `Error: ${e.message}`); }
}

async function tgCmdCategorias(chatId) {
  const pool = getEnvPool();
  if (!pool) return tgSend(chatId, "Error: BD no configurada en el servidor.");
  try {
    const r = await pool.query(`SELECT nombre FROM gasto_categorias ORDER BY orden, nombre`);
    const cats = r.rows.map(row => `• ${row.nombre}`).join("\n");
    await tgSend(chatId, `📂 <b>Categorías:</b>\n\n${cats}`);
  } catch(e) { await tgSend(chatId, `Error: ${e.message}`); }
}

async function tgCmdAyuda(chatId) {
  await tgSend(chatId, [
    "🤖 <b>Comandos disponibles:</b>",
    "",
    "/gasto &lt;importe&gt; &lt;categoria&gt; [nota]",
    "  Registra un gasto del mes actual.",
    "  Ej: <code>/gasto 195000 Arriendo Marzo</code>",
    "",
    "/gastos — Resumen del mes actual por categoría",
    "/categorias — Lista las categorías disponibles",
    "/ayuda — Este mensaje",
  ].join("\n"));
}

app.post("/api/telegram/webhook", async (req, res) => {
  res.sendStatus(200); // Responder inmediato a Telegram
  const msg = req.body?.message;
  if (!msg?.text) return;

  const chatId  = String(msg.chat.id);
  const allowed = process.env.TG_CHAT_ID;
  if (allowed && chatId !== String(allowed)) return; // Solo el dueño

  const parts = msg.text.trim().split(/\s+/);
  const cmd   = parts[0].split("@")[0].toLowerCase(); // ignorar @botname
  if (cmd === "/gasto" || cmd === "/g")     await tgCmdGasto(chatId, parts.slice(1));
  else if (cmd === "/gastos")               await tgCmdGastos(chatId);
  else if (cmd === "/categorias" || cmd === "/cats") await tgCmdCategorias(chatId);
  else if (cmd === "/ayuda" || cmd === "/help")      await tgCmdAyuda(chatId);
  else await tgSend(chatId, "Comando no reconocido. Usa /ayuda.");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Servir React build en producción (Fly.io)
if (IS_PROD) {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get(/(.*)/, (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(PORT, () => {
  console.log(`\n✅  Proxy v4 → http://localhost:${PORT}`);

  // Auto-registrar webhook de Telegram al arrancar (solo en producción con token configurado)
  if (IS_PROD && process.env.TG_TOKEN && process.env.FLY_APP_NAME) {
    const webhookUrl = `https://${process.env.FLY_APP_NAME}.fly.dev/api/telegram/webhook`;
    pf(`https://api.telegram.org/bot${process.env.TG_TOKEN}/setWebhook`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
    }).then(r => r.json()).then(d => {
      if (d.ok) console.log(`✅  TG webhook activo: ${webhookUrl}`);
      else      console.log(`⚠️   TG webhook error: ${JSON.stringify(d)}`);
    }).catch(e => console.log(`⚠️   TG webhook: ${e.message}`));
  }
  console.log(`   Binance spot        → GET  /api/binance/prices?symbols=BTCUSDT`);
  console.log(`   Binance futures px  → GET  /api/binance/futures?symbols=COINUSDT`);
  console.log(`   Binance test        → POST /api/binance/ping`);
  console.log(`   Binance fut balance → POST /api/binance/futures/balance`);
  console.log(`   Binance fut order   → POST /api/binance/futures/order`);
  console.log(`   Binance fut close   → POST /api/binance/futures/closePosition`);
  console.log(`   Binance open orders → POST /api/binance/futures/openOrders`);
  console.log(`   Binance positions   → POST /api/binance/futures/positions`);
  console.log(`   Binance cancel ord  → POST /api/binance/futures/cancelOrder`);
  console.log(`   HL mids             → POST /api/hyperliquid/mids`);
  console.log(`   HL metadata         → GET  /api/hyperliquid/meta`);
  console.log(`   CLP/USD             → GET  /api/clp-rate`);
  console.log(`   Commodity price     → GET  /api/prices/commodity?symbol=OIL`);
  console.log(`   DB generic query    → POST /api/db/query`);
  console.log(`   DB migrate trades   → POST /api/db/migrate-trades`);
  console.log(`   DB list trades      → POST /api/db/trades`);
  console.log(`   DB update trade     → PUT  /api/db/trades/:id`);
  console.log(`   DB soft delete      → DELETE /api/db/trades/:id`);
  console.log(`   DB migrate schema   → POST /api/db/migrate-schema`);
  console.log(`   BN trade history    → POST /api/binance/futures/tradeHistory`);
  console.log(`   DB import BN trades → POST /api/db/import-bn-trades`);
  console.log(`   Gastos migrate      → POST /api/gastos/migrate-schema`);
  console.log(`   Gastos CRUD         → POST|PUT|DELETE /api/gastos`);
  console.log(`   Gastos list         → POST /api/gastos/list`);
  console.log(`   Gastos resumen      → POST /api/gastos/resumen`);
  console.log(`   Gastos categorías   → GET|POST|DELETE /api/gastos/categorias`);
  console.log(`   USD/CLP rate        → GET  /api/gastos/usd-rate\n`);
});