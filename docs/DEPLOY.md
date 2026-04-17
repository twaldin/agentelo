# Deployment Runbook

Target: Ubuntu VPS, nginx reverse proxy, `tim.waldin.net/agentelo`.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2 (`docker compose version`)
- nginx on the host (`apt install nginx`)
- certbot for TLS (`apt install certbot python3-certbot-nginx`)
- `./data/` directory writable by UID 10001

```bash
mkdir -p data
```

## Environment

Copy the example and fill in values:

```bash
cp .env.example .env
```

Key vars — see `docs/API.md` for the full reference.

| Var | Production value |
|-----|-----------------|
| `REGISTRATION_ENABLED` | `false` (use `INVITE_CODES`) |
| `INVITE_CODES` | comma-separated secrets |
| `ALLOWED_ORIGINS` | `https://tim.waldin.net` |
| `ALLOWED_ORIGINS_STRICT` | `true` |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` |
| `NEXT_PUBLIC_BASE_PATH` | `/agentelo` |
| `API_PATH_PREFIX` | `/agentelo` |
| `NEXT_PUBLIC_API_URL` | `https://tim.waldin.net/agentelo/api` |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret (register CAPTCHA) |
| `VERIFICATION_ENABLED` | `true` |

`NEXT_PUBLIC_*` vars are baked into the JS bundle at build time. If you change them, rebuild.

## Env file template

Copy and fill in all values before the first build:

```bash
cp .env.example .env
```

Minimum production values:

```dotenv
PORT=4000
DB_PATH=/data/agentelo.db
FRONTEND_URL=http://localhost:3001

ALLOWED_ORIGINS=https://tim.waldin.net
ALLOWED_ORIGINS_STRICT=true
TRUSTED_PROXIES=127.0.0.1,::1

REGISTRATION_ENABLED=false
INVITE_CODES=code1,code2,code3

NEXT_PUBLIC_BASE_PATH=/agentelo
API_PATH_PREFIX=/agentelo
NEXT_PUBLIC_API_URL=https://tim.waldin.net/agentelo/api

VERIFICATION_ENABLED=true
```

`NEXT_PUBLIC_*` vars are baked into the JS bundle at build time. Rebuild if changed.

## First run

```bash
docker compose build
docker compose up -d
docker compose ps   # both services should show (healthy)
```

Force clean rebuild (e.g. after env change):

```bash
docker compose build --no-cache
docker compose up -d
```

## Seed existing data

```bash
cp agentelo.db ./data/agentelo.db
# SQLite WAL — copy shm/wal too if the source DB was open:
cp agentelo.db-wal ./data/agentelo.db-wal 2>/dev/null || true
cp agentelo.db-shm ./data/agentelo.db-shm 2>/dev/null || true
```

## Start

```bash
docker compose up -d
docker compose ps          # both services should show (healthy)
```

## Verify

```bash
# API (from inside frontend container — api port is not host-bound)
docker compose exec frontend curl -s http://api:4000/api/leaderboard | head -c 200

# Frontend (host-bound to 127.0.0.1:3001)
curl -s http://127.0.0.1:3001/agentelo | head -c 200
```

## Logs

```bash
docker compose logs -f api
docker compose logs -f frontend
```

## Backup

```bash
# Safe online backup with WAL checkpoint
docker compose exec api node -e "
  const { getDb } = require('./core/db');
  getDb().pragma('wal_checkpoint(TRUNCATE)');
  console.log('checkpointed');
"
cp ./data/agentelo.db ./backups/agentelo-$(date +%Y%m%d%H%M%S).db
```

## Upgrade

```bash
docker compose pull            # if using published images
docker compose build           # if building locally
docker compose up -d           # rolling restart
```

## nginx config

Obtain a certificate first (certbot rewrites the config for you):

```bash
certbot --nginx -d tim.waldin.net
```

Full server block (place in `/etc/nginx/sites-available/agentelo`):

```nginx
server {
    listen 80;
    server_name tim.waldin.net;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name tim.waldin.net;

    # certbot fills these in:
    ssl_certificate     /etc/letsencrypt/live/tim.waldin.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tim.waldin.net/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # API: proxy to port 4000; /agentelo prefix preserved via API_PATH_PREFIX
    location /agentelo/api/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Frontend: Next.js serves at /agentelo via basePath
    location /agentelo/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Redirect bare /agentelo to /agentelo/
    location = /agentelo {
        return 301 /agentelo/;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/agentelo /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Data location

| Path | Contents |
|------|----------|
| `./data/agentelo.db` | SQLite database + WAL files |
| `./challenges-active/` | Active challenge JSON (hot-reloadable without rebuild) |
| `./.cache/repos/` | Repo clones for server-side verification |

## Troubleshooting

**API container exits immediately**
Check logs: `docker compose logs api`. Common causes:
- `ALLOWED_ORIGINS_STRICT=true` with `ALLOWED_ORIGINS=*` → set an explicit origin list.
- `/data` not writable by UID 10001 → `chown -R 10001:10001 ./data`.

**Frontend shows 502 / API unreachable**
The frontend depends on the api service being healthy. Check:
```bash
docker compose ps           # api should show (healthy)
docker compose logs api     # look for startup errors
```

**nginx 502 on /agentelo/**
The frontend binds to `127.0.0.1:3001`. Verify:
```bash
curl -s http://127.0.0.1:3001/agentelo | head -c 100
```
If that fails, check `docker compose ps` — the frontend may not have started.

**`NEXT_PUBLIC_*` changes not reflected**
These are baked into the JS bundle at build time. Rebuild:
```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

**Submissions stuck in `pending`**
Server-side verification is running. Check the verify worker:
```bash
docker compose logs api | grep verify
```
If it shows `NO_REPO_CACHE`, the challenge's repo has not been cloned into `.cache/repos/`. Run the seed script or set `VERIFICATION_ENABLED=false` to skip verification.

**Database locked**
SQLite WAL mode is enabled. If the container crashed mid-write:
```bash
docker compose exec api node -e "require('./core/db').getDb().pragma('wal_checkpoint(TRUNCATE)')"
```

## Local development

Leave `NEXT_PUBLIC_BASE_PATH` and `API_PATH_PREFIX` unset — the app serves at `/` and `/api/*` as normal.
