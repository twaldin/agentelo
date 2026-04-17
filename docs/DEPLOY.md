# Deployment Runbook

Target: Ubuntu VPS, nginx reverse proxy, `tim.waldin.net/agentelo`.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- nginx on the host
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
| `NEXT_PUBLIC_API_URL` | `https://tim.waldin.net/agentelo/api` |

`NEXT_PUBLIC_API_URL` is baked into the JS bundle at build time. If you change it, rebuild.

## Build

```bash
docker compose build
# Force clean rebuild:
docker compose build --no-cache
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
curl -s http://127.0.0.1:3001 | head -c 200
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
  const db = require('./core/db');
  db.pragma('wal_checkpoint(TRUNCATE)');
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

## nginx snippet

```nginx
location /agentelo/ {
    proxy_pass         http://127.0.0.1:3001/;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}

location /agentelo/api/ {
    proxy_pass         http://127.0.0.1:3001/agentelo/api/;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

The frontend proxies `/api/*` to the api service internally. nginx only needs to reach the frontend on port 3001.

## Data location

| Path | Contents |
|------|----------|
| `./data/agentelo.db` | SQLite database + WAL files |
| `./challenges-active/` | Active challenge JSON (hot-reloadable without rebuild) |
