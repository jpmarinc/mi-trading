import { useState } from "react";
import { PROXY, DEFAULT_LEV } from "../constants";

export default function MaintainersTab({ accounts, leverageOpts, setLeverageOpts, callOpts, setCallOpts, rValues, setRValues, sheetsConfig, setSheetsConfig, dbConfig, setDbConfig, tgConfig, setTgConfig, toast }) {
  const [newLev, setNewLev] = useState("");
  const [newCall, setNewCall] = useState("");
  const [tab, setTab] = useState("r");

  const subTabs = [
    { id:"r",        label:"📊 R Values" },
    { id:"leverage", label:"⚙️ Leverage" },
    { id:"call",     label:"📋 Call Options" },
    { id:"db",       label:"🐘 Base de Datos" },
    { id:"tg",       label:"✈️ Telegram" },
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
            <strong>Setup PostgreSQL:</strong><br/>
            1. <code style={{ background:"#111d2c", padding:"1px 5px", borderRadius:3 }}>brew install postgresql@16 && brew services start postgresql@16</code><br/>
            2. <code style={{ background:"#111d2c", padding:"1px 5px", borderRadius:3 }}>psql postgres -f db-setup.sql</code><br/>
            3. <code style={{ background:"#111d2c", padding:"1px 5px", borderRadius:3 }}>npm install pg</code><br/>
            4. Configurar conexión abajo
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
