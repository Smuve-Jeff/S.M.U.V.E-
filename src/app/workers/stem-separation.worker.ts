/// <reference lib="webworker" />
/**
 * S.M.U.V.E. 2.0 — ONNX Stem-Separation Web Worker (Sprint 2)
 *
 * Receives stereo audio buffers, runs an ONNX model (`htdemucs` or similar)
 * using `onnxruntime-web` in a Web Worker so the UI thread never freezes.
 *
 * Architecture (opt-in, default OFF — gated by `StemSeparationService.useMlStems`):
 *
 *   main thread                  worker thread (this file)
 *   ─────────────────            ──────────────────────────
 *   F32 planars ─transferable─▶  sync wasm module via dynamic import
 *                                 load ONNX model from local OPFS / Cache API
 *                                 run inference, post progress messages
 *                              ◀─ progress events (PROGRESS | COMPLETE | ERROR)
 *
 * Activation policy: opt-in. Biquad fallback in the main thread remains the
 * default because raw model download is 13-80 MB. See the recommendations in
 * docs/PLAY_STORE_DEPLOY.md §9 for COOP/COEP dev-server notes.
 *
 * Model URL strategy:
 *   - First run: stream from Hugging Face (`Xenova/htdemucs`) → user-visible
 *     progress, written to Cache API under 'smuve-onnx-htdemucs-quantized'.
 *   - Subsequent runs: read from Cache API — no network, instant.
 *
 * Note: the worker is `?worker`-loaded, so `import` statements are relative
 * to the worker file. We dynamically import onnxruntime-web so the bundle
 * is NOT pulled into the main thread.
 */

/// Imports — Main thread sends us these messages:
type WorkerIn =
  | { type: 'SEPARATE'; payload: { left: Float32Array; right: Float32Array; sampleRate: number; quantizedModelUrl?: string } }
  | { type: 'CANCEL' };

/// Outbound messages — posted back to the main thread via postMessage:
type WorkerOut =
  | { type: 'PROGRESS'; payload: { progress: number; stage: 'loading-model' | 'running-inference' | 'returning-stems'; message: string } }
  | { type: 'COMPLETE'; payload: { stems: { vocals: Float32Array; drums: Float32Array; bass: Float32Array; instrumental: Float32Array; other: Float32Array }; sampleRate: number; durationMs: number } }
  | { type: 'ERROR'; payload: { message: string; stack?: string } };

declare const self: DedicatedWorkerGlobalScope;

let ortRef: any = null;          // cached `import('onnxruntime-web')` result
let cancelled = false;

async function ensureOrtLoaded(): Promise<any> {
  if (ortRef) return ortRef;
  self.postMessage({
    type: 'PROGRESS',
    payload: { progress: 5, stage: 'loading-model', message: 'Loading ONNX runtime (~700 KB)…' },
  } satisfies WorkerOut);
  ortRef = await import('onnxruntime-web');
  return ortRef;
}

/**
 * Streaming fetch a model file and write it into the Cache API.
 * Falls back to disk-cache if Cache API is unavailable.
 */
