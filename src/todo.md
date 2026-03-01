# TODO — Sesión 2026-02-27

## Issues de comentarios.md (sesión 9, segundo round)

---

### #1 — SL/TP -4120 persistente

**Root cause confirmado**: Binance rechaza `STOP_MARKET`/`TAKE_PROFIT_MARKET` con -4120 en esta cuenta,
tanto con `closePosition=TRUE` como con `reduceOnly`. Error: "Order type not supported for this endpoint. Please use the Algo Order API endpoints."

**Fix**: Remover el intento a Binance (que siempre falla). En su lugar, el toast de éxito de la orden principal muestra los valores de SL/TP prominentemente para que el usuario los configure manualmente en Binance UI. Registrar patrón #27 en CLAUDE.md.

- [ ] TradeTab.jsx: `placeSLTPOrders` → no enviar a Binance, mostrar toast informativo con valores SL/TP
- [ ] CLAUDE.md: registrar patrón #27

---

### #2 — Eliminar botones obsoletos de MaintainersTab

- [ ] MaintainersTab.jsx: eliminar card "Verificar / Actualizar Schema BD" (migrar schema)
- [ ] MaintainersTab.jsx: eliminar card / botón "Migrar closedTrades → BD"

---

### #3 — Call = "S/E" al importar desde Binance

- [ ] TradeTab.jsx: en `fetchBnTradeHistory` grouping → `source: "S/E"` en lugar de `source: "Binance"`

---

### #4 — Performance tab con datos de BD

Arquitectura: cargar `dbTrades` en App.jsx al montar (si dbConfig tiene password), pasar como prop.

- [ ] App.jsx: estado `dbTrades` + `useEffect` que fetcha `/api/db/trades` cuando `dbConfig` cambia
- [ ] App.jsx: pasar `dbTrades` a PerformanceTab y Dashboard
- [ ] PerformanceTab.jsx: aceptar `dbTrades` + merge con `closedTrades` (dedup por `local_id`)
- [ ] PerformanceTab.jsx: filtrar por 7d / 30d usa `closed_at` (BD) o `date` (localStorage)
- [ ] PerformanceTab.jsx: agregar filtro "Call" (por campo `source`) al lado del de cuentas

---

### #5 — Dashboard P&L Cerradas histórico

- [ ] Dashboard.jsx: aceptar `dbTrades` prop + calcular PnL mergeado (localStorage + BD, sin duplicados)

---

## Orden de implementación
1. #3 (1 línea, riesgo 0)
2. #2 (eliminar JSX, riesgo bajo)
3. #1 (cambio en placeSLTPOrders)
4. #4 App.jsx + PerformanceTab (mayor complejidad, base para #5)
5. #5 Dashboard
6. npm run build + validación
