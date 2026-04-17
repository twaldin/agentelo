# Deployment

## nginx reverse proxy (subpath `/agentelo`)

The following nginx config serves agentelo at `https://tim.waldin.net/agentelo`.
The frontend runs on `:3001` and the API on `:4000`.

```nginx
location /agentelo {
    rewrite ^/agentelo$ /agentelo/ permanent;
}
location /agentelo/api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $host;
}
location /agentelo/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $host;
}
```

## Environment variables

Copy `.env.example` to `.env` and set the subpath vars for production:

```
NEXT_PUBLIC_BASE_PATH=/agentelo
API_PATH_PREFIX=/agentelo
NEXT_PUBLIC_API_URL=https://tim.waldin.net/agentelo/api
```

Leave these unset for local development — the app serves at `/` and `/api/*` as normal.
