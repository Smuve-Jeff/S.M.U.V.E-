import { Injectable, signal } from '@angular/core';
import {
  WasmDspModule,
  WasmDspConfig,
  DspKernelFn,
} from './wasm-dsp-interface';

/**
 * S.M.U.V.E. 2.0 — Wasm DSP Loader Service
 * 
 * Loads WebAssembly DSP modules with automatic JS fallback.
 * Handles memory management, module caching, and feature detection.
 * 
 * Architecture:
 *   1. Try to fetch and instantiate the .wasm binary
 *   2. If Wasm is unavailable or fails, use the provided JS fallback
 *   3. Expose kernel functions through a unified interface
 *   4. Track which modules are loaded and their performance
 */
@Injectable({ providedIn: 'root' })
export class WasmLoaderService {
  /** Currently loaded modules (id → module) */
  private modules = new Map<string, WasmDspModule>();

  /** Whether WebAssembly is supported in this browser */
  readonly wasmSupported = signal(
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function' &&
    typeof WebAssembly.Memory === 'function'
  );

  /** Loading state: true while a module is being fetched */
  readonly isLoading = signal(false);

  /** Error from the last load attempt, or null */
  readonly loadError = signal<string | null>(null);

  /**
   * Load a Wasm DSP module with JS fallback.
   * 
   * @param moduleId Unique identifier for caching
   * @param config Module configuration
   * @returns The loaded module (Wasm or JS fallback)
   */
  async loadModule(
    moduleId: string,
    config: WasmDspConfig
  ): Promise<WasmDspModule | null> {
    // Return cached module if already loaded
    if (this.modules.has(moduleId)) {
      return this.modules.get(moduleId)!;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      let module: WasmDspModule | null = null;

      // Try Wasm first if supported and URL provided
      if (this.wasmSupported() && config.wasmUrl) {
        try {
          module = await this.loadWasmModule(moduleId, config);
        } catch (err: any) {
          console.warn(
            `WasmLoader: Wasm load failed for '${moduleId}', falling back to JS.`,
            err?.message
          );
        }
      }

      // Fall back to JS implementation
      if (!module && config.jsFallback) {
        console.info(`WasmLoader: Using JS fallback for '${moduleId}'`);
        module = config.jsFallback();
      }

      if (module) {
        this.modules.set(moduleId, module);
        this.isLoading.set(false);
        return module;
      }

      this.loadError.set(`No module available for '${moduleId}'`);
      this.isLoading.set(false);
      return null;
    } catch (err: any) {
      this.loadError.set(err?.message ?? 'Unknown load error');
      this.isLoading.set(false);
      return null;
    }
  }

  /**
   * Get a kernel function from a loaded module.
   * Shortcut for: loader.getModule(id)?.getKernel(name)
   */
  getKernel(
    moduleId: string,
    kernelName: string
  ): DspKernelFn | null {
    const module = this.modules.get(moduleId);
    return module?.getKernel(kernelName) ?? null;
  }

  /**
   * Get a loaded module by id.
   */
  getModule(moduleId: string): WasmDspModule | null {
    return this.modules.get(moduleId) ?? null;
  }

  /**
   * Unload a module and free its resources.
   */
  unloadModule(moduleId: string): void {
    const module = this.modules.get(moduleId);
    if (module) {
      module.dispose();
      this.modules.delete(moduleId);
    }
  }

  /**
   * Check if a module is loaded.
   */
  isLoaded(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  /**
   * List all loaded module ids.
   */
  listLoaded(): string[] {
    return Array.from(this.modules.keys());
  }

  // ── Private Wasm loader ─────────────────────────────────

  private async loadWasmModule(
    moduleId: string,
    config: WasmDspConfig
  ): Promise<WasmDspModule> {
    if (!config.wasmUrl) {
      throw new Error('No wasmUrl provided');
    }

    const imports: WebAssembly.Imports = {
      env: {
        memory: new WebAssembly.Memory({
          initial: config.memory?.initialPages ?? 256,
          maximum: config.memory?.maximumPages ?? 512,
        }),
        ...config.imports?.env,
      },
      ...config.imports,
    };

    const response = await fetch(config.wasmUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${config.wasmUrl}`);
    }

    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, imports);

    // Build the module wrapper
    const exports = instance.exports as Record<string, any>;
    const memory = (imports.env?.memory as WebAssembly.Memory) ?? null;
    const heapBytes = memory ? memory.buffer.byteLength : 0;

    return {
      id: moduleId,
      name: moduleId,
      version: '1.0.0',
      isWasm: true,
      heapBytes,

      getKernel(name: string): DspKernelFn | null {
        const fn = exports[name];
        if (typeof fn !== 'function') return null;

        // Wrap Wasm function as DspKernelFn
        return (
          input: Float32Array,
          output: Float32Array,
          params: Float32Array,
          sampleRate: number
        ) => {
          // Copy input to Wasm memory, call function, copy output back
          // (implementation depends on specific Wasm module ABI)
          fn(input, output, params, sampleRate);
        };
      },

      listKernels(): string[] {
        return Object.keys(exports).filter(
          (k) => typeof exports[k] === 'function'
        );
      },

      dispose(): void {
        // Wasm memory is garbage-collected when module is dereferenced
      },
    };
  }
}
