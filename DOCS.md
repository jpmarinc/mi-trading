# Trading Framework — Documentación

> Proyecto personal de gestión de trading, deudas y capital.
> Stack: React + Vite (frontend) · Node.js Express (proxy local) · PostgreSQL (opcional)

---

## Cómo correr el proyecto

```bash
cd ~/Desktop/mi-trading
npm start          # levanta proxy (puerto 3001) + Vite dev (puerto 5173)
```

Para solo el proxy:
```bash
npm run proxy      # node src/proxy.cjs
```

Para solo la UI:
```bash
npm run dev        # vite
```

---

## Estructura de archivos

```
mi-trading/
├── src/
│   ├── App.jsx                    # Orquestador slim (~100 líneas)
│   ├── main.jsx                   # Entry point React
│   ├── proxy.cjs                  # Servidor Express local (CORS + APIs)
│   ├── constants/
│   │   └── index.js               # Todas las constantes globales
│   ├── hooks/
│   │   ├── usePersist.js          # Hook localStorage con persistencia
│   │   ├── useToast.jsx           # Sistema de notificaciones toast
│   │   └── useMarketData.js       # Hook de precios en tiempo real
│   ├── components/
│   │   ├── Header.jsx             # Barra superior (BTC, CLP/USD, balances)
│   │   ├── Dashboard.jsx          # Tab principal con posiciones + historial
│   │   ├── PerformanceTab.jsx     # Curva de capital + estadísticas
│   │   ├── RiskCalc.jsx           # Calculadora de riesgo + post Chroma
│   │   ├── MarketTab.jsx          # Watchlist de precios en tiempo real
│   │   ├── LivePositions.jsx      # Posiciones abiertas con gestión de riesgo
│   │   ├── TradeTab.jsx           # Registrar trades + paper orders
│   │   ├── AccountsTab.jsx        # Gestión de cuentas y API keys
│   │   ├── DebtPlan.jsx           # Plan de pago de deudas + snowball
│   │   ├── MaintainersTab.jsx     # Configuración avanzada (R, leverage, DB)
│   │   └── RulesSidebar.jsx       # Reglas de trading + circuit breaker
│   └── styles/
│       └── global.css             # Estilos globales
├── package.json
└── DOCS.md                        # Este archivo
```

---

## Tags de navegación rápida (Ctrl+F en el código)

| Tag | Archivo | Descripción |
|-----|---------|-------------|
| `§CONSTANTS` | `constants/index.js` | PROXY url, fechas límite |
| `§RVALUES` | `constants/index.js` | R por cuenta (defaults) |
| `§ACCOUNTS_INIT` | `constants/index.js` | Cuentas iniciales |
| `§OPEN_INIT` | `constants/index.js` | Posición abierta inicial (OIL) |
| `§CLOSED_INIT` | `constants/index.js` | Historial de trades inicial |
| `§DEBTS_INIT` | `constants/index.js` | Deudas iniciales con paymentHistory |
| `§SNOWBALL_INIT` | `constants/index.js` | Metas cortoplacistas |
| `§WATCHLIST_INIT` | `constants/index.js` | Watchlist inicial de precios |
| `§DEFAULT_LEV` | `constants/index.js` | Opciones de leverage |
| `§MARKET_HOOK` | `hooks/useMarketData.js` | Lógica de fetch de precios |
| `§REFRESH_INTERVAL` | `hooks/useMarketData.js` | Intervalo de refresh (15s) |
| `§HEADER` | `components/Header.jsx` | BTC, CLP/USD con dot de estado |
| `§DEBT_CALC` | `components/DebtPlan.jsx` | Proyección de deudas |
| `§MAINTAINERS` | `components/MaintainersTab.jsx` | Config avanzada |

---

