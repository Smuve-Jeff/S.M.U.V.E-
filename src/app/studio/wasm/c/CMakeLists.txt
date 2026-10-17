# ─────────────────────────────────────────────────────────────────────────────
# S.M.U.V.E. 2.0 — Wasm DSP CMake configuration
#
# This file is invoked by scripts/build-wasm.sh. Each kernel gets its own
# single WASM binary so the host can lazy-load and memory-budget per module.
#
# To build a single module locally:
#   cd src/app/studio/wasm/c
#   emcc saturation.cpp -O3 -msimd128 -s SINGLE_FILE=1 \
#       -s EXPORT_NAME='"SmuveDspModule_saturation"' \
#       -o saturation.wasm
# ─────────────────────────────────────────────────────────────────────────────

cmake_minimum_required(VERSION 3.20)
project(smuve_dsp_kernels LANGUAGES C CXX)

# ── Module-wide ABI guarantees ───────────────────────────────────────────────
# Every kernel MUST export exactly:
#   wasm_init / wasm_get_version / wasm_get_kernel_size / wasm_process_audio
# Adding exports is fine; removing/renaming breaks the WasmLoaderService.

# Activated when CMake is invoked directly with Emscripten toolchain file.
# For the Docker build we use raw emcc flags inside build-wasm.sh — not CMake.
# Therefore this file only documents the target ABI for future use; the
# "npm run build:wasm" path uses the Docker emcc compile path.

set(KERNELS
  saturation
  # compressor
  # limiter
  # eq
  # master_chain
)

# Function to emit a target per kernel. Kept available for IDE / local dev
# only — the production build pipeline is the Docker script.
function(smuve_add_dsp_kernel NAME)
  add_executable(${NAME} ${NAME}.cpp)
  set_target_properties(${NAME} PROPERTIES
    OUTPUT_NAME "smuve.${NAME}.wasm"
    SUFFIX ".wasm"
  )
  target_compile_options(${NAME} PRIVATE
    -O3
    -msimd128
    -ffast-math
    -fno-exceptions
    -fno-rtti
  )
endfunction()

foreach(K IN LISTS KERNELS)
  smuve_add_dsp_kernel(${K})
endforeach()

message(STATUS "S.M.U.V.E. DSP kernels configured: ${KERNELS}")
message(STATUS "Production build path: scripts/build-wasm.sh (Docker emsdk)")
