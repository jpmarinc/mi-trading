# Phase II — Infraestructura y Automatización

Guía de setup para migrar el proyecto a producción y activar las integraciones
de Discord, Telegram bidireccional y Oracle Free Tier.

---

## 2. Oracle Free Tier — VM Siempre Encendida

### 2.1 Crear cuenta

- URL: https://www.oracle.com/cloud/free/
- Requiere: tarjeta de crédito para verificación (no cobra si usas Always Free)
- Región: elegir la más cercana (São Paulo o US East según latencia)

### 2.2 Crear instancia VM (Always Free ARM)

1. Compute → Instances → Create Instance
2. **Shape:** `VM.Standard.A1.Flex` (ARM Ampere)
   - 4 OCPUs, 24 GB RAM — completamente gratis
3. **OS:** Ubuntu 22.04 (Canonical)
4. **Networking:** asignar IP pública (necesaria para webhooks de Telegram)
5. **SSH Key:** subir tu llave pública (`~/.ssh/id_ed25519.pub`)

### 2.3 Abrir puertos en Oracle (muy importante)

Oracle bloquea puertos por defecto en dos capas:

**Capa 1 — Security List (VCN):**
- Networking → Virtual Cloud Networks → tu VCN → Security Lists → Ingress Rules
- Agregar reglas:
  | Puerto | Protocolo | Uso |
  |--------|-----------|-----|
  | 22     | TCP       | SSH |
  | 3001   | TCP       | Proxy Node.js |
  | 5432   | TCP       | PostgreSQL (solo desde tu IP si accedes remotamente) |
  | 443    | TCP       | HTTPS / Telegram webhook |
  | 80     | TCP       | HTTP (para certbot) |

**Capa 2 — iptables dentro del OS:**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 2.4 Setup inicial del servidor

SSH al servidor:
```bash
ssh ubuntu@IP_PUBLICA_ORACLE
```

Instalar dependencias:
```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# PM2 (process manager — mantiene el proxy corriendo)
sudo npm install -g pm2

# Git
sudo apt-get install -y git

# Nginx (reverse proxy para HTTPS)
sudo apt-get install -y nginx

# Certbot (certificado SSL gratuito)
sudo apt-get install -y certbot python3-certbot-nginx
```

### 2.5 Clonar el proyecto en la VM

```bash
# Agregar SSH key de la VM a GitHub también
ssh-keygen -t ed25519 -C "oracle-vm"
cat ~/.ssh/id_ed25519.pub   # agregar en GitHub → Settings → SSH Keys

# Clonar
git clone git@github.com:TU_USUARIO/mi-trading.git
cd mi-trading
npm install
```

### 2.6 Variables de entorno en la VM

Crear `/home/ubuntu/mi-trading/.env`:
```
# BD PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=trading_fw
DB_USER=tu_usuario
DB_PASS=         # NO commitear este archivo

# Telegram
TG_TOKEN=
TG_CHAT_ID=

# Discord
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=

# Binance (opcional si se centraliza acá)
# Preferir que cada cuenta las tenga en la UI
```

El proxy debe leer estas vars con `process.env.X || fallback_desde_request`.

### 2.7 Iniciar proxy con PM2

```bash
cd /home/ubuntu/mi-trading
pm2 start src/proxy.cjs --name "trading-proxy"
pm2 save
pm2 startup   # para que arranque automático tras reboot
```

### 2.8 Dominio (opcional pero recomendado para webhook TG)

Si no quieres pagar dominio, puedes usar la IP directa con `https://IP` solo si
Telegram acepta certificados autofirmados (sí los acepta con `setWebhook`).

Si quieres dominio gratuito: https://duckdns.org (subdominio gratuito).

---

## 3. Telegram Bot Bidireccional

### 3.1 Crear el bot

1. Abrir Telegram → buscar `@BotFather`
2. `/newbot` → nombre → username (debe terminar en `bot`)
3. Guardar el **token** → va a `.env` como `TG_TOKEN`
4. Obtener tu chat_id: hablar con `@userinfobot`

### 3.2 Modo actual (polling) vs Webhook

- **Polling:** el proxy hace GET a Telegram cada N segundos. Funciona local (Mac).
- **Webhook:** Telegram llama a TU servidor cuando llega un mensaje. Requiere HTTPS público. Ideal para VM Oracle.

**Configurar webhook (en la VM):**
```bash
curl -X POST "https://api.telegram.org/bot<TU_TOKEN>/setWebhook" \
  -d "url=https://TU_IP_O_DOMINIO/api/telegram/webhook"
```

El proxy necesita endpoint `POST /api/telegram/webhook` que reciba updates.

### 3.3 Comandos planeados (Phase II)

| Comando | Acción |
|---------|--------|
| `/positions` | Lista posiciones abiertas con uPnL live |
| `/close BTC` | Cierra posición de BTC en Binance |
| `/pnl` | Resumen P&L del día |
| `/gasto 15000 CLP Almuerzo` | Registra gasto en módulo de gastos |
| `/balance` | Muestra balance por cuenta |
| `/sl BTC 42000` | Actualiza SL de posición BTC |

