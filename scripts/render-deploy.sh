#!/usr/bin/env bash
# Trigger a deploy of the smuve-api web service on Render via the Render API.
#
# Prerequisites:
#   RENDER_API_KEY    - Render API key (Render dashboard -> Account Settings -> API Keys)
#   RENDER_SERVICE_ID - the srv-... id of the smuve-api service (or pass as $1)
#
# Usage:
#   RENDER_API_KEY=<key> RENDER_SERVICE_ID=srv-xxxx ./scripts/render-deploy.sh
#   RENDER_API_KEY=<key> ./scripts/render-deploy.sh srv-xxxx
set -euo pipefail

SERVICE_ID="${1:-${RENDER_SERVICE_ID:-}}"

if [[ -z "${SERVICE_ID}" ]]; then
  echo "ERROR: Render service id missing. Set RENDER_SERVICE_ID or pass it as the first argument (format: srv-...)." >&2
  exit 1
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "ERROR: RENDER_API_KEY is not set. Add it in the Keys tab (Render dashboard -> Account Settings -> API Keys)." >&2
  exit 1
fi

echo "Triggering deploy for Render service ${SERVICE_ID} ..."
curl -fsS -X POST \
  "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{}'

echo
echo "Deploy triggered. Track progress in the Render dashboard."
