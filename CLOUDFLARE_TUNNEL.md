# Cloudflare Tunnel Configuration

This project uses Cloudflare Tunnels to bridge the local development environment (port 4200) to the production domains.

## Tunnel Details
- **Tunnel Name**: `smuve-connect`
- **Tunnel ID**: `f3ab17ad-b834-446d-9914-4aa0f8ed2c23`
- **Credentials Path**: `~/.cloudflared/f3ab17ad-b834-446d-9914-4aa0f8ed2c23.json`
- **Config Path**: `~/.cloudflared/config.yml`

## Routing Rules
| Public Hostname | Local Service |
| :--- | :--- |
| `smuvejeffpresents.com` | `http://localhost:4200` |
| `www.smuvejeffpresents.com` | `http://localhost:4200` |

## Operational Commands

### Starting the Tunnel
To start the tunnel using the permanent config file:
```bash
cloudflared tunnel run smuve-connect
```

### Troubleshooting
If the tunnel fails to start, verify the credentials file exists at the path listed above.
