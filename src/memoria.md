# Memoria del proyecto — Trading Dashboard

Archivo de continuidad entre sesiones. Claude actualiza esto al finalizar cada sesión.

---

## Ultima sesion: Sesion 16 — 2026-03-07

### Que hicimos
1. Fix BD: `search_path=public` en `sanitizePgCfg()` → resuelve `relation "trades" does not exist` en Supabase
2. Fix gastos: eliminado `tipo_producto` de INSERT/UPDATE (no existe en schema Supabase)
3. Fix Express 5: wildcard `"*"` → `/(.*)/ ` en static file serving
4. Sistema de memoria → este archivo
5. Deploy Fly.io completo y operativo: `https://mi-trading-fw.fly.dev`
   - CLAUDE.md actualizado: yo hago deploy automaticamente al cerrar sesion
6. Telegram webhook bidireccional implementado y desplegado:
   - `/gasto <importe> <categoria> [nota]` → guarda en Supabase
   - `/gastos` → resumen del mes
   - `/categorias` → lista categorias
   - `/ayuda` → help
   - Auto-registro de webhook al arrancar (si TG_TOKEN configurado)

### Estado actual — PENDIENTE ACTIVAR TELEGRAM
El codigo esta deployado pero el bot NO responde aun porque faltan los secrets en Fly.io.
El usuario debe correr UNA VEZ este comando en su terminal:

```bash
export PATH="$HOME/.fly/bin:$PATH"
flyctl secrets set \
  TG_TOKEN="<token del bot>" \
  TG_CHAT_ID="<tu chat id>" \
  DB_HOST="aws-1-sa-east-1.pooler.supabase.com" \
  DB_PORT="5432" \
  DB_NAME="postgres" \
  DB_USER="postgres.fwcjolnhghqqbclrbdrc" \
  DB_PASS="<password supabase>"
```

Fly.io redeploya automaticamente al setear secrets.
Despues de eso el bot esta 100% activo.

### Nota Binance
Binance bloquea IPs de datacenters (Fly.io). Las operaciones de Binance (sync, ordenes) solo funcionan desde el proxy local (`npm run start`). El dashboard en produccion es para monitoreo, gastos y trading log.

### Proximo paso
1. Usuario corre el comando de secrets de arriba
2. Testear bot: enviar /ayuda al bot de Telegram
3. Si funciona: Iteracion 2 completada ✅

---

## Arquitectura de deploy

```
Fly.io (mi-trading-fw.fly.dev)
  └── Node.js (proxy.cjs, PORT 3001)
        ├── /api/* → Express routes (Binance, BD, Gastos, TG)
        └── /* → React build (dist/)

Supabase (aws-1-sa-east-1.pooler.supabase.com)
  └── BD PostgreSQL (trades, gastos, gasto_categorias, gasto_config, ...)
```

---

## Historial resumido de sesiones

| Sesion | Fecha | Hecho clave |
|--------|-------|-------------|
| 1 | 2026-02-23 | Fix R hardcodeado, PostgreSQL SASL, proyeccion deudas |
| 2 | 2026-02-23 | closePosition unica fuente verdad, TG alertas, SL/TP RiskCalc |
| 3 | 2026-02-23 | Campo Riesgo($), modo Historico TradeTab, open orders BN |
| 4 | 2026-02-24 | Sync balance BN, uPnL live, sync Binance en Dashboard |
| 5 | 2026-02-24 | Market orders BN, OIL via Yahoo Finance, alertas TG sync |
| 6 | 2026-02-24 | PostgreSQL CRUD, DB Trades Viewer, cierre correcto BN, alertas fase II |
| 7 | 2026-02-25 | Fix BD SCRAM, posiciones fantasma, precision -1111, header uPnL, stocks YF |
| 8 | 2026-02-26 | SL/TP BN, duplicados sync, soft delete, filtros BD historial, Call Options |
| 9 | 2026-02-27 | SL/TP -4120 toast, BN >7 dias paginacion, filtro PnL=0 reconciliacion |
| 10 | 2026-02-28 | Performance BD, Dashboard PnL historico, Call S/E, phase II docs |
| 11 | 2026-03-01 | algoOrder SL/TP definitivo, SSL Supabase, seguridad comentarios.md |
| 12 | 2026-03-01 | Modulo Gastos completo, reconciliacion BN fixes multiples |
| 13 | 2026-03-02 | TG alertas SL/TP en mensajes, algoOpenOrders para sync |
| 14 | 2026-03-02 | Fix precision BN -1111, soporte dual BD (Local + Supabase) |
| 15 | 2026-03-04 | Fix BD local db name, Supabase Session Pooler, migracion bidireccional |
| 16 | 2026-03-07 | Fix search_path Supabase, sistema memoria, deploy Fly.io setup |
