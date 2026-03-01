# CLAUDE.md — Trading Dashboard

Guía de referencia para Claude. Se lee al inicio de cada sesión.
Los resúmenes de cambios van en `changelog.md`, no acá.

---

## Reglas de sesión

1. **Al iniciar:** Leer este archivo + `comentarios.md`.
   Revisar backlog activo antes de ejecutar cualquier tarea.
   **Credenciales:** La clave de la BD está en `comentarios.md` solo para uso en sesión.
   **NUNCA guardar credenciales en ningún archivo del proyecto (ni aquí, ni código, ni changelog).**
2. **Al finalizar:** Agregar entrada en `changelog.md` + marcar ✅ 
   en `comentarios.md` + enviar resumen en el chat.
3. **Nunca marcar tarea completa** sin validar: `npm run build` pasa, 
   cálculos financieros correctos, sin funcionalidad rota.
4. **Ante cualquier bug nuevo:** documentar causa raíz en 
   "Patrones de error" de este archivo antes de cerrar la sesión.

---

## Arquitectura del proyecto

```
src/
  App.jsx              — estado global, callbacks compartidos, routing de tabs
  proxy.cjs            — Express local (port 3001), firma Binance, proxy APIs
  constants/index.js   — ACCOUNTS_INIT, DEFAULT_R_VALUES, DEFAULT_LEV, PROXY, etc.
  hooks/
    usePersist.js      — localStorage con useState
    useMarketData.js   — precios en tiempo real (Binance, HL, CoinGecko)
    useToast.jsx       — sistema de notificaciones
  components/
    Dashboard.jsx      — stats, LivePositions, historial, anomalías
    LivePositions.jsx  — posiciones abiertas, uPnL live, sync Binance
    TradeTab.jsx       — open/paper/close/histórico modes
    RiskCalc.jsx       — calculadora de posición con orden Binance
    PerformanceTab.jsx — gráficos de performance
    DebtPlan.jsx       — snowball de deudas por prioridad
    MarketTab.jsx      — watchlist + HL inspector con filtro
    AccountsTab.jsx    — gestión de cuentas + sync balance + open orders
    MaintainersTab.jsx — R values, leverage, sheets, DB, Telegram
    Header.jsx         — precios BTC/CLP, selector fuente
```

---

## Patrones de error registrados

