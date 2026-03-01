# Phase II — Infraestructura y Automatización

Guía de setup para migrar el proyecto a producción y activar las integraciones
de Telegram bidireccional, Discord y base de datos en la nube.

---

## 1. Base de Datos Cloud — Supabase (FREE, recomendado)

Oracle Free Tier descartado por problemas de registro. **Supabase** es la alternativa:
- PostgreSQL real (compatible 100% con el código existente)
- Free tier: 500 MB, sin tarjeta de crédito, sin límite de tiempo
- SSL incluido, conexión estándar `pg`

### 1.1 Crear cuenta y proyecto

1. Ir a https://supabase.com → **Start for free** → cuenta GitHub/Google
2. **New Project** → nombre (ej: `mi-trading`) → contraseña BD (guárdala)
3. Región: **South America (São Paulo)** o US East
4. Esperar ~2 minutos mientras crea la instancia

### 1.2 Obtener string de conexión

En el dashboard de Supabase:
- **Project Settings → Database → Connection string → URI**
- Copiar el string. Tiene este formato:
  ```
  postgresql://postgres:[TU_PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
  ```

### 1.3 Configurar en el dashboard (Maintainers → DB)

Llenar los campos con los datos del string de conexión:

| Campo | Valor |
|-------|-------|
| Host | `db.xxxxxxxxxxxx.supabase.co` |
| Puerto | `5432` |
| Database | `postgres` |
| User | `postgres` |
| Password | la contraseña que pusiste al crear el proyecto |
| **SSL** | ✅ **activar el checkbox** |

El proxy detecta automáticamente hosts Supabase y activa SSL. El checkbox es confirmación visual.

### 1.4 Inicializar schema en Supabase

Una vez configurada la BD en Maintainers, ir a **Maintainers → DB → Inicializar BD** (o ejecutar manualmente el `db-setup.sql` via Supabase SQL Editor).

También puedes usar el SQL Editor de Supabase:
- Project → SQL Editor → New Query → pegar contenido de `db-setup.sql` → Run

### 1.5 Verificar conexión

- En Maintainers → DB → botón **Test conexión** (o hacer un sync)
- Si falla: verificar que el checkbox SSL esté activado
- Si sigue fallando: en Supabase → Settings → Database → "Connection pooling" → usar el puerto 6543 (pooler)

---

## 2. Telegram Bot — Modo Local (polling, sin VM)

El proxy corre en tu Mac. Con ngrok puedes exponer el puerto 3001 para recibir webhooks de Telegram sin necesidad de VM.

### 2.1 Instalar ngrok

```bash
brew install ngrok/ngrok/ngrok
# o descargar desde https://ngrok.com (free plan)
```

### 2.2 Configurar cuenta ngrok

1. Registrarse en https://ngrok.com (gratis)
2. Copiar el authtoken: `ngrok config add-authtoken TU_TOKEN`

### 2.3 Exponer el proxy

```bash
ngrok http 3001
```

Ngrok dará una URL pública tipo `https://abc123.ngrok.io`.

### 2.4 Configurar webhook de Telegram

```bash
curl -X POST "https://api.telegram.org/bot<TU_TOKEN>/setWebhook" \
  -d "url=https://abc123.ngrok.io/api/telegram/webhook"
```

**Limitación free plan ngrok:** la URL cambia cada vez que reinicias. Para uso diario basta con polling (el proxy ya lo hace automáticamente cuando está corriendo).

### 2.5 Comandos Telegram planeados (Phase II)

| Comando | Acción |
|---------|--------|
| `/positions` | Lista posiciones abiertas con uPnL live |
| `/close BTC` | Cierra posición de BTC en Binance |
| `/pnl` | Resumen P&L del día |
| `/balance` | Muestra balance por cuenta |
| `/sl BTC 42000` | Actualiza SL de posición BTC |
| `/gasto 15000 CLP Almuerzo` | Registra gasto (módulo futuro) |

### 2.6 Seguridad

El bot solo responde a tu `chat_id`. En cada handler:
```js
if (msg.chat.id.toString() !== process.env.TG_CHAT_ID) return;
```

---

## 3. Discord Bot — Listener Chroma

### 3.1 Crear aplicación Discord

