// ─────────────────────────────────────────────────────────────────────────────
// S.M.U.V.E. 2.0 — Saturation Wasm DSP Kernel (Proof of Concept)
//
// SPDX-License-Identifier: MIT
//
// Mirrors the JS implementation in `wasm-dsp-kernels.ts` exactly so the
// `WasmLoaderService` can swap implementations without touching call sites.
//
// Memory: input + output + params floats are read/written through the shared
// WebAssembly.Memory that the host (TypeScript) manages. The host calls:
//
//     wasm_process_audio(inputPtr, outputPtr, paramsPtr, sampleRate, frames)
//
// and the kernel consumes interleaved L/R stereo Float32 data (length = frames*2).
//
// params layout:
//   params[0] = amount  (0..1)
//   params[1] = mix     (0..1)
//   params[2] = mode    (0=tanh, 1=cubic, 2=soft)
// ─────────────────────────────────────────────────────────────────────────────

#include <cstdint>
#include <cmath>

#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

extern "C" {

// Returns the Wasm DSP ABI version — host checks this against its expected
// revision before calling. Bump on breaking ABI changes.
uint32_t wasm_get_version() {
  return 1;
}

// Returns the size (in floats) of the params block this module expects.
// Host calls this once after instantiation to allocate params memory.
uint32_t wasm_get_kernel_size(uint32_t /*namePtr*/) {
  return 3;
}

// Initialise module state. Returns true on success. Currently a no-op for
// this kernel; reserved for stateful kernels (compressor env follower, etc.).
bool wasm_init() {
  return true;
}

// Apply saturation/soft-clip in-place to stereo Float32 buffer.
//   inputPtr       : pointer to interleaved stereo buffer (2 * frames floats)
//   outputPtr      : pointer to preallocated output buffer (same size)
//   paramsPtr      : pointer to [amount, mix, mode]
//   sampleRate     : unused for this kernel; kept for ABI compatibility
//   frames         : number of stereo frames to process
void wasm_process_audio(
    const float* input,
    float* output,
    const float* params,
    float /*sampleRate*/,
    uint32_t frames) noexcept {

  const float amount = params[0];
  const float mix    = params[1];
  const uint32_t mode = static_cast<uint32_t>(params[2]);
  const float drive = 1.0f + amount * 9.0f;  // 1x → 10x gain
  const float invDrive = 1.0f / drive;
  const float dryMix = 1.0f - mix;

  for (uint32_t i = 0; i < frames; ++i) {
    const float dryL = input[i * 2];
    const float dryR = input[i * 2 + 1];
    const float xL = dryL * drive;
    const float xR = dryR * drive;

    float wetL = 0.0f, wetR = 0.0f;

    switch (mode) {
      case 1: {  // cubic soft-clip
        wetL = (xL - (xL * xL * xL) / 3.0f) * invDrive;
        wetR = (xR - (xR * xR * xR) / 3.0f) * invDrive;
        break;
      }
      case 2: {  // rational soft-knee
        const float absL = std::fabs(xL);
        const float absR = std::fabs(xR);
        wetL = (xL / (1.0f + absL)) * invDrive;
        wetR = (xR / (1.0f + absR)) * invDrive;
        break;
      }
      default: {  // tanh — most common
        // std::tanh is vectorisable; for SIMD build this auto-vectorises.
        wetL = std::tanh(xL) * invDrive;
        wetR = std::tanh(xR) * invDrive;
      }
    }

    // Soft-clip output to [-1, 1] — defence against extreme drive.
    float outL = dryL * dryMix + wetL * mix;
    float outR = dryR * dryMix + wetR * mix;
    outL = outL < -1.0f ? -1.0f : (outL > 1.0f ? 1.0f : outL);
    outR = outR < -1.0f ? -1.0f : (outR > 1.0f ? 1.0f : outR);

    output[i * 2]     = outL;
    output[i * 2 + 1] = outR;
  }
}

}  // extern "C"
