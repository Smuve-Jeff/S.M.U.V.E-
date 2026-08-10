# Cloudflare Tunnel Configuration (smuve-connect)

**This is the canonical deployment path for S.M.U.V.E. 2.0.** Both the web app
and the API are served from this machine through the `smuve-connect` Cloudflare
Tunnel — no GitHub Pages, no Render, no third-party hosting.

## Tunnel Details

- **Tunnel Name**: `smuve-connect`
- **Tunnel ID**: `f3ab17ad-b834-446d-9914-4aa0f8ed2c23`
- **Credentials Path**: `~/.cloudflared/f3ab17ad-b834-446d-9914-4aa0f8ed2c23.json`
- **Config Path**: `~/.cloudflared/config.yml`

## Routing Rules

| Public Hostname                 | Local Service           |
| :------------------------------ | :---------------------- |
| `smuvejeffpresents.com`         | `http://localhost:4200` |
| `www.smuvejeffpresents.com`     | `http://localhost:4200` |
| `api.smuvejeffpresents.com`     | `http://localhost:4000` |

## Full `~/.cloudflared/config.yml`

```yaml
tunnel: smuve-connect
credentials-file: /home/your-user/.cloudflared/f3ab17ad-b834-446d-9914-4aa0f8ed2c23.json

ingress:
  - hostname: api.smuvejeffpresents.com
    service: http://localhost:4000
  - hostname: smuvejeffpresents.com
    service: http://localhost:4200
  - hostname: www.smuvejeffpresents.com
    service: http://localhost:4200
  - service: http_status:404
```

> Note: the routing table at the top of this doc mirrors the `ingress` block —
> keep both in sync when changing hostnames.

## Running the Stack

Terminal 1 — web app (Angular):

```bash
npm run dev:web        # serves on 0.0.0.0:4200
```

Terminal 2 — API (Express + TypeORM + Postgres):

```bash
npm run dev            # serves on port 4000, auto-runs migrations
```

Terminal 3 — tunnel:

```bash
cloudflared tunnel run smuve-connect
```

## API Endpoint Configuration

Once the tunnel is live, `https://api.smuvejeffpresents.com` proxies to the
local API on port 4000. Set `src/index.html` → `window.env.AUTH_API_URL` to
`https://api.smuvejeffpresents.com` (or set it at runtime) and reload the app.

## Operational Commands

### Starting the Tunnel

```bash
cloudflared tunnel run smuve-connect
```

### Verifying the Tunnel

```bash
cloudflared tunnel info smuve-connect
curl -s https://api.smuvejeffpresents.com/api/health   # expect {"status":"ok",...}
```

### Troubleshooting

- If the tunnel fails to start, verify the credentials file exists at the path
  listed above.
- If a hostname 404s, confirm the matching `ingress` rule is present and the
  local service is actually listening (check `curl http://localhost:PORT`).
- DNS records (`*.smuvejeffpresents.com` → `CNAME` to the tunnel) must exist in
  Cloudflare for each public hostname. Only hostnames with DNS records will
  route through the tunnel.

## Prerequisites

- `cloudflared` installed (see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- A Cloudflare account with the `smuvejeffpresents.com` zone
- PostgreSQL reachable from this machine (the API connects via `DATABASE_URL`)
