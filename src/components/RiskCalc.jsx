import { useState } from "react";
import { PROXY } from "../constants";

export default function RiskCalc({ accounts, leverageOpts, prices, rValues, sendTg }) {
  const defaultR = rValues?.quantfury || 2.65;
  const [f, sf] = useState({ asset:"", type:"Long", account:"quantfury", entry:"", sl:"", tp:"", leverage:20, rSize:defaultR });
  const [res, setRes] = useState(null);
  const [ch, setCh] = useState("");
  const [bnStatus, setBnStatus] = useState(null); // { ok, msg }

  const placeOnBinance = async () => {
    if (!res || !acc?.apiKey || !acc?.apiSecret) return;
    const entry  = parseFloat(f.entry);
    const lev    = parseFloat(f.leverage);
    const symbol = f.asset.toUpperCase().replace("-","") + (f.asset.toUpperCase().endsWith("USDT") ? "" : "USDT");
    // res.ps = margen (risk / slPct / leverage). Notional = ps * leverage. Qty = notional / entry
    const qty = Math.floor((res.ps * lev / entry) * 1000) / 1000;
    if (qty < 0.001) {
      setBnStatus({ ok:false, msg:`Qty calculada: ${(res.ps * lev / entry).toFixed(6)} (< mínimo 0.001). Aumentá el R o revisá el SL.` });
      return;
    }
    setBnStatus({ ok:null, msg:"Colocando orden..." });
    try {
      const r = await fetch(`${PROXY}/api/binance/futures/order`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ apiKey: acc.apiKey, apiSecret: acc.apiSecret, symbol, side: f.type === "Long" ? "BUY" : "SELL", type:"LIMIT", quantity: qty, price: entry }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      if (d.ok) {
        setBnStatus({ ok:true, msg:`✅ ${symbol} ${qty} @ $${entry} — ID: ${d.order.orderId}` });
        sendTg?.(`📡 *Nueva orden Binance Futures*\n${f.type === "Long" ? "🟢 LONG" : "🔴 SHORT"} ${symbol}\n📍 Entry: $${entry}\nQty: ${qty} | Lev: x${f.leverage}\nR riesgo: $${f.rSize}\nOrder ID: ${d.order.orderId}`);
      } else setBnStatus({ ok:false, msg: d.msg });
    } catch(e) { setBnStatus({ ok:false, msg: e.message }); }
  };
  const set = (k, v) => sf(x => {
    if (k === "account") return { ...x, [k]: v, rSize: rValues?.[v] ?? x.rSize };
    return { ...x, [k]: v };
  });
  const acc = accounts.find(a => a.id === f.account);
  const cap = acc?.balance || 53;
  const sugR = Math.max(1, cap * 0.05).toFixed(2);
  const lp = prices[f.asset]?.price;

  const calc = () => {
    const en = parseFloat(f.entry), sl = parseFloat(f.sl), tp = parseFloat(f.tp);
    const lev = parseFloat(f.leverage), r = parseFloat(f.rSize);
    if (!en || !sl) return;
    const slP = Math.abs((sl - en) / en) * 100;
    const tpP = tp ? Math.abs((tp - en) / en) * 100 : null;
    const rr = tpP ? (tpP / slP).toFixed(2) : null;
    const ps = (r / (slP / 100)) / lev;
    const rPct = (r / cap) * 100;
    setRes({ slP, tpP, rr, ps, rPct, r, tooRisky:rPct > 10, badRR:rr && parseFloat(rr) < 1.5 });
    setCh(`${f.type === "Long" ? "🟢 📈 LONG" : "🔴 📉 SHORT"} $${f.asset || "ASSET"}\n\n📍 Entry: ${en}\n🛑 SL: ${sl}  (${slP.toFixed(2)}%)\n🎯 TP: ${tp || "TBD"}${tpP ? `  (${tpP.toFixed(2)}%)` : ""} ${rr ? `· R/R: 1:${rr}` : ""}\n\n📊 TF: M5/H1 | PA\nConfl: • [HTF bias] • [Setup]\nRisk: ${rPct.toFixed(1)}% | Lev: x${lev}\n#${f.asset || "ASSET"} #PriceAction #ChromaTrading`);
  };

  return (
    <div className="page">
      {cap < 100 && <div className="al ad">⚠️ R recomendado: <strong>${sugR}</strong>. No usar $35 hasta $350+.</div>}
      <div className="g2">
        <div className="card">
          <div className="ct">🎯 Calculadora</div>
          <div className="g2">
            <div className="fi">
              <label>Asset</label>
              <div style={{ display:"flex", gap:4 }}>
                <input placeholder="BTC, OIL..." value={f.asset} onChange={e => set("asset", e.target.value.toUpperCase())}/>
                {lp && <button className="btn bg bxs" onClick={() => set("entry", lp.toString())} title="Usar precio live">📡</button>}
              </div>
            </div>
            <div className="fi">
              <label>Cuenta</label>
              <select value={f.account} onChange={e => set("account", e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} (${a.balance.toFixed(0)})</option>)}
              </select>
            </div>
          </div>
          <div className="g2">
            <div className="fi">
              <label>Dirección</label>
              <select value={f.type} onChange={e => set("type", e.target.value)}><option>Long</option><option>Short</option></select>
            </div>
            <div className="fi">
              <label>Leverage</label>
              <select value={f.leverage} onChange={e => set("leverage", e.target.value)}>
                {leverageOpts.map(l => <option key={l} value={l}>x{l}</option>)}
              </select>
            </div>
          </div>
          <div className="g3">
            <div className="fi"><label>Entry</label><input type="number" value={f.entry} onChange={e => set("entry", e.target.value)}/></div>
            <div className="fi"><label>SL 🛑</label><input type="number" value={f.sl} onChange={e => set("sl", e.target.value)}/></div>
            <div className="fi"><label>TP 🎯</label><input type="number" value={f.tp} onChange={e => set("tp", e.target.value)}/></div>
          </div>
          <div className="fi"><label>R ($) — recomendado ${sugR}</label><input type="number" value={f.rSize} onChange={e => set("rSize", e.target.value)}/></div>
          <button className="btn bp" style={{ width:"100%" }} onClick={calc}>Calcular →</button>
        </div>

        <div className="card">
          <div className="ct">📐 Resultado</div>
          {!res ? (
            <div style={{ color:"#4a6280", textAlign:"center", padding:"40px 0", fontSize:11 }}>Completá el formulario</div>
          ) : (
            <>
              {res.tooRisky && <div className="al ad">🚨 {res.rPct.toFixed(1)}% del capital</div>}
              {res.badRR    && <div className="al aw">⚠️ R/R 1:{res.rr}</div>}
              {!res.tooRisky && !res.badRR && <div className="al aok">✅ OK</div>}
              <div className="rb">
                {[
                  { k:"SL dist",  v:`${res.slP.toFixed(2)}%`,                        c:"red" },
                  { k:"TP dist",  v:res.tpP ? `${res.tpP.toFixed(2)}%` : "—",       c:"green" },
                  { k:"R/R",      v:res.rr ? `1:${res.rr}` : "—",                   c:parseFloat(res.rr) >= 1.5 ? "green" : "orange" },
                  { k:"$ riesgo", v:`$${res.r}`,                                     c:res.rPct > 10 ? "red" : "yellow" },
                  { k:"% capital",v:`${res.rPct.toFixed(2)}%`,                       c:res.rPct > 10 ? "red" : "green" },
                  { k:"Margen req.", v:`$${res.ps.toFixed(2)}`,                       c:"blue" },
                ].map((r, i) => (
                  <div key={i} className="rr">
                    <span className="k">{r.k}</span>
                    <span className={`v ${r.c}`}>{r.v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {ch && (
        <div className="card">
          <div className="ct">📣 Post Chroma</div>
          <div className="chromap">{ch}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
            <button className="cpbtn" onClick={() => navigator.clipboard.writeText(ch)}>📋 Copiar</button>
            {acc?.type === "binance" && acc?.apiKey && acc?.apiSecret && (
              <button className="btn by bsm" onClick={placeOnBinance} disabled={bnStatus?.ok === null}>
                📡 Colocar en Binance Futures
              </button>
            )}
          </div>
          {bnStatus && (
            <div
              className={`al ${bnStatus.ok === true ? "aok" : bnStatus.ok === false ? "ad" : "ai"}`}
              style={{ fontSize:9, marginTop:6, cursor: bnStatus.ok === false ? "pointer" : "default", userSelect:"none" }}
              onClick={() => bnStatus.ok === false && navigator.clipboard.writeText(bnStatus.msg)}
              title={bnStatus.ok === false ? "Click para copiar el error" : ""}
            >
              {bnStatus.msg}
              {bnStatus.ok === false && <span style={{ opacity:0.55, marginLeft:6 }}>📋 click para copiar</span>}
              {bnStatus.ok !== null && (
                <button className="btn bg bxs" style={{ marginLeft:6 }} onClick={e => { e.stopPropagation(); setBnStatus(null); }}>✕</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