## Proxy local — Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/clp-rate?source=dolarapi\|binancep2p\|exchangerate` | Tipo de cambio CLP/USD |
| GET | `/api/binance/prices?symbols=BTCUSDT` | Precios spot Binance (sin key) |
| GET | `/api/binance/futures?symbols=COINUSDT` | Futuros Binance (sin key) |
| POST | `/api/binance/ping` `{apiKey, apiSecret}` | Test conexión Binance |
| POST | `/api/hyperliquid/mids` | Todos los precios HL |
| GET | `/api/hyperliquid/meta` | Metadata assets HL |
| POST | `/api/hyperliquid/user` `{address}` | Estado cuenta HL |
| POST | `/api/db/query` `{config, sql, params}` | Query PostgreSQL |
| POST | `/api/telegram/send` `{token, chatId, message}` | Enviar mensaje Telegram |

---

## Fuentes de precio CLP/USD

| Source param | URL | Descripción |
|---|---|---|
| `dolarapi` (default) | `cl.dolarapi.com/v1/cotizaciones/usd` | Promedio compra/venta Chile |
| `binancep2p` | `p2p.army/api/v1/prices` | Binance P2P CLP/USDT |
| `exchangerate` | `api.exchangerate-api.com/v4/latest/USD` | Exchange rate global |

El selector de fuente está en el header junto a CLP/USD.

---

## Sistema de Alertas Telegram

### Setup (5 minutos)

1. Abrir Telegram → buscar **@BotFather**
2. Enviar `/newbot` → elegir nombre y username → copiar el **TOKEN**
3. Enviar cualquier mensaje a tu bot
4. Visitar: `https://api.telegram.org/bot{TOKEN}/getUpdates`
5. Buscar `"chat":{"id":XXXXXXX}` → ese es tu **Chat ID**
6. En la app: tab **Maintainers → Telegram** → pegar Token y Chat ID → test

---

## Setup PostgreSQL (opcional)

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Crear BD
psql postgres -c "CREATE DATABASE trading_fw;"

# Instalar driver (ya instalado)
# npm install pg   ← ya hecho
```

Configurar en: **Maintainers → Base de Datos**

---

## Conceptos clave

### R (Risk Unit)
- 1R = el monto máximo que arriesgás por trade
- Actualmente: **$2.65** (5% de $53 capital Quantfury)
- Objetivo Breakout: $250 (1% de $25k) o $500 (1% de $50k)
- Cambiar en: **Maintainers → R Values**

### Circuit Breaker
- Máximo 3 pérdidas por día
- Cuenta solo las posiciones cerradas con PnL negativo en el día actual
- Si llegás a 3 → **STOP**, no abrir más trades ese día

### Sistema de Anomalías
- Un trade tiene "anomalía" si le faltan campos requeridos: `asset, account, date, pnl, type, outcome, source`
- Se marcan automáticamente al cerrar trades con datos incompletos
- También se detectan en trades históricos al cargar la app
- Se pueden completar desde Dashboard → tabla historial → botón "Completar"

### Plan de Deudas
- **$1,517/mes** = cuotas mínimas fijas pagadas con sueldo (Hipotecario + Préstamo Personal + Julio)
- Las ganancias del trading van **100% al principal** de las deudas
- Orden de pago: **Muy Alta → Alta → Muy Baja** (deuda de mayor prioridad primero)

---

## Variables de entorno (futuro)
```env
# .env (NO commitear)
TELEGRAM_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx
BINANCE_API_KEY=xxx
BINANCE_API_SECRET=xxx
```

---

## Fuentes de datos

| Dato | Fuente | Notas |
|------|--------|-------|
| BTC, ETH, XRP, LTC... | Binance Spot API | Sin key |
| OIL, GOLD, perps | Hyperliquid | Sin key, via proxy |
| MSTR, COIN, futuros | Binance Futures | Sin key |
| CLP/USD | dolarapi.com / Binance P2P / ExchangeRate | Selector en header |
| Balance HL | Hyperliquid clearinghouse | Wallet pública (0x) |
| Balance Binance | Binance REST API | Key read-only |
| Balance Quantfury | Manual | Sin API pública |
