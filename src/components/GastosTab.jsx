import { useState, useEffect, useCallback } from "react";
import { PROXY } from "../constants";

const TIPOS_MOVIMIENTO = ["Cargo", "Pago tarjeta", "Transferencia", "Ingreso", "Otro"];
const TIPOS_PRODUCTO   = ["Tarjeta de crédito", "Tarjeta de débito", "Cuenta corriente", "Otro"];
const MONEDAS          = ["CLP", "USD", "EUR"];

const EMPTY_FORM = {
  fecha: new Date().toISOString().split("T")[0],
  importe: "", moneda: "CLP", concepto: "", entidad: "",
  nombre_producto: "", tipo_producto: "", tipo_movimiento: "Cargo",
  categoria: "", nota: "", usd_equiv: "",
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString("es-CL", { minimumFractionDigits: 0 });
const fmtUsd = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GastosTab({ dbConfig, toast }) {
  const [subtab, setSubtab]       = useState("nuevo");
  const [cats, setCats]           = useState([]);
  const [usdRate, setUsdRate]     = useState(null); // CLP per 1 USD
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  // Lista
  const [gastos, setGastos]       = useState([]);
  const [totalReal, setTotalReal] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [filterFechaIni, setFI]   = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [filterFechaFin, setFF]   = useState(new Date().toISOString().split("T")[0]);
  const [filterCat, setFCat]      = useState("");
  const [filterTipo, setFTipo]    = useState("");
  const [editRow, setEditRow]     = useState(null); // gasto en edición

  // Resumen
  const [resYear, setResYear]     = useState(new Date().getFullYear());
  const [resMonth, setResMonth]   = useState(new Date().getMonth() + 1);
  const [resumen, setResumen]     = useState(null);
  const [loadingRes, setLoadingRes] = useState(false);

  // ── schema check ────────────────────────────────────────────────────────────
  const migrateSchema = useCallback(async () => {
    if (!dbConfig?.host || !dbConfig?.password) return;
    try {
      await fetch(`${PROXY}/api/gastos/migrate-schema`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig })
      });
    } catch { /* silent */ }
  }, [dbConfig]);

  // ── load categorias ─────────────────────────────────────────────────────────
  const loadCats = useCallback(async () => {
    if (!dbConfig?.host || !dbConfig?.password) return;
    try {
      const cfg = dbConfig;
      const params = new URLSearchParams({ host: cfg.host, port: cfg.port||5432, database: cfg.database, user: cfg.user, password: cfg.password, ...(cfg.ssl?"ssl=true":{}) });
      const r = await fetch(`${PROXY}/api/gastos/categorias?${params}`);
      const d = await r.json();
      if (d.ok) setCats(d.rows);
    } catch { /* silent */ }
  }, [dbConfig]);

  // ── fetch USD rate ───────────────────────────────────────────────────────────
  const fetchUsdRate = useCallback(async () => {
    try {
      const r = await fetch(`${PROXY}/api/gastos/usd-rate`);
      const d = await r.json();
      if (d.ok) setUsdRate(d.clp_per_usd);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    migrateSchema();
    loadCats();
    fetchUsdRate();
  }, [dbConfig?.host, dbConfig?.password]);

  // ── form helpers ─────────────────────────────────────────────────────────────
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleImporte = (v) => {
    set("importe", v);
    if (usdRate && v && form.moneda === "CLP") {
      set("usd_equiv", (parseFloat(v) / usdRate).toFixed(4));
    }
  };

  const handleMoneda = (v) => {
    set("moneda", v);
    if (usdRate && form.importe) {
      if (v === "CLP") set("usd_equiv", (parseFloat(form.importe) / usdRate).toFixed(4));
      else if (v === "USD") set("usd_equiv", form.importe);
    }
  };

  // ── save gasto ───────────────────────────────────────────────────────────────
  const saveGasto = async () => {
    if (!form.fecha || !form.importe || !form.categoria) {
      toast.error("Gastos", "Fecha, importe y categoría son requeridos"); return;
    }
    if (!dbConfig?.host || !dbConfig?.password) {
      toast.error("BD", "Configurá PostgreSQL en Maintainers"); return;
    }
    setSaving(true);
    try {
      const url   = editRow ? `${PROXY}/api/gastos/${editRow.id}` : `${PROXY}/api/gastos`;
      const method = editRow ? "PUT" : "POST";
      const r = await fetch(url, {
        method, headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig, ...form })
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("Gastos", editRow ? "Gasto actualizado ✅" : "Gasto guardado ✅");
        setForm(EMPTY_FORM);
        setEditRow(null);
        loadGastos();
      } else toast.error("BD", d.error);
    } catch(e) { toast.error("BD", e.message); }
    setSaving(false);
  };

  // ── load gastos list ─────────────────────────────────────────────────────────
  const loadGastos = useCallback(async () => {
    if (!dbConfig?.host || !dbConfig?.password) return;
    setLoadingList(true);
    try {
      const r = await fetch(`${PROXY}/api/gastos/list`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          config: dbConfig,
          fecha_inicio: filterFechaIni, fecha_fin: filterFechaFin,
          categoria: filterCat || undefined, tipo_movimiento: filterTipo || undefined,
          limit: 200, offset: 0
        })
      });
      const d = await r.json();
      if (d.ok) { setGastos(d.rows); setTotalReal(d.total_real); setTotalRows(d.total); }
      else toast.error("BD", d.error);
    } catch(e) { toast.error("BD", e.message); }
    setLoadingList(false);
  }, [dbConfig, filterFechaIni, filterFechaFin, filterCat, filterTipo]);

  useEffect(() => { if (subtab === "lista") loadGastos(); }, [subtab]);

  // ── delete gasto ─────────────────────────────────────────────────────────────
  const deleteGasto = async (id) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    try {
      const r = await fetch(`${PROXY}/api/gastos/${id}`, {
        method:"DELETE", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig })
      });
      const d = await r.json();
      if (d.ok) { toast.success("Gastos", "Eliminado"); loadGastos(); }
      else toast.error("BD", d.error);
    } catch(e) { toast.error("BD", e.message); }
  };

  // ── edit gasto ───────────────────────────────────────────────────────────────
  const startEdit = (g) => {
    setEditRow(g);
    setForm({
      fecha: g.fecha?.split("T")[0] || g.fecha,
      importe: String(g.importe), moneda: g.moneda || "CLP",
      concepto: g.concepto || "", entidad: g.entidad || "",
      nombre_producto: g.nombre_producto || "", tipo_producto: g.tipo_producto || "",
      tipo_movimiento: g.tipo_movimiento || "Cargo", categoria: g.categoria || "",
      nota: g.nota || "", usd_equiv: g.usd_equiv ? String(g.usd_equiv) : "",
    });
    setSubtab("nuevo");
    window.scrollTo(0, 0);
  };

  // ── resumen mensual ──────────────────────────────────────────────────────────
  const loadResumen = async () => {
    if (!dbConfig?.host || !dbConfig?.password) return;
    setLoadingRes(true);
    try {
      const r = await fetch(`${PROXY}/api/gastos/resumen`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: dbConfig, year: resYear, month: resMonth })
      });
      const d = await r.json();
      if (d.ok) setResumen(d);
      else toast.error("BD", d.error);
    } catch(e) { toast.error("BD", e.message); }
    setLoadingRes(false);
  };

  useEffect(() => { if (subtab === "resumen") loadResumen(); }, [subtab, resYear, resMonth]);

  const noDb = !dbConfig?.host || !dbConfig?.password;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      {/* subtabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {[["nuevo", editRow ? "✏️ Editando gasto" : "📝 Nuevo gasto"],
          ["lista","📋 Lista"],
          ["resumen","📊 Resumen mensual"]].map(([v,l]) => (
          <button key={v} className={`btn ${subtab===v?"bp":"bg"} bsm`} onClick={() => setSubtab(v)}>{l}</button>
        ))}
        {usdRate && (
          <span style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8", alignSelf:"center" }}>
            💱 USD/CLP: {fmt(usdRate)} (Yahoo Finance)
          </span>
        )}
      </div>

      {noDb && (
        <div className="card" style={{ borderColor:"#f97316", background:"#1c1008" }}>
          <p style={{ color:"#f97316", margin:0, fontSize:12 }}>
            ⚠️ Configurá PostgreSQL en Maintainers → DB para usar el módulo de gastos.
          </p>
        </div>
      )}

      {/* ── NUEVO / EDITAR ── */}
      {subtab === "nuevo" && (
        <div className="card">
          <div className="ct">{editRow ? "✏️ Editar gasto" : "📝 Nuevo gasto"}</div>
          {editRow && (
            <div style={{ marginBottom:10, display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:11, color:"#94a3b8" }}>Editando gasto #{editRow.id}</span>
              <button className="btn br bsm" onClick={() => { setEditRow(null); setForm(EMPTY_FORM); }}>✕ Cancelar</button>
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>

            <label className="fl">
              <span className="lbl">Fecha *</span>
              <input type="date" className="inp" value={form.fecha} onChange={e=>set("fecha",e.target.value)}/>
            </label>

            <label className="fl">
              <span className="lbl">Importe *</span>
              <input type="number" className="inp" placeholder="0" value={form.importe} onChange={e=>handleImporte(e.target.value)}/>
            </label>

            <label className="fl">
              <span className="lbl">Moneda</span>
              <select className="inp" value={form.moneda} onChange={e=>handleMoneda(e.target.value)}>
                {MONEDAS.map(m => <option key={m}>{m}</option>)}
              </select>
            </label>

            <label className="fl">
              <span className="lbl">USD equiv {usdRate ? `(rate: ${fmt(usdRate)})` : ""}</span>
              <input type="number" className="inp" placeholder="0.00" value={form.usd_equiv} onChange={e=>set("usd_equiv",e.target.value)}/>
            </label>

            <label className="fl">
              <span className="lbl">Categoría *</span>
              <select className="inp" value={form.categoria} onChange={e=>set("categoria",e.target.value)}>
                <option value="">— elegir —</option>
                {cats.map(c => <option key={c.id} value={c.nombre}>{c.icono} {c.nombre}</option>)}
              </select>
            </label>

            <label className="fl">
              <span className="lbl">Tipo de movimiento</span>
              <select className="inp" value={form.tipo_movimiento} onChange={e=>set("tipo_movimiento",e.target.value)}>
                {TIPOS_MOVIMIENTO.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>

            <label className="fl">
              <span className="lbl">Entidad</span>
              <input className="inp" placeholder="Tenpo, Scotiabank, Itaú..." value={form.entidad} onChange={e=>set("entidad",e.target.value)}/>
            </label>

            <label className="fl">
              <span className="lbl">Nombre producto</span>
              <input className="inp" placeholder="Visa Gold, Mastercard..." value={form.nombre_producto} onChange={e=>set("nombre_producto",e.target.value)}/>
            </label>

            <label className="fl">
              <span className="lbl">Tipo producto</span>
              <select className="inp" value={form.tipo_producto} onChange={e=>set("tipo_producto",e.target.value)}>
                <option value="">—</option>
                {TIPOS_PRODUCTO.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>

            <label className="fl" style={{ gridColumn:"1/-1" }}>
              <span className="lbl">Concepto</span>
              <input className="inp" placeholder="Descripción automática del banco..." value={form.concepto} onChange={e=>set("concepto",e.target.value)}/>
            </label>

            <label className="fl" style={{ gridColumn:"1/-1" }}>
              <span className="lbl">Nota</span>
              <input className="inp" placeholder="Comentario personal..." maxLength={255} value={form.nota} onChange={e=>set("nota",e.target.value)}/>
            </label>
          </div>

          <div style={{ marginTop:12, display:"flex", gap:8 }}>
            <button className="btn bp" style={{ flex:1 }} onClick={saveGasto} disabled={saving||noDb}>
              {saving ? "Guardando..." : editRow ? "💾 Actualizar" : "💾 Guardar gasto"}
            </button>
            {editRow && (
              <button className="btn br" onClick={() => { setEditRow(null); setForm(EMPTY_FORM); }}>Cancelar</button>
            )}
          </div>
        </div>
      )}

      {/* ── LISTA ── */}
      {subtab === "lista" && (
        <div className="card">
          <div className="ct">📋 Gastos registrados</div>

          {/* Filtros */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
            <label className="fl" style={{ minWidth:130 }}>
              <span className="lbl">Desde</span>
              <input type="date" className="inp" value={filterFechaIni} onChange={e=>setFI(e.target.value)}/>
            </label>
            <label className="fl" style={{ minWidth:130 }}>
              <span className="lbl">Hasta</span>
              <input type="date" className="inp" value={filterFechaFin} onChange={e=>setFF(e.target.value)}/>
            </label>
            <label className="fl" style={{ minWidth:150 }}>
              <span className="lbl">Categoría</span>
              <select className="inp" value={filterCat} onChange={e=>setFCat(e.target.value)}>
                <option value="">Todas</option>
                {cats.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="fl" style={{ minWidth:150 }}>
              <span className="lbl">Tipo movimiento</span>
              <select className="inp" value={filterTipo} onChange={e=>setFTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS_MOVIMIENTO.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <div style={{ display:"flex", alignItems:"flex-end" }}>
              <button className="btn bp bsm" onClick={loadGastos} disabled={loadingList}>
                {loadingList ? "⟳" : "🔍 Filtrar"}
              </button>
            </div>
          </div>

          {/* Totales */}
          <div style={{ display:"flex", gap:16, marginBottom:10, fontSize:12 }}>
            <span style={{ color:"#94a3b8" }}>{totalRows} registros</span>
            <span style={{ color:"#f97316", fontWeight:700 }}>
              Total real (exc. pagos tarjeta): <strong>${fmt(totalReal)} CLP</strong>
            </span>
            {usdRate && <span style={{ color:"#60a5fa" }}>≈ USD {fmtUsd(totalReal/usdRate)}</span>}
          </div>

          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #334155", color:"#94a3b8" }}>
                  {["Fecha","Importe","Moneda","Categoría","Tipo mov.","Entidad","Nota","USD",""].map(h => (
                    <th key={h} style={{ padding:"4px 8px", textAlign:"left", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastos.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign:"center", padding:20, color:"#64748b" }}>
                    {loadingList ? "Cargando..." : "Sin gastos en el período"}
                  </td></tr>
                )}
                {gastos.map(g => (
                  <tr key={g.id} style={{ borderBottom:"1px solid #1e293b" }}>
                    <td style={{ padding:"4px 8px", whiteSpace:"nowrap" }}>{g.fecha?.split("T")[0] || g.fecha}</td>
                    <td style={{ padding:"4px 8px", textAlign:"right", fontWeight:700,
                      color: g.tipo_movimiento === "Ingreso" ? "#22c55e" : g.tipo_movimiento === "Pago tarjeta" ? "#94a3b8" : "#f1f5f9" }}>
                      {g.tipo_movimiento === "Ingreso" ? "+" : ""}{fmt(g.importe)}
                    </td>
                    <td style={{ padding:"4px 8px" }}>{g.moneda}</td>
                    <td style={{ padding:"4px 8px" }}>
                      <span style={{ background:"#1e293b", borderRadius:4, padding:"2px 6px" }}>
                        {cats.find(c=>c.nombre===g.categoria)?.icono || ""} {g.categoria}
                      </span>
                    </td>
                    <td style={{ padding:"4px 8px", color: g.tipo_movimiento==="Pago tarjeta"?"#64748b":"inherit" }}>{g.tipo_movimiento}</td>
                    <td style={{ padding:"4px 8px", color:"#94a3b8" }}>{g.entidad || "—"}</td>
                    <td style={{ padding:"4px 8px", color:"#94a3b8", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
                      title={g.nota || g.concepto || ""}>{g.nota || g.concepto || "—"}</td>
                    <td style={{ padding:"4px 8px", color:"#60a5fa" }}>{g.usd_equiv ? fmtUsd(g.usd_equiv) : "—"}</td>
                    <td style={{ padding:"4px 8px", display:"flex", gap:4 }}>
                      <button className="btn by bsm" style={{ padding:"2px 6px" }} onClick={() => startEdit(g)}>✏️</button>
                      <button className="btn br bsm" style={{ padding:"2px 6px" }} onClick={() => deleteGasto(g.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── RESUMEN MENSUAL ── */}
      {subtab === "resumen" && (
        <div className="card">
          <div className="ct">📊 Resumen mensual</div>
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"flex-end" }}>
            <label className="fl">
              <span className="lbl">Año</span>
              <input type="number" className="inp" style={{ width:80 }} value={resYear} onChange={e=>setResYear(Number(e.target.value))}/>
            </label>
            <label className="fl">
              <span className="lbl">Mes</span>
              <select className="inp" value={resMonth} onChange={e=>setResMonth(Number(e.target.value))}>
                {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m,i)=>(
                  <option key={i} value={i+1}>{m}</option>
                ))}
              </select>
            </label>
            <button className="btn bp bsm" onClick={loadResumen} disabled={loadingRes}>
              {loadingRes ? "⟳" : "🔄 Actualizar"}
            </button>
          </div>

          {resumen && (
            <>
              {/* KPI totales */}
              <div style={{ display:"flex", gap:12, marginBottom:16, flexWrap:"wrap" }}>
                <div className="card" style={{ flex:1, minWidth:140, textAlign:"center", padding:12 }}>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>Total mes</div>
                  <div style={{ fontSize:20, fontWeight:700, color:"#f97316" }}>${fmt(resumen.total_mes)}</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>CLP</div>
                </div>
                {resumen.total_usd > 0 && (
                  <div className="card" style={{ flex:1, minWidth:140, textAlign:"center", padding:12 }}>
                    <div style={{ fontSize:11, color:"#94a3b8" }}>Total USD</div>
                    <div style={{ fontSize:20, fontWeight:700, color:"#60a5fa" }}>{fmtUsd(resumen.total_usd)}</div>
                    <div style={{ fontSize:11, color:"#64748b" }}>USD equiv.</div>
                  </div>
                )}
                <div className="card" style={{ flex:1, minWidth:140, textAlign:"center", padding:12 }}>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>Top categoría</div>
                  <div style={{ fontSize:16, fontWeight:700 }}>
                    {resumen.by_categoria[0] ? `${cats.find(c=>c.nombre===resumen.by_categoria[0].categoria)?.icono||""} ${resumen.by_categoria[0].categoria}` : "—"}
                  </div>
                  <div style={{ fontSize:11, color:"#f97316" }}>
                    {resumen.by_categoria[0] ? `$${fmt(resumen.by_categoria[0].total)}` : ""}
                  </div>
                </div>
              </div>

              {/* Breakdown por categoría */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, color:"#94a3b8", marginBottom:8 }}>Por categoría (excl. pago tarjeta)</div>
                {resumen.by_categoria.map(c => {
                  const pct = resumen.total_mes > 0 ? (c.total / resumen.total_mes * 100) : 0;
                  const cat = cats.find(x=>x.nombre===c.categoria);
                  return (
                    <div key={c.categoria} style={{ marginBottom:6 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:2 }}>
                        <span>{cat?.icono||""} {c.categoria} <span style={{ color:"#64748b" }}>({c.count} movs)</span></span>
                        <span style={{ fontWeight:700 }}>${fmt(c.total)} <span style={{ color:"#94a3b8", fontWeight:400 }}>({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div style={{ background:"#1e293b", borderRadius:4, height:8 }}>
                        <div style={{ width:`${pct}%`, background:"#f97316", borderRadius:4, height:8, transition:"width 0.3s" }}/>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Gastos por día */}
              {resumen.by_dia.length > 0 && (
                <div>
                  <div style={{ fontSize:12, color:"#94a3b8", marginBottom:8 }}>Por día</div>
                  <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:60 }}>
                    {(() => {
                      const max = Math.max(...resumen.by_dia.map(d=>d.total));
                      return resumen.by_dia.map(d => (
                        <div key={d.dia} title={`${d.dia}: $${fmt(d.total)}`}
                          style={{ flex:1, background:"#f97316", borderRadius:"2px 2px 0 0",
                            height:`${Math.round((d.total/max)*56)+4}px`, minWidth:2, opacity:0.8 }}/>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
          {!resumen && !loadingRes && (
            <p style={{ color:"#64748b", fontSize:12 }}>Seleccioná el período y presioná Actualizar.</p>
          )}
        </div>
      )}
    </div>
  );
}
