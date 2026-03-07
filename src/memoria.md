# Memoria del proyecto — Trading Dashboard

Archivo de continuidad entre sesiones. Claude actualiza esto al finalizar cada sesión.

---

## Ultima sesion: Sesion 16 — 2026-03-07

### Que hicimos
1. Fix critico BD: `search_path=public` en `sanitizePgCfg()` para Supabase pooler → resuelve `relation "trades" does not exist`
2. Sistema de memoria → este archivo, incluido en CLAUDE.md como lectura obligatoria al iniciar
3. Setup deploy completo para Fly.io:
   - `Dockerfile` + `fly.toml` + `.dockerignore`
   - `proxy.cjs`: PORT desde env, CORS dinamico en prod, sirve dist/ estatico en prod
   - `constants/index.js`: PROXY usa `VITE_PROXY_URL` env var (vacio en prod = mismo origen)
   - `.env.development`: `VITE_PROXY_URL=http://localhost:3001`
   - `package.json`: script `start:prod`
4. Guia de deploy en `src/deploy-guide.md`

### Estado actual
- Fix BD: aplicado en codigo, pendiente validar en vivo
- Deploy Fly.io: codigo listo, pendiente ejecutar los comandos del deploy-guide.md
- Iteracion 2 (Telegram gastos): pendiente

### Proximo paso
Ejecutar deploy: seguir `src/deploy-guide.md` paso a paso.
Luego arrancar Iteracion 2: comandos TG para gastos.

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