1. Ir a https://discord.com/developers/applications
2. New Application → nombre (ej: `chroma-listener`)
3. Bot → Add Bot → copiar **token**
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Permissions: `Read Messages/View Channels`, `Read Message History`
5. Copiar URL → invitar al servidor de Chroma
   - Necesitas permisos de admin en Chroma para invitar bots

### 3.2 Obtener ID del canal #new-trades

En Discord: Settings → Advanced → Developer Mode.
Click derecho en `#new-trades` → Copy ID.

### 3.3 Formato de mensaje a parsear

Basado en las screenshots, el mensaje tiene:
- Analista (ej: "Silla")
- Par (ej: "COMPUSDT")
- Dirección (LONG / SHORT)
- Entry price, SL, TP (puede actualizarse en el mismo mensaje)

El parser debe ser tolerante a `messageUpdate` events.

### 3.4 Config por analista (Maintainers → Discord/Calls)

Estructura propuesta en localStorage (`discordConfig`):
```json
{
  "analistas": [
    { "name": "Silla",  "mode": "auto",   "risk": 1.0 },
    { "name": "Mizer",  "mode": "ask",    "risk": 0.5 },
    { "name": "Chroma", "mode": "ignore", "risk": 0   }
  ]
}
```

- `auto` → abre posición directo en Binance (X R configurado)
- `ask` → manda TG preguntando si quiero entrar (responder SI/NO)
- `ignore` → no hace nada

---

## 4. VM en la Nube (solo si es necesario en el futuro)

Si en algún momento el proxy necesita correr 24/7 sin depender de tu Mac:

| Opción | Costo | Nota |
|--------|-------|------|
| **Fly.io** | $0–5/mes | Free tier generoso, CLI sencillo |
| Railway | $5/mes | Deploy desde GitHub, muy fácil |
| DigitalOcean Droplet | $6/mes | El más confiable |
| AWS Lightsail | $3.50/mes | Buen precio, más complejo |

**Recomendación actual:** No necesitas VM. El proxy corre local, Supabase maneja la BD en la nube. Si quieres TG bidireccional 24/7 → evaluar Fly.io ($0-5/mes).

---

## 5. Arquitectura actual

```
Tu Mac (localhost)
  ├── React/Vite app (localhost:5173)
  └── proxy.cjs (localhost:3001)
        ├── /api/binance/*     → Binance Futures API
        ├── /api/db/*          → Supabase PostgreSQL (SSL)
        ├── /api/prices/*      → Yahoo Finance, HL, CoinGecko
        └── /api/telegram/*    → notificaciones salientes

Supabase Cloud
  └── PostgreSQL → trades, historico BD

GitHub
  └── código fuente (sin credenciales)
```

---

## 6. Costos estimados (setup actual)

| Servicio | Costo/mes |
|----------|-----------|
| Supabase (free tier) | **$0** |
| GitHub | **$0** |
| Telegram Bot | **$0** |
| Discord Bot | **$0** |
| ngrok (free) | **$0** |
| **Total Phase II actual** | **$0/mes** |

> Si en el futuro se necesita proxy 24/7 → Fly.io Free Tier (~$0–5/mes).

---

## 7. Checklist de setup Supabase

- [ ] Crear cuenta en supabase.com
- [ ] Crear proyecto → anotar contraseña BD
- [ ] Copiar host desde Project Settings → Database
- [ ] Configurar en Maintainers → DB (host, puerto, user, password, ✅ SSL)
- [ ] Inicializar schema via SQL Editor de Supabase (db-setup.sql)
- [ ] Verificar conexión haciendo un sync o cargando trades
- [ ] Hacer push de la primera operación real para confirmar INSERT

## 8. Backlog Phase II (en orden de prioridad)

1. **Discord Chroma listener** — parsear #new-trades → ejecutar por Binance API
2. **Telegram bidireccional** — comandos /positions, /close, /pnl
3. **Módulo de gastos personales** — tab nueva + ingreso por TG
4. **Alertas automáticas** — entry hit, SL hit, TP hit (polling de precios en loop)
5. **Breakout/Kraken API** — si se compra cuenta de prop trading
6. **Proxy 24/7** — Fly.io cuando se necesite independencia del Mac

---

*Última actualización: 2026-03-01 — Oracle descartado, Supabase como BD cloud primaria*
