# SEC-App deployment runbook (IntrinsiqDroplet)

**Written:** 2026-09-29  
**Host:** `198.199.81.137` (`IntrinsiqDroplet`, Ubuntu 24.04)  
**Goal:** Serve React (`NewFront`) + FastAPI (`app`) + PostgreSQL on **port 80**.

This document is the source of truth for what was installed and how to operate it if the assistant is unavailable.

---

## Architecture

```
Internet :80
    → Nginx
         → static files: /opt/sec-app/NewFront/dist
         → proxy /api/* and /auth/* and /health /docs /redoc /openapi.json
              → Uvicorn (FastAPI) on 127.0.0.1:3010
                   → PostgreSQL local database `secapp`
```

Frontend `global/globalConfig.json` `appUrl` is set to empty string `""` so API calls are same-origin (`/auth/...`, `/api/...`) and Nginx routes them.

---

## Paths on the droplet

| Path | Purpose |
|------|---------|
| `/opt/sec-app/` | Application root (from Windows `Desktop\Dev\Source\SEC-App`) |
| `/opt/sec-app/app/` | FastAPI backend |
| `/opt/sec-app/app/.env` | Backend secrets / `DATABASE_URL` |
| `/opt/sec-app/app/.venv/` | Python virtualenv |
| `/opt/sec-app/NewFront/` | React (Vite) frontend |
| `/opt/sec-app/NewFront/dist/` | Built static assets Nginx serves |
| `/opt/sec-app/docs/DEPLOY.md` | This runbook (on server) |
| `/etc/nginx/sites-available/sec-app` | Nginx site config |
| `/etc/systemd/system/sec-app.service` | systemd unit for Uvicorn |

**Source on Windows:** `C:\Users\Virti\Desktop\Dev\Source\SEC-App`  
**Deploy zip used:** `C:\Users\Virti\Downloads\sec-app-deploy.zip` (excluded `node_modules`, `.venv`, `.git`, `dist`)

---

## Packages installed (Ubuntu)

- `nginx`
- `postgresql`, `postgresql-contrib`
- `python3-venv`, `python3-pip`, build tools as apt deps
- `nodejs` 20.x (NodeSource), `npm`
- `unzip`, `curl`, `ufw`

---

## Database

- Cluster: default local Postgres
- Database: `secapp`
- User: `secapp` (password stored only in `/opt/sec-app/app/.env` as `DATABASE_URL`)
- Tables: created automatically by FastAPI lifespan (`Base.metadata.create_all`) on service start

Connect locally on the droplet:

```bash
sudo -u postgres psql -d secapp
```

---

## Backend (systemd)

Service name: `sec-app`

```bash
systemctl status sec-app
systemctl restart sec-app
journalctl -u sec-app -f
```

Listens on **127.0.0.1:3010** only (not public). Public entry is Nginx :80.

Health check (from droplet or via Nginx):

```bash
curl -s http://127.0.0.1:3010/health
curl -s http://127.0.0.1/health
```

---

## Frontend rebuild

```bash
cd /opt/sec-app/NewFront
# ensure global/globalConfig.json has "appUrl": ""
npm ci
npm run build
systemctl reload nginx
```

---

## Nginx

```bash
nginx -t
systemctl reload nginx
systemctl status nginx
```

Firewall (if UFW enabled): allow `OpenSSH` and `80/tcp`.

---

## Redeploy from Windows

1. Zip the repo (exclude `node_modules`, `.venv`, `.git`, `dist`).
2. Copy zip to droplet `/tmp/sec-app-deploy.zip`.
3. `unzip -o /tmp/sec-app-deploy.zip -d /opt/sec-app`
4. Preserve/update `/opt/sec-app/app/.env` (do not overwrite secrets blindly).
5. Rebuild frontend; restart `sec-app`; reload nginx.

SSH (from a machine that has the private key):

```bash
ssh -i <private_key> root@198.199.81.137
```

---

## Env vars the app expects (`app/.env`)

Required:

- `SECRET_KEY`
- `DATABASE_URL` (postgresql://...)

Optional but used by features:

- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`

Frontend Stripe publishable / price IDs live in `NewFront/.env` as `VITE_*` (baked in at build time).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Port 80 connection refused | `systemctl status nginx`; DigitalOcean firewall / UFW |
| UI loads, API fails | `systemctl status sec-app`; `journalctl -u sec-app -n 100` |
| DB errors | Postgres running? `DATABASE_URL`? `sudo -u postgres psql -d secapp -c '\dt'` |
| Blank UI after update | Rebuild `NewFront` and hard-refresh browser |
| SSH key libcrypto error | Private key must have real newlines between BEGIN/END markers |

---

## Security notes (initial “get it working” deploy)

- HTTP only on port 80 (no TLS yet). Add Certbot / HTTPS later.
- API CORS allows `*` in code; fine behind same-origin Nginx for now.
- Postgres is local-only; do not expose 5432 publicly.
- Rotate `SECRET_KEY` / DB password if this droplet is shared or keys leak.


## What was done on 2026-09-29 (this deploy)

1. Uploaded app zip from Windows to `/opt/sec-app/` (excluded node_modules, .venv, .git, dist).
2. Installed nginx, postgresql, python3-venv, Node 20 (NodeSource), unzip, ufw.
3. Created Postgres role/db `secapp`; set `DATABASE_URL` in `/opt/sec-app/app/.env` (password also mirrored in `/root/.secapp_db_pass` — root-only).
4. Created Python venv at `/opt/sec-app/app/.venv` and `pip install -r requirements.txt`.
5. Vite production build OOMed on the 1 GB droplet; built on Windows with `appUrl: ""`, uploaded `dist/` to `/opt/sec-app/NewFront/dist`.
6. Added 2 GiB swap file `/swapfile` for headroom.
7. Enabled systemd `sec-app` (Uvicorn 127.0.0.1:3010) and Nginx on port 80.
8. UFW: allow OpenSSH + 80/tcp.

### Quick verify

```bash
curl -s http://127.0.0.1/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

Public URL: http://198.199.81.137/

API docs: http://198.199.81.137/docs

