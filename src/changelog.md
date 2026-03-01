# Changelog — Trading Dashboard

Historial completo de cambios por sesión. Orden cronológico inverso (más reciente arriba).

---

## 2026-03-01 — Sesión 12 (iteración 2)

### Mejoras formulario gastos (feedback)

**proxy.cjs**
- Nuevo tabla `gasto_config` en schema (idempotente): almacena tipos de movimiento, entidades y productos configurables.
- Defaults insertados: `tipo_movimiento` (Gasto, Ingreso, No computable), `entidad` (Itaú, Scotiabank, Tenpo), `producto` (Tarjeta Mastercard Tenpo, Tarjeta BCI Black, Efectivo).
- Nuevos endpoints: `GET /api/gastos/config`, `POST /api/gastos/config`, `DELETE /api/gastos/config/:id`.
- Resumen y total_real: filtro cambiado de `!= 'Pago tarjeta'` a `= 'Gasto'` para alinear con nueva semántica.

**GastosTab.jsx**
- `tipo_movimiento`: dropdown dinámico desde BD (no más array estático).
- `entidad`: select desde BD (no más input libre).
- `nombre_producto`: select desde BD; eliminado campo `tipo_producto` redundante.
- Rate USD/CLP: mostrado como campo editable con label "(auto)". Al modificar rate, USD equiv se recalcula en tiempo real junto con cambio de importe o moneda.
- Carga de config (`gasto_config`) en el `useEffect` de inicio.

**MaintainersTab.jsx — subtab "💸 Categ. Gastos" expandido**
- Layout en grilla 4 cards: Categorías, Tipos de movimiento, Entidades, Productos.
- Cada card tiene add+delete directo a BD.
- Reutiliza lógica genérica `addGastoConfig` / `deleteGastoConfig` con el campo `tipo`.

---

## 2026-03-01 — Sesión 12

### Fix: Reconciliación Binance — side invertido + commission asset

**TradeTab.jsx línea 539**
- Root cause 1 (side): `t.buyer ? "Long" : "Short"` incorrecto. En un closing trade, `buyer=true` = BUY = cerrando SHORT → tipo "Short". Fix: `t.buyer ? "Short" : "Long"`.
- Root cause 2 (PnL): commission se restaba siempre como USDT. Si el usuario paga fees en BNB, el valor en la respuesta está en BNB (no USDT) → PnL incorrecto. Fix: solo restar commission cuando `commissionAsset === "USDT"`.
- Patrón #28 documentado en CLAUDE.md.

### Nuevo: Módulo de Gastos (G1–G6)

**proxy.cjs — endpoints gastos**
- `POST /api/gastos/migrate-schema` — crea tablas `gastos` + `gasto_categorias` (idempotente). Inserta 10 categorías por defecto si la tabla está vacía.
- `GET/POST/DELETE /api/gastos/categorias` — CRUD de categorías en BD.
- `POST /api/gastos/list` — listado con filtros (fecha, categoría, tipo de movimiento, entidad). Retorna total y total_real (excluye pagos de tarjeta).
- `POST /api/gastos` — crear gasto.
- `PUT /api/gastos/:id` — editar gasto.
- `DELETE /api/gastos/:id` — soft delete.
- `POST /api/gastos/resumen` — agrupado por categoría + por día del mes, excluyendo "Pago tarjeta".
- `GET /api/gastos/usd-rate` — tipo de cambio USD/CLP desde Yahoo Finance (CLP=X).

**GastosTab.jsx — componente nuevo**
- Subtab "📝 Nuevo gasto": formulario completo (fecha, importe, moneda, categoría, tipo movimiento, entidad, nombre/tipo producto, concepto, nota, USD equiv).
- Auto-cálculo USD equiv al ingresar importe (usa rate de Yahoo Finance en tiempo real).
- Subtab "📋 Lista": tabla con filtros por período, categoría y tipo de movimiento. Soft delete + edición inline. Total real (excl. pagos tarjeta) + equiv USD.
- Subtab "📊 Resumen mensual": KPIs (total mes, total USD, top categoría), breakdown por categoría con barras de progreso y porcentaje, gráfico de barras por día.
- Schema inicializado automáticamente al cargar el tab (sin intervención manual).

**MaintainersTab.jsx — subtab "💸 Categ. Gastos"**
- CRUD de categorías desde BD (nuevo subtab entre Telegram y Test SL/TP).
- Agregar categoría con nombre + emoji, eliminar con confirmación.

**App.jsx**
- Import GastosTab + tab "💸 Gastos" en la nav + render `{tab === "gastos"}`.

### Archivos modificados
- `src/components/TradeTab.jsx`
- `src/proxy.cjs`
- `src/components/GastosTab.jsx` (nuevo)
- `src/components/MaintainersTab.jsx`
- `src/App.jsx`
- `src/changelog.md`
- `src/comentarios.md`

---

## 2026-03-01 — Sesión 11

### Fixes