1. **pg Pool con password vacío** → `password || undefined` en `sanitizePgCfg()`
2. **Valores R hardcodeados** → usar `rValues[account]`, centralizado en `DEFAULT_R_VALUES`
3. **Cerrar posición sin persistir** → siempre pasar por `closePosition()` en App.jsx
4. **Pool pg cacheado sin reset** → comparar `JSON.stringify(config)` antes de reusar
5. **Paper orders huérfanas** → `sourcePaperId` + `useEffect` cleanup en TradeTab
6. **syncBinancePositions duplicados** → deduplicar por `bnOrderId` (string)
7. **qty Binance = 0** → qty = `margin × leverage / price`, NO `margin / price`
8. **Market orders no aparecen en sync** → `openOrders` solo devuelve LIMIT pendientes. Market orders ejecutadas están en `positionRisk` (`fapi/v2/positionRisk`). Usar ambos endpoints.
9. **OIL/GOLD no disponibles en HL** → Son CFDs de Quantfury/commodities, no perpetuos crypto. Usar Yahoo Finance (`CL=F` = OIL, `GC=F` = GOLD). Fuente `"commodity"` en watchlist.
10. **Sync trae órdenes SL/TP como posiciones** → `openOrders` devuelve todos los tipos. Filtrar por `order.type === "LIMIT" && price > 0`. Reconciliar en cada sync.
11. **Error -1111 Binance precision** → Cada símbolo tiene stepSize (qty) y tickSize (precio). Usar `getBnFuturesFilters()` + `roundToStep()` antes de enviar orden.
12. **Header uPnL estático** → Header usaba `pos.upnl` guardado, no el live. Calcular con `calcLiveUpnlHeader()` igual que Dashboard, por cuenta separada.
13. **Alertas TG no detectan cambios de SL/TP** → La clave de deduplicación debe incluir el valor: `sl_${id}_${sl}`. Si el valor cambia, la clave es nueva y la alerta se dispara.
14. **BD requiere password en config** → La BD postgres tiene SCRAM auth. El usuario debe ingresar la clave en MaintainersTab → DB → Password. La clave NO va en el código.
15. **Sync SL/TP solo actualiza si vacío** → Bug: `if (!pos.sl && ...)` no sobreescribe valores existentes. Usar `if (slTpMap[pos.asset].sl)` para SIEMPRE tomar el valor de Binance.
16. **Posiciones fantasma (ghost positions)** → Origen: orden rechazada por Binance pero agregada igual al dashboard. Solución: Sync con reconciliación elimina posiciones no presentes en positionRisk/openOrders.
17. **getBnFuturesFilters sin caché** → Añadir `_filterCache[symbol]` para no hacer llamada extra a exchangeInfo en cada orden del mismo símbolo.
18. **Duplicado en sync tras crear orden desde form** → La pos se agrega localmente sin `bnOrderId`. Al sincronizar, se crea otra. Fix: tras éxito Binance LIMIT, actualizar pos con `bnOrderId`. Para MARKET: no agregar localmente, dejar que `positionRisk` sync lo traiga.
19. **OCO no existe en Futures** → OCO es solo Spot. En Futuros, SL/TP son órdenes independientes: `STOP_MARKET` y `TAKE_PROFIT_MARKET` con `closePosition=true`. Se colocan después del main order.
20. **Soft delete requiere migracion schema** → La BD existente no tiene `deleted_at` ni `bn_order_id`. Usar `POST /api/db/migrate-schema` (idempotente) antes de usar soft delete o reconciliación.
21. **HTTP methods en rutas BD** → Usar verbos semánticamente correctos: `DELETE /api/db/trades/:id` para soft-delete (no PUT /delete). El método PUT confunde Express con rutas similares y confunde al usuario.
22. **closePosition=TRUE en Binance Futures** → Binance requiere el valor en MAYÚSCULAS (`TRUE`/`FALSE`). Además, `closePosition=TRUE` SOLO funciona si ya existe una posición abierta.
23. **fapi/v1/userTrades requiere symbol** → Binance Futures `GET /fapi/v1/userTrades` requiere `symbol` como parámetro obligatorio. Sin él devuelve error -1102. Siempre pedir symbol al usuario en reconciliación.
24. **SL/TP -4120 con reduceOnly** → `reduceOnly=true + quantity` en STOP_MARKET/TAKE_PROFIT_MARKET falla con "use Algo Order API". Fix: Para MARKET (posición activa), usar `closePosition=TRUE` sin quantity. Para LIMIT pendiente, NO colocar SL/TP en Binance — solo guardar localmente y mostrar info toast.
25. **Call dropdown no muestra valor actual** → Si el trade tiene `source` que no está en `callOpts` (ej: "Binance Position Sync"), el select debe renderizar la opción actual como primera opción condicional: `{vals.source && !callOpts.includes(vals.source) && <option value={vals.source}>{vals.source}</option>}`.
26. **position:relative en th de tabla** → Algunos navegadores ignoran `position:relative` en `<th>`. Usar un `<div style={{position:"relative",display:"inline-block"}}>` wrapper dentro del th para posicionar dropdowns correctamente.

---

## Fuentes de verdad

| Dato | Fuente primaria | Backup |
|------|----------------|--------|
| Trades cerrados | localStorage (`closedTrades`) | PostgreSQL (`trades` table) |
| Posiciones abiertas | localStorage (`openPositions`) | — |
| Paper orders | localStorage (`paperOrders`) | — |
| Cuentas | localStorage (`accounts`) | — |
| Config (DB, Telegram) | localStorage | — |

---

## Flujos críticos

### Cierre de posición
`closePosition(pos, pnl)` en App.jsx → única fuente de verdad:
1. Crea trade con outcome + anomaly check
2. `setCT(p => [...p, full])` — agrega a historial
3. `setOP(p => p.filter(...))` — remueve de abiertas
4. `persistTrade(full, dbConfig)` — INSERT en BD (silencioso)
5. `sendTg(...)` — alerta Telegram

### Sync Binance
`syncBinancePositions()` en App.jsx:
1. Itera cuentas Binance con apiKey + apiSecret
2. Llama `POST /api/binance/futures/openOrders`
3. Para cada orden: si `bnOrderId` no está en openPositions → agrega
4. Auto-agrega symbol al watchlist

### uPnL en tiempo real
`calcLiveUpnl(pos, lp)` en LivePositions:
- `notional = margin > 0 ? margin × leverage : qty × entry`
- `upnl = notional × (lp - entry) / entry × (Long ? 1 : -1)`
- Prioridad: live > manual

---

## Backlog activo

- [x] **#1** OIL price → resuelto vía Yahoo Finance (`CL=F`). COMMODITY_MAP en constants. Endpoint `/api/prices/commodity`.
- [ ] **#2** Sistema de anomalías — módulo dedicado (existe UI básica en Dashboard)
- [ ] **#3** Validación pago ≤ deuda + migrar a BD
- [x] **#5** Market orders Binance → resuelto. `positionRisk` endpoint + sync dual (openOrders + positions)
- [x] **#6** Alertas Telegram en sync → resuelto. `sendTg` por cada nueva posición/orden encontrada
- [ ] **#6 Phase 2** Alertas automáticas entry hit, SL hit, TP hit, R levels — requiere polling de precios en loop
- [ ] **#7** Poblar BD local + fuentes nuevas en Maintainers

---
