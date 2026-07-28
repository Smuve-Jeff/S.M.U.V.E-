#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# S.M.U.V.E. 2.0 — Wasm DSP build pipeline
#
# Reproducible build using the official emscripten Docker image so that every
# developer / CI machine produces byte-identical .wasm modules without needing
# a local emsdk install.
#
# To run locally:
#   npm run build:wasm
#
# To inspect the produced modules:
#   file Build/wasm/smuve.saturation.wasm
#   wasm2wat Build/wasm/smuve.saturation.wasm | head
#
# To re-deploy to the running audio engine:
#   aws --region us-east-1 s3 sync Build/wasm/ s3://smuve-cdn/wasm/v1/ --acl=public-read
#   (or copy into src/assets/wasm/ for inline bundling)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Resolve script directory (works when invoked from anywhere) ────────────
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="${SCRIPT_DIR}/.."
SRC_DIR="${ROOT_DIR}/src/app/studio/wasm/c"
OUT_DIR="${ROOT_DIR}/Build/wasm"
EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:3.1.61}"

# ── Allow ARM64 macOS / Apple Silicon to use Rosetta-free emscripten tag ───
case "$(uname -m)" in
  arm64|aarch64)  EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:3.1.61-arm64}" ;;
  *) ;;
esac

# ── Validate Docker availability before failing on a wall ──────────────────
if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<EOF
[!] Docker is required to build S.M.U.V.E. Wasm DSP modules.

    Install Docker:  https://docs.docker.com/engine/install/
    Or build locally: emsdk install 3.1.61 && source ./emsdk_env.sh

EOF
  exit 1
fi

mkdir -p "${OUT_DIR}"

# ── Module list, ABI-stable names exported by every Wasm binary ───────────
# Each module exposes:
#   wasm_process_audio(inputPtr, outputPtr, paramsPtr, sampleRate, frames)
# and an init() helper.
#
# Memory: WebAssembly.Memory is created in the WasmLoaderService (TS). The
# .wasm exports memory = 0 for now — single-page static allocation.
MODULES=(
  "saturation"
  # "compressor" # staged: Sprint 3.1
  # "limiter"    # staged: Sprint 3.2
  # "eq"         # staged: Sprint 3.3
  # "master_chain" # staged: Sprint 3.4
)

# ── Common emcc flags — kept identical to all modules so the loading ABI holds
EMCC_FLAGS=(
  -O3
  -msimd128         # WebAssembly SIMD — supported on Chromium 91+, all Android 11+ WebView
  -msse4.1          # Saturate equivalent SIMD ops on x86_64 dev box
  -mavx             # Mark unused; ignored when SIMD arch is selected
  -ffast-math
  -fno-exceptions
  -fno-rtti
  -fvisibility=hidden
  -s WASM=1
  -s ASYNCIFY=0
  -s SINGLE_FILE=1                      # embed .js glue into .wasm for tiny payload
  -s MODULARIZE=1
  -s EXPORT_NAME='"SmuveDspModule_${NAME}"'
  -s ALLOW_MEMORY_GROWTH=1
  -s USE_PTHREADS=0                     # threading complicates COOP/COEP story
  -s SUPPORT_LONGJMP=0
  -s STANDALONE_WASM=0
  -s EXPORTED_FUNCTIONS='["_wasm_process_audio","_wasm_get_version","_wasm_init","_wasm_get_kernel_size"]'
  -s "EXPORTED_RUNTIME_METHODS='[\"cwrap\",\"getValue\",\"setValue\",\"HEAPF32\"]'"
  -s ASSERTIONS=0
  -s TEXTDECODER=0
  -s ENVIRONMENT='web,worker'
  --no-entry
  -Wl,--strip-all
)

echo "━" "Building S.M.U.V.E. Wasm DSP modules using ${EMSDK_IMAGE}"
echo "━" "Source:  ${SRC_DIR}"
echo "━" "Output:  ${OUT_DIR}"
echo

for MODULE in "${MODULES[@]}"; do
  echo "[+] ${MODULE}"
  NAME="${MODULE}"

  docker run --rm \
    -v "${ROOT_DIR}:/src" \
    -w /src/src/app/studio/wasm/c \
    -u "$(id -u):$(id -g)" \
    "${EMSDK_IMAGE}" \
    emcc "${MODULE}.cpp" \
      "${EMCC_FLAGS[@]}" \
      -o "/src/Build/wasm/smuve.${MODULE}.wasm" \
      --post-js "/src/src/app/studio/wasm/c/post-js.tmpl.js"

  # Strip + measure
  SIZE=$(stat -c%s "${OUT_DIR}/smuve.${MODULE}.wasm" 2>/dev/null || \
         stat -f%z "${OUT_DIR}/smuve.${MODULE}.wasm")
  printf "    %-22s %6d bytes\n" "smuve.${MODULE}.wasm" "${SIZE}"
done

echo
echo "[copying module manifest] build/wasm/manifest.json"
cat > "${OUT_DIR}/manifest.json" << 'EOF'
{
  "abi": {
    "version": 1,
    "memoryLayout": "linear, exported by host (.ts) via WebAssembly.Memory",
    "exports": {
      "wasm_process_audio": "(inputPtr: u32, outputPtr: u32, paramsPtr: u32, sampleRate: f32, frames: u32) -> void",
      "wasm_init":           "() -> bool",
      "wasm_get_version":    "() -> u32",
      "wasm_get_kernel_size":"(namePtr: u32) -> u32"
    },
    "callingConvention": {
      "0": "input interleaved L/R as Float32Array at inputPtr",
      "1": "output interleaved L/R Float32Array at outputPtr (preallocated by host)",
      "2": "parameter block Float32Array at paramsPtr (length is module-specific)",
      "3": "sampleRate as f32",
      "4": "frames: total stereo frames to process"
    }
  },
  "modules": []
}
EOF

# Annotate manifest with module list
node -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  manifest.modules = process.argv.slice(2).map((mod) => ({
    id: `smuve.${mod}.v2`,
    file: `smuve.${mod}.wasm`,
    loader: "wasm-loader.service.ts"
  }));
  fs.writeFileSync(process.argv[1], JSON.stringify(manifest, null, 2) + "\n");
' "${OUT_DIR}/manifest.json" "${MODULES[@]}"

echo
echo "[done] All Wasm modules emitted to Build/wasm/"
ls -lh "${OUT_DIR}/"
echo
echo "Upload target:"
echo "  ${OUT_DIR}/ → src/assets/wasm/  (for inline bundling, hot cache)"
echo "  ${OUT_DIR}/ → https://cdn.smuve.app/wasm/v1/  (for edge-cached delivery)"