**Trades filter — isClosing flag → TradeTab.jsx**
- Root cause: la resta de commission en el agrupado de fills hacía que órdenes de apertura (realizedPnl=0, commission≠0) tuvieran pnl≠0 y pasaran el filtro `|pnl| > 0.001`. Resultado: app mostraba 6 trades (3 aperturas + 3 cierres) cuando Binance Position History muestra 3.
- Fix: flag `isClosing = true` solo cuando algún fill tiene `realizedPnl != 0`. Filtro cambiado de `|pnl| > 0.001` a `t.isClosing`. Ahora solo se importan órdenes de cierre de posición (1 fila = 1 posición cerrada = coincide con Position History de Binance).

**SL/TP definitivo — fapi/v1/algoOrder → TradeTab.jsx + proxy.cjs**
- Root cause: Binance migró STOP_MARKET/TAKE_PROFIT_MARKET al Algo Order API (2025-11-06). El endpoint `fapi/v1/order` devuelve -4120 para estas órdenes en TODAS las cuentas.
- Fix: nuevo endpoint `POST /api/binance/futures/algoOrder` usando `fapi/v1/algoOrder` con `algoType=CONDITIONAL` y `triggerPrice` (en vez de `stopPrice`). Confirmado funcionando por el usuario (ordenes visibles en UI Binance).
- Para órdenes LIMIT pendientes: sigue mostrando toast (no se pueden poner SL/TP hasta ejecutar).
- Patrón #27 documentado en CLAUDE.md.

**SSL para BD cloud → proxy.cjs + MaintainersTab.jsx**
- proxy.cjs: `sanitizePgCfg` detecta hosts cloud (supabase, neon, railway, render) → `ssl: { rejectUnauthorized: false }` automático. También trigger manual con `cfg.ssl = true`.
- MaintainersTab: checkbox "SSL / Base de datos cloud" en tab DB.
- Supabase ahora es la BD cloud recomendada (Oracle descartado por problemas de registro).

**Seguridad — comentarios.md protegido**
- Archivo añadido a `.gitignore` + `git rm --cached` para que no se suba a GitHub.
- Las API keys que estaban en el archivo NUNCA llegaron a GitHub (no estaban staged).

### Infraestructura

**phaseII.md actualizado — Oracle → Supabase**
- Reemplazado todo el setup de Oracle Free Tier por instrucciones de Supabase.
- Incluye: crear cuenta, obtener host, configurar en Maintainers (SSL checkbox), inicializar schema.
- Agregado: ngrok como alternativa sin VM para Telegram webhook.
- Backlog Phase II ordenado por prioridad.

---

## 2026-02-28 — Sesión 10

### Fixes (feedback #1–#6 de comentarios.md + backlog)

**#3 — Call "S/E" en reconciliación BN → TradeTab.jsx**
- Root cause: `source: "Binance"` hardcodeado en el grouping de fills de userTrades.
- Fix: `source: "S/E"` en el objeto agrupado. También corregido fallback en `proxy.cjs` (`import-bn-trades`).

**#2 — Eliminar botones obsoletos → MaintainersTab.jsx**
- Removidas las cards "Verificar / Actualizar Schema BD" y "Migrar Historial a BD". La BD ya está operativa, esos botones no son necesarios.

