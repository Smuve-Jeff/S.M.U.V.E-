#!/usr/bin/env bash
#
# Playwright's Chromium needs X11/NSS/ALSA shared libraries plus a fontconfig
# setup that a slim cloud sandbox does not ship, and there is no root to
# `apt-get install` them. This script downloads the .deb packages (no root
# needed), unpacks their contents into a workspace-local prefix, seeds the user
# font directory, and prints the environment to run the suite with:
#
#   env $(bash scripts/setup-e2e-browser-libs.sh) \
#     FREEBUFF_MANAGED_PREVIEW=1 npx playwright test tests/e2e/<spec>.spec.ts
#
# Both halves are required. Without the libraries Chromium cannot start; without
# fontconfig it starts and then aborts the moment a page renders text:
#   FATAL:third_party/skia/src/ports/SkFontMgr_FontConfigInterface.cpp Not implemented
#
# Re-running is cheap: packages already unpacked are simply unpacked again.
set -euo pipefail

PREFIX="${PW_LIBS_PREFIX:-/tmp/pwlibs}"
PACKAGES=(
  libnspr4
  libnss3
  libasound2t64
  libatk1.0-0t64
  libatk-bridge2.0-0t64
  libatspi2.0-0t64
  libdbus-1-3
  libxkbcommon0
  libxcomposite1
  libxdamage1
  libxfixes3
  libxrandr2
  libxi6
  libxrender1
  libxtst6
  libxext6
  libx11-6
  libxcb1
  libxau6
  libxdmcp6
  libbsd0
  # Text rendering: Skia aborts without a fontconfig config file, and fontconfig
  # is only useful with at least one installed font.
  fontconfig
  fontconfig-config
  fonts-dejavu-core
)

mkdir -p "$PREFIX/debs" "$PREFIX/root"
cd "$PREFIX/debs"
for pkg in "${PACKAGES[@]}"; do
  apt-get download "$pkg" >/dev/null 2>&1 || echo "  (skipped $pkg)"
done
for deb in *.deb; do
  [ -e "$deb" ] || continue
  dpkg-deb -x "$deb" "$PREFIX/root"
done

LIB_DIR="$PREFIX/root/usr/lib/x86_64-linux-gnu"
FONT_DIR="$PREFIX/root/etc/fonts"

# fontconfig reads ~/.fonts as a default directory, which is writable without
# root, so unpacked fonts can be used where a system font directory would go.
mkdir -p "$HOME/.fonts"
if [ -d "$PREFIX/root/usr/share/fonts" ]; then
  find "$PREFIX/root/usr/share/fonts" -name '*.ttf' -exec cp -n {} "$HOME/.fonts/" \; 2>/dev/null || true
fi

# Prove the browser can actually load before the caller runs a suite.
BROWSER="$(ls "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | head -1 || true)"
if [ -n "$BROWSER" ]; then
  if ! LD_LIBRARY_PATH="$LIB_DIR" "$BROWSER" --version >/dev/null 2>&1; then
    echo "warning: $BROWSER still cannot start — check its 'not found' libraries with: ldd \"$BROWSER\"" >&2
  fi
fi

echo "LD_LIBRARY_PATH=$LIB_DIR FONTCONFIG_PATH=$FONT_DIR"