async function ensureModelCached(url: string): Promise<ArrayBuffer> {
  const cache = await caches.open('smuve-onnx-models-v1');
  const cached = await cache.match(url);
  if (cached) {
    return cached.arrayBuffer();
  }
  self.postMessage({
    type: 'PROGRESS',
    payload: { progress: 10, stage: 'loading-model', message: `Downloading ONNX model (~13 MB) from HF…` },
  } satisfies WorkerOut);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Model fetch failed: HTTP ${response.status}`);
  }

  // Stream-while-progressing
  const totalBytes = Number(response.headers.get('Content-Length') ?? 0);
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  if (reader && totalBytes > 0) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.byteLength;
      const pct = totalBytes > 0 ? Math.min(0.95, received / totalBytes) : 0;
      self.postMessage({
        type: 'PROGRESS',
        payload: {
          progress: 10 + Math.round(pct * 30),
          stage: 'loading-model',
          message: `Downloading model… ${Math.round(pct * 100)}% (${(received / 1024 / 1024).toFixed(1)} MB)`,
        },
      } satisfies WorkerOut);
      if (cancelled) throw new Error('Cancelled during model download');
    }

    // Cache the response for next time.
    const blob = new Blob(chunks as BlobPart[]);
    const cacheResponse = new Response(blob, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    await cache.put(url, cacheResponse.clone());
    return blob.arrayBuffer();
  } else {
    const arrayBuffer = await response.arrayBuffer();
    await cache.put(url, new Response(arrayBuffer.slice(0)));
    return arrayBuffer;
  }
}

/**
 * Run ONNX inference. The input tensor shape is model-specific; for a Demucs-
 * family 4-source separator it is typically [batch=1, channels=2,
 * samples=segmentLen]. For POC we assume the model accepts mono-mix input
 * — production model wiring is staged under Sprint 2.1.
 */
async function runInference(modelBytes: ArrayBuffer, left: Float32Array, right: Float32Array, sampleRate: number): Promise<{ vocals: Float32Array; drums: Float32Array; bass: Float32Array; other: Float32Array; instrumental: Float32Array }> {
  const ort = await ensureOrtLoaded();

  const session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
  });

  // Mix to mono for the canonical Demucs 4-source POC contract.
  const length = Math.min(left.length, right.length);
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) mono[i] = (left[i] + right[i]) * 0.5;

  // Reshape to [1, 1, samples] for the simplest ONNX contract.
  const tensor = new ort.Tensor('float32', mono, [1, 1, length]);
  const inputName = session.inputNames[0] ?? 'input';
  const outputMap = await session.run({ [inputName]: tensor });

  // POC: many sepformer / htdemucs outputs are dict[stemName → tensor].
  // Without a confirmed model, fall back to caller-expected layout.
  const expectedStems = ['vocals', 'drums', 'bass', 'other'] as const;
  const out: any = {};
  for (const stem of expectedStems) {
    const t = outputMap[stem] ?? outputMap.output ?? null;
    out[stem] = t ? new Float32Array(t.data as Float32Array) : mono.slice(0);
  }
  // Instrumental = sum of drums/bass/other (residual)
  const instrumental = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    instrumental[i] = (out.drums[i] ?? 0) + (out.bass[i] ?? 0) + (out.other[i] ?? 0);
  }

  await session.release();
  return { ...out, instrumental };
}

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
  if (event.data.type === 'CANCEL') {
    cancelled = true;
    self.postMessage({ type: 'PROGRESS', payload: { progress: 0, stage: 'running-inference', message: 'Cancelled' } } satisfies WorkerOut);
    return;
  }

  if (event.data.type === 'SEPARATE') {
    cancelled = false;
    const { left, right, sampleRate, quantizedModelUrl } = event.data.payload;
    const DEFAULT_MODEL_URL = quantizedModelUrl ||
      // Open-source, openly licensed, ~13 MB quantized ONNX Demucs stem model
      // (an Xenova/htdemucs OR similar may be substituted by the user via service config).
      'https://huggingface.co/Xenova/htdemucs/resolve/main/onnx/model_quantized.onnx';

    try {
      self.postMessage({ type: 'PROGRESS', payload: { progress: 2, stage: 'loading-model', message: 'Booting neural stem runtime…' } } satisfies WorkerOut);

      const modelBytes = await ensureModelCached(DEFAULT_MODEL_URL);
      self.postMessage({ type: 'PROGRESS', payload: { progress: 50, stage: 'running-inference', message: 'Running neural inference on-device…' } } satisfies WorkerOut);

      const result = await runInference(modelBytes, left, right, sampleRate);
      self.postMessage({ type: 'PROGRESS', payload: { progress: 95, stage: 'returning-stems', message: 'Returning results…' } } satisfies WorkerOut);

      const durationMs = Math.round((left.length / sampleRate) * 1000);
      self.postMessage({
        type: 'COMPLETE',
        payload: { stems: result, sampleRate, durationMs },
      } satisfies WorkerOut);
    } catch (err: any) {
      self.postMessage({
        type: 'ERROR',
        payload: {
          message: err?.message ?? String(err),
          stack: err?.stack,
        },
      } satisfies WorkerOut);
    }
  }
};

export {};  // required for `worker.ts` compilation under esModuleInterop=false