**#1 — SL/TP solo toast informativo → TradeTab.jsx**
- Root cause: Binance devuelve -4120 permanentemente para STOP_MARKET/TAKE_PROFIT_MARKET en esta cuenta (patrón #27).
- Fix: `placeSLTPOrders` ya no hace llamadas a Binance. Solo muestra un `toast.warning` con los valores SL/TP para que el usuario los configure manualmente en Binance UI. Se eliminó también el delay de 300ms que ya no tiene sentido.

**#6 — Fees en importación → TradeTab.jsx + proxy.cjs**
- Root cause: el grouping de fills solo sumaba `realizedPnl`, no descontaba `commission`.
- Fix importación nueva: `pnl += realizedPnl - commission` por fill en `fetchBnTradeHistory`.
- Fix BD existente: nuevo endpoint `POST /api/db/fix-bn-fees` — va a Binance, agrupa commission por orderId, hace UPDATE en BD. Botón "🔧 Fix Fees en BD" en la UI de reconciliación (mismo selector de cuenta/símbolo/rango).

**#4 — Performance tab con datos de BD → App.jsx + PerformanceTab.jsx**
- App.jsx: estado `dbTrades` + `useEffect` que fetcha hasta 5000 trades de BD cuando `dbConfig` tiene password. Se pasa como prop a PerformanceTab y Dashboard.
- PerformanceTab: merge localStorage + BD sin duplicados (dedup por `local_id`). BD-only trades (reconciliados de Binance) se agregan al pool.
- Filtro de período usa `closed_at` (BD) o `date` (localStorage) correctamente.
- Nuevo filtro "Call" dinámico (valores distintos del campo `source` del merge completo).

**#5 — Dashboard P&L Cerradas histórico → Dashboard.jsx**
- `pnl`, `wr`, `allClosed.length` calculados sobre el merge localStorage + BD.
- El stat "P&L Cerradas" ahora refleja el PnL real histórico completo, no solo lo que está en localStorage.

**phaseII.md — Documentación de infraestructura**
- Nuevo archivo con guía completa: GitHub, Oracle Free Tier, Telegram bidireccional, Discord bot, arquitectura VM, costos ($0/mes), checklist de setup.

### Patrón registrado
- **#27** en CLAUDE.md: SL/TP -4120 permanente → no enviar a Binance, solo toast informativo.

### Archivos modificados
- `src/components/TradeTab.jsx`
- `src/components/MaintainersTab.jsx`
- `src/components/PerformanceTab.jsx`
- `src/components/Dashboard.jsx`
- `src/App.jsx`
- `src/proxy.cjs`
- `src/claude.md`
- `src/phaseII.md` (nuevo)

---

## 2026-02-27 — Sesión 9

### Fixes (feedback #1–#4 de comentarios.md sesión 9)

**#1 — SL/TP Market order — delay 300ms post-order → TradeTab.jsx**
- Root cause probable: Binance necesita un instante para registrar la posición tras una orden MARKET antes de aceptar un STOP_MARKET con `closePosition=TRUE`.
- Fix: `await new Promise(r => setTimeout(r, 300))` antes de llamar `placeSLTPOrders` cuando `orderType === "MARKET"`.

**#2 — Reconciliar BN >7 días → proxy.cjs**
- Root cause: `fapi/v1/userTrades` limita a 7 días por request. El proxy hacía una sola llamada.
- Fix: paginación automática en el proxy. Si el rango supera 7 días, se divide en ventanas de 7 días y se hacen múltiples requests. Los resultados se agregan antes de responder.

**#3 — Descripción "Migrar schema" → MaintainersTab.jsx**
- Renombrado a "Verificar / Actualizar Schema BD" con descripción detallada de qué hace (`deleted_at`, `bn_order_id`) y cuándo es necesario.

**#4 — Filtrar trades con PnL=0 en reconciliación → TradeTab.jsx**
- Fix: `.filter(t => Math.abs(t.pnl) > 0.001)` antes de mostrar el preview. Solo se muestran cierres reales con PnL realizado ≠ 0.

### Archivos modificados
- `src/components/TradeTab.jsx`
- `src/components/MaintainersTab.jsx`
- `src/proxy.cjs`

---

## 2026-02-26 — Sesión 8 (iteración 3)

### Fixes post-testing (tercer round)

**SL/TP -4120 error — closePosition=TRUE para MARKET, skip para LIMIT**
- Root cause: `reduceOnly=true + quantity` en STOP_MARKET/TAKE_PROFIT_MARKET falla con error -4120 ("use Algo Order API").
- Fix MARKET: usar `closePosition=TRUE` sin quantity → Binance cierra toda la posición cuando el stop se activa.
- Fix LIMIT: NO colocar SL/TP en Binance (posición aún no existe) → info toast "colocar manualmente cuando ejecute".

**Call field inconsistencia — DbTradeEditForm**
- Root cause: select de Call tenía opciones estáticas [YO, Chroma, Silla, Mizer, Otro]. Trades de Binance sync tienen `source: "Binance Position Sync"` que no está en la lista → se perdía el valor al editar.
- Fix: render condicional de la opción actual si no está en `callOpts`.

**Call Options configurables (Maintainers → Call Options)**
- Nueva funcionalidad: subtab "Call Options" en MaintainersTab.
- Permite agregar/quitar valores del campo Call desde la UI.
- Persiste en localStorage (`callOpts`), inicializa con defaults.
- Todos los formularios (open, hist, DbTradeEditForm) usan `callOpts` prop dinámico.

**Filter dropdown CSS — left shift corregido**
- Root cause: `position:relative` en `<th>` no funciona en todos los navegadores para posicionar el dropdown.
- Fix: wrapper `<div style={{position:"relative",display:"inline-block"}}>` dentro del th.

**Empty state con min-height cuando filtros activos**
- Cuando hay datos cargados pero el filtro devuelve 0 resultados: mostrar mensaje + botón "Limpiar filtros" en `<td colSpan={10}>`.

---

## 2026-02-26 — Sesión 8 (iteración 2)

### Fixes post-testing

**#1 SL/TP — closePosition + reduceOnly fix**
- Root cause 1: `closePosition=true` (lowercase) — Binance requiere `closePosition=TRUE` (mayúsculas). Fix en proxy.
- Root cause 2: `closePosition=TRUE` requiere posición EXISTENTE. Para LIMIT pendiente, no hay posición aún → Binance rechaza.
- Fix: SL/TP usan `reduceOnly=true + quantity` en lugar de `closePosition`. Funciona para LIMIT pendiente Y MARKET. Si no hay posición cuando se activa, Binance cancela la orden (comportamiento correcto).

**#2 Duplicados LIMIT — stale closure fix**
- Root cause: `syncBinancePositions` capturaba `openPositions` del closure de `useCallback`. Si el bnOrderId se setea DESPUÉS de que sync empieza, el check `alreadyTracked` ve la versión vieja (sin bnOrderId) y crea duplicado.
- Fix: `openPositionsRef` (useRef actualizado en useEffect) — la sync siempre lee la versión más reciente, sin depender del closure. Removido `openPositions` de deps de useCallback.

**#5 Soft delete — DELETE HTTP correcto**
- Root cause: `PUT /api/db/trades/:id/delete` como método — semánticamente incorrecto y confunde la ruta.
- Fix: `DELETE /api/db/trades/:id` — método correcto + cliente actualizado.

**#4 Reconciliación — symbol obligatorio**
- Root cause: Binance `fapi/v1/userTrades` requiere `symbol` como parámetro obligatorio (error -1102).
- Fix: validación en proxy + campo obligatorio en UI con label descriptivo.

**Nuevo feature — Filtros de cabecera en BD Historial**
- Columnas filtrables: Asset, Tipo, Cuenta, Resultado, Call (antes Fuente)
- Click en header → dropdown con valores distinct (multi-select con checkboxes)
- "Todos" / "Ninguno" en cada filtro + indicador del número de filtros activos
- Botón "Limpiar filtros" cuando hay filtros activos
- Se filtra sobre la página cargada en memoria

**Nuevo feature — Columna Cuenta en BD Historial**
- Muestra el nombre de la cuenta (resuelve el account ID via `accounts`)

**Renombrar Fuente → Call**
- En toda la UI: formulario abierto, histórico, edición de BD, columna en tabla

---

## 2026-02-26 — Sesión 8

### Implementado (feedback #1–#6 de comentarios.md sesión 8)

**#2 — Fix duplicados al sincronizar Binance → TradeTab.jsx**
- Root cause: al crear orden desde el form, la pos se agregaba localmente sin `bnOrderId`. Al sincronizar, Binance veía la orden como nueva y creaba un duplicado.
- Fix LIMIT: `placeBinanceOrder` recibe `posId` y actualiza la pos local con `bnOrderId` tras éxito.
- Fix MARKET: órdenes market de Binance ya NO se agregan localmente. Se envían directo a Binance y se traen via sync (`positionRisk`). Si Binance falla, la pos local se remueve.
- Patrón registrado en CLAUDE.md.

**#1 — SL/TP al crear orden Binance → TradeTab.jsx + proxy.cjs**
- Implementación: tras el main order (LIMIT o MARKET), se colocan automáticamente:
  - `STOP_MARKET` con `closePosition=true` → SL (mismo flujo que Binance UI)
  - `TAKE_PROFIT_MARKET` con `closePosition=true` → TP
- OCO no aplica en Futures. Son 3 llamadas API independientes.
- Proxy: endpoint `/api/binance/futures/order` actualizado para aceptar `stopPrice` y `closePosition`.
- Toast individual por SL y TP enviados.

**#3 — Market order sin Entry Price → TradeTab.jsx**
- Campo Entry se oculta cuando `orderType === "Market"`.
- Usa precio live (`prices[asset].price`) para calcular qty y entry al ejecutar.
- Validación: entry solo requerido para Limit.

**#5 — Soft delete en historial BD → proxy.cjs + TradeTab.jsx + MaintainersTab.jsx**
- Schema: columna `deleted_at TIMESTAMP DEFAULT NULL` en tabla `trades`.
- Nuevo endpoint `PUT /api/db/trades/:id/delete` → `UPDATE SET deleted_at = NOW()`.
- Todos los listados y conteos filtran `WHERE deleted_at IS NULL`.
- MaintainersTab: botón "Aplicar migraciones de schema" (`POST /api/db/migrate-schema`).
- TradeTab BD Historial: botón 🗑 soft delete con confirmación en cada fila.

**#6 — Hora en historial de trades → TradeTab.jsx + proxy.cjs + App.jsx**
- Form "Histórico": nuevo input `time` (HH:MM) combinado con fecha para `closed_at`.
- DbTradeEditForm: idem — input Hora con valor inicial desde `closed_at` existente.
- BD Historial: columna Fecha muestra hora debajo del día.
- `persistTrade` en App.jsx y endpoints de INSERT/UPDATE pasan `closed_at` explícitamente.

**#4 — Reconciliar trades desde Binance → proxy.cjs + TradeTab.jsx + db-setup.sql**
- Schema: columna `bn_order_id VARCHAR(50)` UNIQUE nullable + índice.
- Nuevo endpoint `POST /api/binance/futures/tradeHistory` → `fapi/v1/userTrades`.
- Nuevo endpoint `POST /api/db/import-bn-trades` con dedup por `bn_order_id` (`ON CONFLICT DO NOTHING`).
- TradeTab: nuevo modo "Reconciliar BN" — seleccionar cuenta + rango de fechas → preview con checkboxes → importar a BD.
- Los fills múltiples del mismo orderId se agrupan y acumulan PnL.

### Archivos modificados
- `src/proxy.cjs`
- `src/components/TradeTab.jsx`
- `src/components/MaintainersTab.jsx`
- `src/App.jsx`
- `src/db-setup.sql`

---

## 2026-02-25 — Sesión 7

### Implementado (issues #1–#6 de comentarios.md sesión 7)

**#1 — BD PostgreSQL: diagnóstico y fix de configuración**
- Root cause: La BD requiere SCRAM auth (PostgreSQL 18). El proxy enviaba `undefined` como password → falla.
- Fix operativo: el usuario debe ingresar la clave en MaintainersTab → DB → campo Password.
  Una vez configurada, el proxy la usa correctamente (verificado vía curl).
- La BD tiene schema correcto (6 tablas). Solo 2 trades de prueba → migración pendiente desde UI.

**#2 — Órdenes fantasma en sync Binance → App.jsx**
- Root cause: `openOrders` devuelve TODOS los tipos de órdenes (STOP_MARKET, TAKE_PROFIT_MARKET, etc.)
  con `price=0`. Se importaban como posiciones falsas con entry=0.
- Fix: filtro en `syncBinancePositions` — solo importar `order.type === "LIMIT" && price > 0`.
- Agregada reconciliación: en cada sync, se eliminan de `openPositions` las órdenes con `bnOrderId`
  que ya no aparecen en Binance (fueron ejecutadas o canceladas).

**#3 — Precision error -1111 (LIT/USDT y similares) → proxy.cjs**
- Root cause: Binance requiere precisión exacta por símbolo (stepSize para qty, tickSize para precio).
- Fix: helpers `roundToStep()` y `getBnFuturesFilters()` en proxy.cjs.
  El endpoint `/api/binance/futures/order` ahora auto-fetcha los filtros del símbolo y redondea
  qty y price antes de enviar a Binance.

**#4 — Header uPnL estático (bug) → Header.jsx**
- Root cause: `totalUPnL = reduce(pos.upnl)` usaba el valor guardado, no el live. Además mostraba
  el total global en cada cuenta con posiciones abiertas (incorrecto).
- Fix: `calcLiveUpnlHeader()` calcula uPnL live por cuenta, igual que Dashboard.
  Cada cuenta muestra solo su propio uPnL calculado con precio actual.

**#5 — Stocks Quantfury vía Yahoo Finance → proxy.cjs + useMarketData.js + MarketTab.jsx**
- Nuevo endpoint `GET /api/prices/stock?symbol=NVDA` → Yahoo Finance v8 chart API, ticker directo.
- `useMarketData.js`: nuevo bloque para `source:"stock"` → fetch via `/api/prices/stock`.
- `MarketTab.jsx`: nueva opción "Stock (Yahoo Finance)" en selector de fuente. Funciona con NVDA,
  MELI, AAPL, TSLA, NKE y cualquier ticker de Yahoo Finance.

**#6 — Alertas TG no se resetean al cambiar SL/TP → App.jsx**
- Root cause: claves de deduplicación `sl_${id}` y `tp_${id}` no incluían el valor.
  Si el SL cambiaba, la misma clave seguía en `alertsSentRef` y no se disparaba nueva alerta.
- Fix: claves ahora incluyen el valor: `sl_${id}_${sl}`, `tp_${id}_${tp}`, `entry_${id}_${entry}`.
  Al cambiar SL/TP → nueva clave → nueva alerta se dispara automáticamente.

**#1b — Migración Google Sheets → BD PostgreSQL (directo)**
- Fetch del sheet público como CSV → parseado → 9 trades históricos Quantfury insertados vía psql.
- BD ahora tiene 14 trades: 9 históricos (dic 2025 – feb 2026) + 5 de hoy.

**#3b — Balance efectivo en header (base + uPnL live)**
- Header.jsx: el número principal del balance ahora muestra `acc.balance + accUpnl` (efectivo).
  El chip pequeño sigue mostrando el componente uPnL por separado.

**#4b — Inspector Stocks Yahoo Finance en MarketTab**
- Nueva sección "Inspector Stocks (Yahoo Finance)" con input, botón Buscar y resultado inline.
- Muestra precio + cambio % si el ticker existe, error si no. Botón "+ Agregar" directo al watchlist.

**#5 — Sync Binance: SL/TP automático desde órdenes STOP/TP de Binance → App.jsx**
- `syncBinancePositions` ahora construye `slTpMap` desde `STOP_MARKET` y `TAKE_PROFIT_MARKET` orders.
- Al importar posiciones nuevas desde positionRisk → SL/TP se setean directamente.
- Posiciones ya trackeadas sin SL/TP → se actualizan en cada sync si Binance tiene esas órdenes.

### Archivos modificados
- `src/App.jsx`
- `src/components/Header.jsx`
- `src/proxy.cjs`
- `src/hooks/useMarketData.js`
- `src/components/MarketTab.jsx`
- `src/CLAUDE.md`
- `src/todo.md`
- `src/changelog.md`
- `src/comentarios.md`
- BD `trading_fw` → 9 trades históricos insertados

---

## 2026-02-24 — Sesión 6

### Implementado (items #1–#8 de comentarios.md)

**#1 — Migrar datos a PostgreSQL → db-setup.sql v2 + proxy.cjs + MaintainersTab**
- `db-setup.sql` v2: columnas simplificadas (`date`, `account`, `pnl`) alineadas con el app. Se agrega `local_id BIGINT UNIQUE` para deduplicación en migración. Actualizada la vista `v_performance`.
- `persistTrade()` corregido: INSERT ahora usa columnas correctas + `ON CONFLICT (local_id) DO NOTHING`.
- Nuevo endpoint `POST /api/db/migrate-trades`: bulk insert con transaction, `ON CONFLICT DO NOTHING`, devuelve `{ inserted, total }`.
- Nuevo endpoint `POST /api/db/trades`: lista paginada con `{ limit, offset }`.
- Nuevo endpoint `PUT /api/db/trades/:id`: actualiza campos permitidos por ID.
- MaintainersTab > DB: botón "📤 Migrar closedTrades → BD" + "🔢 Contar trades en BD".
- ⚠️ Requiere recrear la BD: `dropdb trading_fw && psql postgres -f src/db-setup.sql`

**#2 — DB Trades Viewer → TradeTab.jsx**
- Nuevo modo "🗄 BD Historial" en TradeTab. Selector de page size (10/20/50/100), paginación.
- Formulario `DbTradeEditForm` inline para editar cualquier trade de BD.
- `dbConfig` ahora se pasa desde App.jsx a TradeTab.

**#3 — Cierre correcto de posiciones Binance → proxy.cjs + LivePositions.jsx**
- Nuevo endpoint `POST /api/binance/futures/closePosition`: obtiene `unRealizedProfit` antes de cerrar, luego coloca una orden MARKET `reduceOnly=true`. Devuelve `{ ok, pnl, order }`.
- LivePositions: botón "Cerrar" sin prompt de P&L. Para posiciones activas Binance (`bnPositionKey`) → llama API; para manuales/Quantfury → usa live uPnL directamente.
- Telegram solo se envía desde `closePosition()` en App.jsx, después de confirmar cierre.

**#4 — uPnL no aplica a órdenes Limit pendientes → LivePositions.jsx**
- `calcLiveUpnl`: retorna `null` si `pos.orderType === "Limit"`. Muestra "–" y badge "⏳ Limit pendiente".

**#5 — Balance efectivo live → Dashboard.jsx**
- `calcLiveUpnlDash()`: replica lógica de uPnL incluyendo `size` para Quantfury.
- Stat card "Balance Efectivo" = base balance + live uPnL de todas las posiciones abiertas.

**#6 — Alertas Telegram fase II → App.jsx**
- `alertsSentRef` (useRef Set) para deduplicar alertas por posición y evento.
- `useEffect` sobre `prices`: detecta entry hit (para Limit), SL hit, TP hit → envía Telegram.

**#7 — Editar size/margen en posiciones → LivePositions.jsx**
- `calcLiveUpnl` prioriza: `size` (Quantfury trading power) → `qty × entry` (Binance/HL) → `margin × leverage`.
- Nuevos inputs editables en action bar de cada posición: SL, TP, Size $, uPnL manual.

**#8 — Eliminar Google Sheets de Maintainers → MaintainersTab.jsx**
- Removido tab "📋 Google Sheets" de subTabs y su bloque JSX.

---

## 2026-02-24 — Sesión 5

### Implementado

**#5 — Market orders de Binance ahora aparecen en Dashboard → proxy.cjs + App.jsx**
- Root cause: `openOrders` solo devuelve órdenes LIMIT pendientes. Las órdenes Market se ejecutan inmediatamente y pasan a `positionRisk`.
- Nuevo endpoint `POST /api/binance/futures/positions` → llama `fapi/v2/positionRisk`, filtra solo posiciones con `positionAmt != 0`
- `syncBinancePositions` en App.jsx ahora hace dos fetches por cuenta:
  1. `openOrders` → órdenes LIMIT pendientes (dedup por `bnOrderId`)
  2. `positions` → posiciones activas incl. market orders (dedup por `bnPositionKey = bn_pos_{accId}_{symbol}`)
- Posiciones importadas incluyen `upnl` desde `unRealizedProfit`, `leverage` real, `qty` real

**#6 — Alertas Telegram al sincronizar → App.jsx**
- `syncBinancePositions` llama `sendTg(...)` por cada nueva orden/posición encontrada
- Orden LIMIT: `📡 Nueva orden detectada (Binance)` con símbolo, side, precio
- Posición activa: `📡 Posición activa detectada (Binance)` con símbolo, side, entry, uPnL
- `sendTg` agregado a las dependencias del `useCallback`

**#1 — OIL precio vía Yahoo Finance → proxy.cjs + constants + useMarketData**
- `YAHOO_MAP = { OIL:"CL=F", GOLD:"GC=F", SILVER:"SI=F", GAS:"NG=F", WHEAT:"ZW=F" }` en proxy.cjs
- Nuevo endpoint `GET /api/prices/commodity?symbol=OIL` → Yahoo Finance v8 chart API
- `export const COMMODITY_MAP = { OIL:"CL=F", GOLD:"GC=F", ... }` en constants/index.js
- `WATCHLIST_INIT` OIL: `source:"hyperliquid"` → `source:"commodity"`
- `useMarketData.js`: nuevo bloque commodity antes de Hyperliquid. Para assets `source:"commodity"` o `source:"auto"` en `COMMODITY_MAP` → llama `/api/prices/commodity`
- Auto-assets que sean commodity ya no se intentan buscar en HL (evita falso warning)

### Archivos modificados
- `src/proxy.cjs`
- `src/App.jsx`
- `src/constants/index.js`
- `src/hooks/useMarketData.js`
- `src/changelog.md`

---

## 2026-02-24 — Sesión 4

### Implementado

**#1 — Sync balance Binance Futures → AccountsTab**
- Botón 🔄 al lado del campo Balance en cuentas Binance
- Llama `/api/binance/futures/balance` → actualiza `acc.balance` con `availableBalance`
- Reemplaza flujo 100% manual

**#6 — uPnL en tiempo real → LivePositions**
- `calcLiveUpnl(pos, lp)`: `margin × leverage × (livePrice - entry) / entry × direction`
- Si no hay margin pero hay `qty`, usa `qty × entry` como notional
- Live uPnL toma prioridad sobre valor manual; si no hay precio, cae al guardado
- Label cambia a "📡 Live uPnL" cuando está activo
- Prompt de cierre sugiere el valor live calculado

**#8 — Botón "🔄 Sync Binance" en Dashboard → App.jsx + LivePositions**
- `syncBinancePositions()` en App.jsx: itera cuentas Binance con keys, fetch open orders, agrega posiciones no trackeadas (dedup por `bnOrderId`)
- Posiciones importadas incluyen `bnOrderId`, `bnStatus`, `qty`, `source:"Binance Sync"`
- Assets importados se añaden automáticamente al watchlist
- Botón visible en cabecera de LivePositions (con y sin posiciones abiertas)

**#7 Phase 1 — Cancel Binance order desde Dashboard → LivePositions**
- Posiciones con `bnOrderId` muestran "🚫 Cancelar BN" en lugar de "🛑 Stop"
- Llama `POST /api/binance/futures/cancelOrder` con confirm → remueve de openPositions si exitoso
- Ya no hay que ir a Cuentas → Binance para cancelar

**#5 — Stats dinámicas en Dashboard**
- Reemplazó hardcodes `$57.67`, `-73.2%` con cálculos en vivo:
  - Balance Total = `accounts.reduce(sum, acc.balance)`
  - uPnL Abierto = `openPositions.reduce(sum, pos.upnl)`
  - P&L Cerradas = `closedTrades.reduce(sum, t.pnl)`
  - Win Rate = `W / (W+L) * 100`

**Instrucción permanente del usuario registrada:**
> Al finalizar cada sesión, crear resumen en changelog.md y mandarlo en el chat.

### Archivos modificados
- `src/components/LivePositions.jsx`
- `src/components/Dashboard.jsx`
- `src/components/AccountsTab.jsx`
- `src/App.jsx`
- `src/comentarios.md`
- `src/CLAUDE.md`
- `src/changelog.md` (nuevo)

---

## 2026-02-23 — Sesión 3

### Implementado

**#20 — Campo "Riesgo ($)" auto-calcula margen → TradeTab**
- Reemplaza campo "Margen ($)" por "Riesgo ($)"
- Fórmula: `margin = riesgo / (slPct × leverage)` donde `slPct = |sl - entry| / entry`
- Margen calculado se muestra en tiempo real debajo del campo
- Botón 📥 (Binance): si entry+SL presentes → calcula riesgo desde 20% del balance; si no → solo muestra balance disponible

**Histórico (bonus) — Modo "📥 Histórico" → TradeTab**
- 4to modo para registrar trades ya ejecutados/cerrados directamente al historial
- Campos: fecha, asset, tipo, cuenta, entry, SL, TP, leverage, orderType, outcome, P&L, fuente, reasoning
- Llama `onAdd` → persiste a closedTrades + DB via App.jsx
- Útil para reconciliar órdenes de Binance ejecutadas offline

**#8 — Filtro de búsqueda en HL Inspector → MarketTab**
- Input de búsqueda en tiempo real sobre la lista de tickers HL
- Filtra: `hlMeta.filter(a => !a.isVault && (!hlSearch || a.name.includes(hlSearch)))`

**#19 — Open orders Binance con cancel → proxy.cjs + AccountsTab**
- Endpoints: `POST /api/binance/futures/openOrders` + `POST /api/binance/futures/cancelOrder`
- UI en AccountsTab: botón "📋 Órdenes activas" por cuenta Binance
- Lista: símbolo, side, tipo, precio, qty, ID, status; botón "✕ Cancelar" por orden
- Al cancelar: llama endpoint → refresca lista automáticamente

**comentarios.md — Checkmarks ✅ en ítems completados**
- Marcados: #1, #5, #6, #8, #9, #13, #14, #15, #16 Phase1, #17, #18, #19, #20

### Archivos modificados
- `src/components/TradeTab.jsx`
- `src/components/MarketTab.jsx`
- `src/components/AccountsTab.jsx`
- `src/proxy.cjs`
- `src/comentarios.md`
- `src/CLAUDE.md`

---

## 2026-02-23 — Sesión 2

### Implementado

**#15 — Fix: cerrar posición desde Dashboard no persistía**
- Causa raíz 1: `LivePositions` solo filtraba `openPositions`, nunca llamaba `addClosed` → trade desaparecía sin quedar en historial
- Causa raíz 2: Paper orders activadas conservaban status "active" aunque la posición se cerrara desde otro panel
- Fix: `closePosition(pos, pnl)` en App.jsx como única fuente de verdad — agrega a closedTrades + remueve de openPositions + persiste a BD
- Fix: `sourcePaperId` en posición activada + `useEffect` cleanup en TradeTab

**#13 — Trades cerrados a BD**
- `addClosed` y `closePosition` llaman `persistTrade(trade, dbConfig)` → INSERT silencioso en PostgreSQL
- localStorage sigue siendo fuente de verdad; BD es backup/consulta

**#16 Phase 1 — Órdenes Binance desde Trade y RiskCalc**
- TradeTab: botón 📥 auto-calcula 20% margen desde Binance; al registrar posición Binance, coloca orden automáticamente
- RiskCalc: botón "📡 Colocar en Binance Futures" después de calcular; muestra estado de orden

**#17 — Telegram integración**
- 3 endpoints en proxy.cjs: `POST /api/telegram/send`, `POST /api/binance/futures/openOrders`, `POST /api/binance/futures/cancelOrder`
- `sendTg()` en App.jsx: callback silencioso que envía alertas
- `closePosition` envía alerta al cerrar posición
- MaintainersTab: nuevo subtab "✈️ Telegram" con config token/chatId y botón de prueba

**#18 — Fix qty=0 en RiskCalc + error popup copiable**
- Causa raíz: `res.ps` es margen (= `r / slPct / leverage`), qty se calculaba como `ps/entry` (margen, no notional)
- Fix: `qty = ps × leverage / entry`; label "Notional" → "Margen req."
- Error popup: click en cualquier parte copia el texto; X para cerrar sin propagar

### Archivos modificados
- `src/App.jsx`
- `src/components/Dashboard.jsx`
- `src/components/LivePositions.jsx`
- `src/components/TradeTab.jsx`
- `src/components/RiskCalc.jsx`
- `src/components/MaintainersTab.jsx`
- `src/proxy.cjs`

---

## 2026-02-23 — Sesión 1

### Implementado

**#5 — R hardcodeada corregida**
- `rSize:2.65` hardcodeado → lee `rValues[cuenta]` al iniciar y al cambiar cuenta
- Centralizado en `DEFAULT_R_VALUES` en constants

**#6 — Botón 📋 Copiar en Paper Trading**
- Agrega botón junto a 📣 Post en Paper Orders; usa `navigator.clipboard.writeText(po.chromaPost)`

**#1 — Fix PostgreSQL SASL/SCRAM**
- `sanitizePgCfg()`: `password:""` → `undefined`, `port` → `parseInt`
- Pool se resetea cuando cambia la config (comparación por JSON.stringify key)

**#9 — Proyección de deudas corregida**
- `extra = tradInc = mR × sc.r` (trading va 100% al principal de deuda)
- Los $1517 son gasto recurrente separado, no descuentan del trading
- Snowball real por prioridad (Muy Alta → Alta → Muy Baja), proyección hasta 120 meses

**#14 — Test apertura posición Binance Futures**
- Endpoints: `POST /api/binance/futures/balance` + `POST /api/binance/futures/order`
- UI en AccountsTab: botón "🔬 Test Futures Position" con flujo preview → confirm → done

### Archivos modificados
- `src/components/RiskCalc.jsx`
- `src/components/TradeTab.jsx`
- `src/components/DebtPlan.jsx`
- `src/components/AccountsTab.jsx`
- `src/proxy.cjs`
- `src/constants/index.js`

---