### 3.4 Seguridad

El bot SOLO debe responder a tu `chat_id`. En cada handler:
```js
if (msg.chat.id.toString() !== process.env.TG_CHAT_ID) return;
```

---

## 4. Discord Bot — Listener Chroma

### 4.1 Crear aplicación Discord

1. Ir a https://discord.com/developers/applications
2. New Application → nombre (ej: `chroma-listener`)
3. Bot → Add Bot → copiar **token** → va a `.env` como `DISCORD_BOT_TOKEN`
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Permissions: `Read Messages/View Channels`, `Read Message History`
5. Copiar URL generada → abrir en browser → invitar al servidor de Chroma
   - **Necesitas tener permisos de admin en el servidor de Chroma para invitar bots**
   - Si no puedes, alternativa: usar un user token (requiere cuenta propia en el servidor)

### 4.2 Obtener ID del canal #new-trades

En Discord: activar modo developer (Settings → Advanced → Developer Mode).
Click derecho en `#new-trades` → Copy ID → `DISCORD_CHANNEL_ID` en `.env`.

### 4.3 Formato de mensaje que hay que parsear

Basado en las screenshots, el mensaje tiene:
- Analista (ej: "Silla")
- Par (ej: "COMPUSDT")
- Dirección (LONG / SHORT)
- Entry price
- SL
- TP (puede venir en mensaje posterior/editado)

El parser debe ser tolerante a actualizaciones del mensaje (event `messageUpdate`).

### 4.4 Configuración por analista (Maintainers → Discord/Calls)

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

- `auto` → abre posición directo en Binance (1R o el risk configurado)
- `ask` → manda mensaje TG preguntando si quiero entrar (responder SI/NO)
- `ignore` → no hace nada

---

## 5. Arquitectura Final en Oracle VM

```
Internet
    │
    ▼
Nginx (puerto 443 HTTPS)
    │
    ▼
proxy.cjs (puerto 3001)
    ├── /api/binance/*          → Binance Futures API
    ├── /api/db/*               → PostgreSQL local
    ├── /api/telegram/webhook   → recibe updates de TG
    ├── /api/prices/*           → Yahoo Finance, HL, CoinGecko
    └── /api/discord/*          → (Phase II) acciones desde Discord

PostgreSQL (local, solo accesible desde localhost)
    └── trading_fw DB

Discord Bot (proceso separado o integrado en proxy)
    └── escucha #new-trades → parsea → decide acción → ejecuta
```

---

## 6. Workflow de Deploy

Cada vez que hagas cambios locales:

```bash
# Local → push a GitHub
git add -p   # agregar solo lo que revisaste
git commit -m "descripción del cambio"
git push origin main

# En la VM Oracle → pull y restart
ssh ubuntu@IP_ORACLE
cd mi-trading
git pull origin main
npm install   # solo si cambiaron dependencias
pm2 restart trading-proxy
```

Futuro: GitHub Actions para deploy automático al hacer push a `main`.

---

## 7. Costos estimados

| Servicio | Costo/mes |
|----------|-----------|
| Oracle VM (A1 Flex 4 OCPU / 24GB) | **$0** (Always Free) |
| Oracle DB Storage 200GB | **$0** (Always Free) |
| DuckDNS dominio | **$0** |
| Telegram Bot | **$0** |
| Discord Bot | **$0** |
| **Total Phase II** | **$0/mes** |

> Si en el futuro necesitamos más computo (ML, backtesting pesado) → evaluar
> DigitalOcean $6/mes o AWS Lightsail $3.50/mes. Por ahora Oracle cubre todo.

---

## 8. Checklist de setup (en orden)

- [ ] Crear repo privado en GitHub
- [ ] Crear `.gitignore` correcto antes del primer push
- [ ] Primer `git push` al repo
- [ ] Crear cuenta Oracle Free Tier
- [ ] Crear VM ARM (A1 Flex)
- [ ] Abrir puertos en Security List + iptables
- [ ] Instalar dependencias en VM (Node, PostgreSQL, PM2, Nginx)
- [ ] Clonar repo en VM + `npm install`
- [ ] Crear `.env` en VM con credenciales (nunca al repo)
- [ ] Restaurar BD en VM (`psql -f db-setup.sql`)
- [ ] Iniciar proxy con PM2 y activar startup
- [ ] Configurar Nginx como reverse proxy
- [ ] Obtener SSL con Certbot (para webhook TG)
- [ ] Configurar Telegram webhook apuntando a VM
- [ ] Crear app Discord + invitar a servidor Chroma
- [ ] Implementar listener de `#new-trades` en proxy
- [ ] Implementar UI de config por analista en Maintainers
- [ ] Implementar módulo de gastos personales (Tab nueva)

---

*Última actualización: 2026-02-28*
