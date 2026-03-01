import { useState } from "react";
import { PROXY, DEFAULT_LEV } from "../constants";

export default function MaintainersTab({ accounts, leverageOpts, setLeverageOpts, callOpts, setCallOpts, rValues, setRValues, sheetsConfig, setSheetsConfig, dbConfig, setDbConfig, tgConfig, setTgConfig, toast }) {
  const [newLev, setNewLev] = useState("");
  const [newCall, setNewCall] = useState("");
  const [tab, setTab] = useState("r");

  // SL/TP test state
  const [sltpAcct,    setSltpAcct]    = useState("");
  const [sltpSymbol,  setSltpSymbol]  = useState("BTCUSDT");
  const [sltpSide,    setSltpSide]    = useState("SELL");
  const [sltpSl,      setSltpSl]      = useState("");
  const [sltpTp,      setSltpTp]      = useState("");
  const [sltpQty,     setSltpQty]     = useState("0.001");
  const [sltpLoading, setSltpLoading] = useState(false);
  const [sltpResults, setSltpResults] = useState(null);

  const subTabs = [
    { id:"r",        label:"📊 R Values" },
    { id:"leverage", label:"⚙️ Leverage" },
    { id:"call",     label:"📋 Call Options" },
    { id:"db",       label:"🐘 Base de Datos" },
    { id:"tg",       label:"✈️ Telegram" },
    { id:"sltp",     label:"🧪 Test SL/TP" },
    { id:"docs",     label:"📖 Code Map" },
  ];

  const addLev = () => {
    const v = parseInt(newLev);
    if (v > 0 && !leverageOpts.includes(v)) {
      setLeverageOpts(prev => [...prev, v].sort((a, b) => a - b));
      setNewLev("");
    }
  };

  const addCall = () => {
    const v = newCall.trim();
    if (v && !callOpts.includes(v)) {
      setCallOpts(prev => [...prev, v]);
      setNewCall("");
    }
  };

  return (
    <div className="page">
      <div style={{ display:"flex", gap:4, marginBottom:14, borderBottom:"1px solid #1e2d3d", paddingBottom:8, flexWrap:"wrap" }}>
        {subTabs.map(t => (
          <button key={t.id} className={`btn ${tab === t.id ? "bp" : "bg"} bsm`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* R VALUES */}
      {tab === "r" && (
        <div>
          <div className="al ai" style={{ fontSize:10, marginBottom:12 }}>
            Estos valores definen cuánto vale 1R en cada cuenta. Se usan en Performance, Deudas y Risk Calc.<br/>
            <strong>Buscar en código: </strong>
            <code style={{ background:"#111d2c", padding:"1px 5px", borderRadius:3, fontSize:9 }}>// §RVALUES</code>
          </div>
          <div className="g3">
            {accounts.map(acc => (
              <div key={acc.id} className="msect">
                <div className="msect-title" style={{ color:acc.color }}>● {acc.name}</div>
                <div className="fi">
                  <label>1R = $ (USD)</label>
                  <input
                    type="number" step="0.01"
                    value={rValues[acc.id] || 2.65}
                    onChange={e => setRValues(prev => ({ ...prev, [acc.id]: parseFloat(e.target.value) || 2.65 }))}
                    style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:acc.color }}
                  />
                </div>
                <div style={{ fontSize:10, color:"#4a6280" }}>
                  Salario mínimo HL: 1% del capital<br/>
                  Actual: <span style={{ color:acc.color }}>1R = ${(rValues[acc.id] || 2.65).toFixed(2)}</span>
                </div>
                <div style={{ marginTop:6 }}>
                  <div style={{ fontSize:9, color:"#4a6280", marginBottom:4 }}>Atajos</div>
                  {[["1% de $1k","10"],["1% de $25k","250"],["1% de $50k","500"],["5% de $53","2.65"]].map(([l, v]) => (
                    <button key={l} className="btn bg bxs" style={{ marginRight:4, marginBottom:4 }}
                      onClick={() => setRValues(prev => ({ ...prev, [acc.id]: parseFloat(v) }))}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="al aok" style={{ marginTop:10, fontSize:10 }}>
            💡 Ejemplo Breakout: si pasás la cuenta de 25k → cambiar Binance a $250. Si pasás 50k → $500.
          </div>
        </div>
      )}

      {/* LEVERAGE */}
      {tab === "leverage" && (
        <div>
          <div className="al ai" style={{ fontSize:10, marginBottom:10 }}>
            Buscar en código: <code style={{ background:"#111d2c", padding:"1px 5px", borderRadius:3, fontSize:9 }}>// §DEFAULT_LEV</code>
          </div>
          <div className="card">
            <div className="ct">Opciones de Leverage</div>
            <div className="ltags">
              {leverageOpts.map(l => (
                <span key={l} className="ltag" onClick={() => setLeverageOpts(prev => prev.filter(x => x !== l))}>x{l} ✕</span>
              ))}
            </div>
            <div style={{ display:"flex", gap:7, marginTop:10 }}>
              <input type="number" placeholder="Ej: 75" value={newLev} onChange={e => setNewLev(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addLev()} style={{ maxWidth:90 }}/>
              <button className="btn bp bsm" onClick={addLev}>+ Add</button>
              <button className="btn bg bsm" onClick={() => setLeverageOpts(DEFAULT_LEV)}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* CALL OPTIONS */}
      {tab === "call" && (
        <div>
          <div className="al ai" style={{ fontSize:10, marginBottom:10 }}>
            Opciones disponibles en el campo <strong>Call</strong> de todos los formularios de trades.<br/>
            Hacé clic en una opción para eliminarla. Los cambios se guardan automáticamente.
          </div>
          <div className="card">
            <div className="ct">Opciones de Call</div>
            <div className="ltags">
              {callOpts.map(c => (
                <span key={c} className="ltag" onClick={() => setCallOpts(prev => prev.filter(x => x !== c))}>{c} ✕</span>
              ))}
            </div>
            <div style={{ display:"flex", gap:7, marginTop:10 }}>
              <input placeholder="Ej: Alpha7, Setup A..." value={newCall} onChange={e => setNewCall(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCall()} style={{ maxWidth:160 }}/>
              <button className="btn bp bsm" onClick={addCall}>+ Add</button>
              <button className="btn bg bsm" onClick={() => setCallOpts(["YO","Chroma","Silla","Mizer","Otro"])}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* DATABASE */}
      {tab === "db" && (
        <div>
          <div className="al ai" style={{ fontSize:10, marginBottom:10 }}>
            <strong>Local:</strong> <code style={{ background:"#111d2c", padding:"1px 5px", borderRadius:3 }}>brew install postgresql@16 && brew services start postgresql@16</code><br/>
            <strong>Cloud (Supabase):</strong> crear proyecto en supabase.com → Project Settings → Database → Connection string
          </div>
          <div className="card">
            <div className="ct">Conexión PostgreSQL</div>
            <div className="g2">
              <div className="fi"><label>Host</label><input placeholder="localhost" value={dbConfig.host||""} onChange={e => setDbConfig(p => ({ ...p, host:e.target.value }))}/></div>
              <div className="fi"><label>Puerto</label><input placeholder="5432" value={dbConfig.port||""} onChange={e => setDbConfig(p => ({ ...p, port:e.target.value }))}/></div>
              <div className="fi"><label>Base de datos</label><input placeholder="trading_fw" value={dbConfig.database||""} onChange={e => setDbConfig(p => ({ ...p, database:e.target.value }))}/></div>
              <div className="fi"><label>Usuario</label><input placeholder="postgres" value={dbConfig.user||""} onChange={e => setDbConfig(p => ({ ...p, user:e.target.value }))}/></div>
            </div>
            <div className="fi"><label>Contraseña</label><input type="password" placeholder="(vacío si no tiene)" value={dbConfig.password||""} onChange={e => setDbConfig(p => ({ ...p, password:e.target.value }))}/></div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
              <input type="checkbox" id="dbSsl" checked={!!dbConfig.ssl} onChange={e => setDbConfig(p => ({ ...p, ssl: e.target.checked }))} style={{ width:14, height:14, cursor:"pointer" }}/>
              <label htmlFor="dbSsl" style={{ fontSize:10, color:"#94a3b8", cursor:"pointer", margin:0 }}>
                SSL / Base de datos cloud (Supabase, Neon, Railway, etc.)
              </label>
            </div>
            <button className="btn bp" onClick={async () => {
              try {
                const r = await fetch(`${PROXY}/api/db/query`, {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({ config:dbConfig, sql:"SELECT NOW() as ts" })
                });
                const d = await r.json();
                if (d.rows) toast.success("DB conectada", `PostgreSQL OK — ${d.rows[0]?.ts}`);
                else toast.error("DB error", d.error);
              } catch(e) { toast.error("DB", e.message); }
            }}>⚡ Test conexión</button>
          </div>

        </div>
      )}

      {/* TELEGRAM */}
      {tab === "tg" && (
        <div>
          <div className="al ai" style={{ fontSize:10, marginBottom:10 }}>
            ✈️ Alertas automáticas vía Telegram al colocar órdenes y cerrar posiciones.<br/>
            ⚠️ Token guardado en localStorage (solo accesible desde localhost).
          </div>
          <div className="card">
            <div className="ct">Configuración Bot</div>
            <div className="fi">
              <label>Bot Token</label>
              <input
                type="password"
                placeholder="123456789:AAF..."
                value={tgConfig?.token || ""}
                onChange={e => setTgConfig(p => ({ ...p, token: e.target.value }))}
              />
            </div>
            <div className="fi">
              <label>Chat ID</label>
              <input
                placeholder="1231401308"
                value={tgConfig?.chatId || ""}
                onChange={e => setTgConfig(p => ({ ...p, chatId: e.target.value }))}
              />
            </div>
            <button className="btn bp bsm" onClick={async () => {
              if (!tgConfig?.token || !tgConfig?.chatId) { toast.error("Telegram", "Completá token y chat ID"); return; }
              try {
                const r = await fetch("http://localhost:3001/api/telegram/send", {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({ token: tgConfig.token, chatId: tgConfig.chatId, text:"✅ *Trading Dashboard*\nBot conectado correctamente." })
                });
                const d = await r.json();
                if (d.ok) toast.success("Telegram ✅", "Mensaje de prueba enviado");
                else toast.error("Telegram", d.msg);
              } catch(e) { toast.error("Telegram", "Proxy offline"); }
            }}>📤 Probar conexión</button>
          </div>
        </div>
      )}

      {/* SL/TP TEST */}
      {tab === "sltp" && (
        <div>
          <div className="al ai" style={{ fontSize:10, marginBottom:12 }}>
            <strong>¿Para qué sirve?</strong> Prueba 5 estrategias diferentes de SL/TP contra la API de Binance Futures.<br/>
            Las órdenes exitosas se <strong>cancelan automáticamente</strong> — no afectan tu cuenta.<br/>
            El objetivo es identificar cuál combinación acepta tu cuenta para documentarla y usarla en producción.
          </div>
          <div className="card">
            <div className="ct">Configuración del test</div>
            <div className="g3">
              <div className="fi">
                <label>Cuenta Binance</label>
                <select value={sltpAcct} onChange={e => setSltpAcct(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {accounts.filter(a => a.type === "binance" && a.apiKey).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="fi">
                <label>Símbolo</label>
                <input value={sltpSymbol} onChange={e => setSltpSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT"/>
              </div>
              <div className="fi">
                <label>Lado SL/TP <span style={{ color:"#4a6280", fontSize:9 }}>(SELL si eres Long, BUY si Short)</span></label>
                <select value={sltpSide} onChange={e => setSltpSide(e.target.value)}>
                  <option value="SELL">SELL (Long → cierra)</option>
                  <option value="BUY">BUY (Short → cierra)</option>
                </select>
              </div>
              <div className="fi">
                <label>SL precio <span style={{ color:"#4a6280", fontSize:9 }}>(deja vacío para no probar SL)</span></label>
                <input type="number" value={sltpSl} onChange={e => setSltpSl(e.target.value)} placeholder="ej: 80000"/>
              </div>
              <div className="fi">
                <label>TP precio <span style={{ color:"#4a6280", fontSize:9 }}>(deja vacío para no probar TP)</span></label>
                <input type="number" value={sltpTp} onChange={e => setSltpTp(e.target.value)} placeholder="ej: 100000"/>
              </div>
              <div className="fi">
                <label>Qty <span style={{ color:"#4a6280", fontSize:9 }}>(mínimo del par, ej 0.001 BTC)</span></label>
                <input type="number" value={sltpQty} onChange={e => setSltpQty(e.target.value)} step="0.001"/>
              </div>
            </div>
            <button className="btn bp" style={{ width:"100%", marginTop:10 }}
              disabled={sltpLoading || !sltpAcct || !sltpSymbol || (!sltpSl && !sltpTp)}
              onClick={async () => {
                const acc = accounts.find(a => a.id === sltpAcct);
                if (!acc?.apiKey) { toast.error("Test SL/TP", "Cuenta sin API key"); return; }
                setSltpLoading(true); setSltpResults(null);
                try {
                  const r = await fetch(`${PROXY}/api/binance/futures/try-sltp`, {
                    method:"POST", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({
                      apiKey: acc.apiKey, apiSecret: acc.apiSecret,
                      symbol: sltpSymbol, slSide: sltpSide,
                      sl: sltpSl || null, tp: sltpTp || null, qty: sltpQty
                    }),
                    signal: AbortSignal.timeout(30000)
                  });
                  const d = await r.json();
                  setSltpResults(d);
                  if (d.worked?.length) toast.success("Estrategias encontradas ✅", d.worked.join(", "));
                  else toast.error("Ninguna estrategia funcionó", "Ver resultados detallados abajo");
                } catch(e) { toast.error("Test SL/TP", e.message); }
                setSltpLoading(false);
              }}>
              {sltpLoading ? "⟳ Probando 10 estrategias..." : "🧪 Probar todas las estrategias"}
            </button>
          </div>

          {sltpResults && (
            <div className="card" style={{ marginTop:10 }}>
              <div className="ct">Resultados del test</div>
              {sltpResults.worked?.length > 0 && (
                <div className="al aok" style={{ fontSize:10, marginBottom:8 }}>
                  ✅ Estrategias que funcionaron: <strong>{sltpResults.worked.join(" | ")}</strong><br/>
                  Las órdenes exitosas fueron canceladas automáticamente.
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {sltpResults.results?.map((r, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"5px 8px", borderRadius:5,
                    background: r.ok ? "#0d2016" : "#1a0a0a", border:`1px solid ${r.ok ? "#22c55e33" : "#ef444433"}` }}>
                    <span style={{ fontSize:12, lineHeight:1.2 }}>{r.ok ? "✅" : "❌"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, fontWeight:600, color: r.ok ? "#22c55e" : "#ef4444" }}>{r.label}</div>
                      {!r.ok && <div style={{ fontSize:9, color:"#64748b", marginTop:2 }}>{r.msg}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CODE MAP */}
      {tab === "docs" && (
        <div>
          <div className="card">
            <div className="ct">📖 Mapa del Código</div>
            <div className="rb">
              {[
                ["§CONSTANTS",      "constants/index.js — constantes globales"],
                ["§RVALUES",        "DEFAULT_R_VALUES — R por cuenta"],
                ["§ACCOUNTS_INIT",  "Cuentas de trading iniciales"],
                ["§CLOSED_INIT",    "Trades históricos de ejemplo"],
                ["§OPEN_INIT",      "Posición abierta inicial (OIL)"],
                ["§DEBTS_INIT",     "Deudas iniciales (con paymentHistory)"],
                ["§SNOWBALL_INIT",  "Metas cortoplacistas (con completed)"],
                ["§WATCHLIST_INIT", "Watchlist inicial"],
                ["§DEFAULT_LEV",    "Opciones de leverage por defecto"],
                ["§MARKET_HOOK",    "hooks/useMarketData.js — precios en tiempo real"],
                ["§REFRESH_INTERVAL","Intervalo de refresh (15s)"],
                ["§PERF_CHART",     "components/PerformanceTab.jsx"],
                ["§MAINTAINERS",    "components/MaintainersTab.jsx"],
                ["§HEADER",         "components/Header.jsx — 2.2: solo BTC+CLP, 2.3: selector fuente"],
              ].map(([tag, desc]) => (
                <div key={tag} className="rr">
                  <code style={{ color:"#00d4ff", fontSize:9, background:"#111d2c", padding:"1px 6px", borderRadius:3 }}>{tag}</code>
                  <span className="v grey" style={{ fontSize:10, textAlign:"right" }}>{desc}</span>
                </div>
              ))}
            </div>
            <div className="al ai" style={{ marginTop:10, fontSize:10 }}>
              Ver DOCS.md para setup de Google Sheets, PostgreSQL e instrucciones del proxy.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
