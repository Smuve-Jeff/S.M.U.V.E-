#!/usr/bin/env bash
# Runs every layout probe against a dev server on 127.0.0.1:3000.
set -uo pipefail
cd "$(dirname "$0")/../.."

probes=(
  layout-verify3
  tone-check
  console-fit
  scroll-check
  dj-carousel-check
  overhang-check
)

failed=0
for probe in "${probes[@]}"; do
  echo "── ${probe}"
  if ! node "tools/layout-checks/${probe}.cjs"; then
    failed=1
    echo "   FAILED: ${probe}"
  fi
done

if [ "${failed}" -eq 0 ]; then
  echo "All layout probes passed."
else
  echo "One or more layout probes failed."
fi
exit "${failed}"
