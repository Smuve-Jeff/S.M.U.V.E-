#!/usr/bin/env bash
# One-shot helper: commit the S.M.U.V.E. API scaffold, Angular wiring, app unlock and
# Cloudflare-tunnel deployment switch to main and push.
# Safe by design: never uses `git add -A` (excludes src/config/.env secrets, S.M.U.V.E-/ clone, nvchad-termux/).
set -euo pipefail

cd "$(dirname "$0")"

# 1) Protect the local secrets file from ever being committed
if ! grep -q 'src/config/.env' .gitignore; then
  printf '\n# Local API secrets\nsrc/config/.env\n' >> .gitignore
fi

# 2) Switch to main
git checkout main

# 3) Remove GitHub Pages / Render deployment artifacts
rm -f render.yaml CNAME
# CNAME is a tracked GitHub Pages custom-domain marker — stage its removal
# (no-op if it was never tracked).
git add -A -- CNAME 2>/dev/null || true

# 4) Delete the old server/ backend (superseded by the new src/ API)
rm -rf server
# Stage the deletion of tracked server/ files (no-op if nothing tracked).
git add -A -- server 2>/dev/null || true

# 5) Resync package-lock.json after removing angular-cli-ghpages + server workspace (keeps npm ci happy)
if command -v npm >/dev/null 2>&1; then
  if ! npm install --package-lock-only --legacy-peer-deps >/dev/null 2>&1; then
    echo "WARNING: could not resync package-lock.json — angular-cli-ghpages may remain in the lockfile. Run 'npm install' before 'npm ci'."
  fi
fi

# 6) Stage explicitly
git add .gitignore .env.example .prettierrc package.json package-lock.json \
  angular.json eslint.config.js jest.config.cjs playwright.config.ts README.md \
  docs/PLAY_STORE_DEPLOY.md CLOUDFLARE_TUNNEL.md \
  tests/e2e/verify_boot.spec.ts \
  tsconfig.json tsconfig.server.json \
  src/app.ts src/index.ts \
  src/config/env.ts src/config/index.ts \
  src/database/data-source.ts src/database/migrations/ \
  src/entities/ \
  src/lib/ src/middleware/ \
  src/routes/ \
  src/services/ src/types/ src/validators/ src/hooks/ src/store/ \
  src/socket/ \
  src/index.html src/styles.css src/assets/worklets/recording-processor.worklet.js \
  setup-jest-server.ts \
  src/app/

# 7) Safety check — abort if secrets or clones got staged
if git status --short | grep -Eq 'src/config/\.env|S\.M\.U\.V\.E-|nvchad'; then
  echo "ABORTING: secrets or clones staged — inspect 'git status' and fix before retrying."
  exit 1
fi
echo "SAFE: no secrets or clones staged"

# 8) Commit (skip if nothing staged)
if git diff --cached --quiet; then
  echo "Nothing new staged — skipping commit."
else
  git commit -m "feat(api): Express + TypeORM backend, Angular API wiring, catalog UI, unlock + tunnel deploy

- Backend: auth (bcrypt + JWT), users, products CRUD, health endpoint, zod validation, central error handler, initial migration
- Split tsconfigs: Angular app vs tsconfig.server.json (restores ng build); dev:web/build:web/serve:web
- Angular: typed ApiAuthService + API-first login with demo fallback, auth interceptor, The Vault product catalog page + hub link, Cinzel footer brand
- Remove authGuard from all routes (app fully unlocked); catalog public, write ops API-gated
- Delete old server/ backend (superseded by new src/ API); remove workspace + jest/eslint references
- Point AUTH_API_URL + api_url at https://api.smuvejeffpresents.com/api via the smuve-connect tunnel
- Deployment: erase GitHub Pages (CNAME, ghpages config, deploy script, angular-cli-ghpages) and Render (render.yaml); Cloudflare tunnel smuve-connect is the canonical path (web + API)"
fi

# 9) Update from remote, then push
git pull --rebase origin main || { echo "PULL CONFLICT — run: git rebase --abort"; exit 1; }
git push origin main

echo
echo "=== Done. Latest commits: ==="
git log --oneline -3
echo
echo "Tip: remove this helper with: rm git-push-main.sh"
