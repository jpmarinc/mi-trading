# Guia de Deploy — Fly.io

Dashboard online 24/7 gratis. Un solo servicio en Fly.io sirve el frontend React + el proxy Node.js.

---

## Pre-requisitos (hacer una sola vez)

### 1. Instalar Fly CLI (flyctl)

```bash
curl -L https://fly.io/install.sh | sh
```

Luego agregar al PATH (el instalador lo indica). Verificar:
```bash
flyctl version
```

### 2. Crear cuenta en fly.io

```bash
flyctl auth signup
```

O si ya tienes cuenta:
```bash
flyctl auth login
```

---

## Primera vez — Crear la app en Fly.io

Desde la raiz del proyecto (`~/Desktop/mi-trading`):

```bash
flyctl launch --name mi-trading-fw --region gru --no-deploy
```

- `--name mi-trading-fw` → URL sera `https://mi-trading-fw.fly.dev`
- `--region gru` → Sao Paulo (mas cercano a Chile)
- `--no-deploy` → solo crea la app, no despliega aun

Cuando pregunte si quiere sobrescribir `fly.toml`, responder **No** (ya tenemos uno).

---

## Configurar variables de entorno (secretos)

Las credenciales NO van en el codigo. Se configuran como secrets en Fly.io:

```bash
flyctl secrets set \
  TG_TOKEN="tu_token_de_telegram" \
  TG_CHAT_ID="tu_chat_id"
```

**Nota:** La BD Supabase no va como secret porque el usuario la ingresa desde la UI de Maintainers y queda en localStorage. No necesita env var en el servidor.

---

## Deploy

Cada vez que quieras actualizar el dashboard en produccion:

```bash
cd ~/Desktop/mi-trading
flyctl deploy
```

Fly.io ejecuta el Dockerfile automaticamente:
1. Build React → `dist/`
2. Levanta Express (proxy.cjs) en port 3001
3. Express sirve `dist/` como archivos estaticos

El proceso tarda ~2-3 minutos. Al finalizar muestra la URL.

---

## Verificar que funciona

```bash
flyctl status          # ver estado de la maquina
flyctl logs            # ver logs en tiempo real
flyctl open            # abrir el dashboard en el browser
```

---

## URL final

```
https://mi-trading-fw.fly.dev
```

---

## Actualizaciones futuras

Para actualizar el dashboard despues de cambios:

```bash
git add . && git commit -m "..." && git push origin main
flyctl deploy
```

O en un solo comando:
```bash
git add . && git commit -m "Sesion $(date +%Y-%m-%d) — [descripcion]" && git push origin main && flyctl deploy
```

---

## Costos

- Fly.io free tier: 3 VMs shared, 256MB RAM c/u
- Con `min_machines_running = 1` y `auto_stop_machines = false`: la app nunca duerme
- Costo estimado: $0/mes (dentro del free allowance de Fly.io)
- Si superas el free tier (~$1-3/mes por VM adicional)

---

## Troubleshooting

### La app no arranca
```bash
flyctl logs
```

### Cambiar el nombre de la app
Editar `fly.toml` → campo `app`. Luego `flyctl deploy`.

### Ver cuanto esta usando
```bash
flyctl status
flyctl machine list
```
