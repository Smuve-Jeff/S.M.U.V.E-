/**
 * S.M.U.V.E. 2.0 — Wasm DSP Interface
 * 
 * Defines the TypeScript interface that all Wasm DSP modules implement.
 * This allows the audio engine to load either a WebAssembly module
 * (for native performance) or a pure-JS fallback with identical behavior.
 * 
 * Each module follows a "kernel" pattern: stateless pure functions
 * that operate on numeric arrays, making them trivially portable to Wasm.
 */

/** DSP kernel function signature: input arrays → output arrays */
export type DspKernelFn = (
  input: Float32Array,
  output: Float32Array,
  params: Float32Array,
  sampleRate: number
) => void;

/** Module descriptor returned after loading a Wasm DSP module */
export interface WasmDspModule {
  /** Unique module identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Version string */
  readonly version: string;
  /** Whether this is a native Wasm module or JS fallback */
  readonly isWasm: boolean;
  /** Heap memory usage in bytes (0 for JS fallback) */
  readonly heapBytes: number;

  /** Get a kernel function by name */
  getKernel(name: string): DspKernelFn | null;

  /** List available kernel names */
  listKernels(): string[];

  /** Release Wasm resources (no-op for JS fallback) */
  dispose(): void;
}

/** WebAssembly memory descriptor */
export interface WasmMemoryConfig {
  initialPages: number;
  maximumPages: number;
}

/** Configuration for loading a Wasm DSP module */
export interface WasmDspConfig {
  /** URL to the .wasm binary */
  wasmUrl?: string;
  /** JS fallback module to use when Wasm is unavailable */
  jsFallback?: () => WasmDspModule;
  /** Memory configuration */
  memory?: WasmMemoryConfig;
  /** Imported functions (e.g., math intrinsics) */
  imports?: WebAssembly.Imports;
}

/** DSP parameter descriptor for automation binding */
export interface DspParamDescriptor {
  id: string;
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  automatable: boolean;
}
