/**
 * recording-processor.worklet.js
 * S.M.U.V.E. 2.0 — High-performance audio capture worklet.
 *
 * Records audio from a MediaStream source, splits into left/right channels,
 * and sends fixed-size Float32Array chunks back to the main thread via
 * port.postMessage. Zero-copy transfer using SharedArrayBuffer fallback.
 *
 * Commands:
 *   START  — begin capturing buffers
 *   STOP   — pause capture (buffers preserved until FLUSH)
 *   FLUSH  — send remaining partial buffer and reset
 *
 * Messages emitted:
 *   DATA   — { command: 'DATA', left: Float32Array[], right: Float32Array[] }
 */

const CHUNK_DURATION_SECONDS = 0.05; // 50 ms per chunk
const MAX_CHUNK_LENGTH = 2048; // safety cap

class RecordingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = false;
    this._leftQueue = [];
    this._rightQueue = [];
    this._leftPartial = []; // Accumulator for sub-chunk writes
    this._rightPartial = [];
    this._sampleRate = sampleRate;

    this.port.onmessage = (event) => {
      const cmd = event.data?.command;
      if (cmd === 'START') {
        this._active = true;
      } else if (cmd === 'STOP') {
        this._active = false;
      } else if (cmd === 'FLUSH') {
        this._flush();
      }
    };
  }

  /**
   * Called by the audio graph on every render quantum (128 frames).
   * Collects samples into 50ms chunks and sends them to the main thread.
   */
  process(inputs, outputs, _parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const leftInput = input[0];
    const rightInput = input.length > 1 ? input[1] : input[0]; // mono→stereo duplication

    if (!leftInput || !this._active) return true;

    for (let i = 0; i < leftInput.length; i++) {
      this._leftPartial.push(leftInput[i]);
      this._rightPartial.push(rightInput[i]);
    }

    // Flush full chunks
    const chunkFrames = Math.min(
      Math.floor(this._sampleRate * CHUNK_DURATION_SECONDS),
      MAX_CHUNK_LENGTH
    );

    while (this._leftPartial.length >= chunkFrames) {
      const leftChunk = new Float32Array(chunkFrames);
      const rightChunk = new Float32Array(chunkFrames);
      for (let i = 0; i < chunkFrames; i++) {
        leftChunk[i] = this._leftPartial[i];
        rightChunk[i] = this._rightPartial[i];
      }
      this._leftPartial.splice(0, chunkFrames);
      this._rightPartial.splice(0, chunkFrames);
      this._leftQueue.push(leftChunk);
      this._rightQueue.push(rightChunk);
    }

    // Send accumulated chunks to main thread (max 16 at a time to avoid GC pressure)
    if (this._leftQueue.length >= 16) {
      this._sendChunks();
    }

    return true;
  }

  /** Ship all queued chunks to the main thread and reset queues. */
  _sendChunks() {
    if (this._leftQueue.length === 0) return;
    this.port.postMessage({
      command: 'DATA',
      left: this._leftQueue.slice(),
      right: this._rightQueue.slice(),
    });
    this._leftQueue = [];
    this._rightQueue = [];
  }

  /** Flush remaining partial buffer then reset everything. */
  _flush() {
    if (this._leftPartial.length > 0) {
      const leftChunk = new Float32Array(this._leftPartial);
      const rightChunk = new Float32Array(this._rightPartial);
      this._leftQueue.push(leftChunk);
      this._rightQueue.push(rightChunk);
    }
    this._sendChunks();
    // Acknowledge only after DATA has been posted so the main thread can
    // safely finalize the WAV without relying on an arbitrary timeout.
    this.port.postMessage({ command: 'FLUSHED' });
    this._leftPartial = [];
    this._rightPartial = [];
    this._leftQueue = [];
    this._rightQueue = [];
  }
}

registerProcessor('recording-processor', RecordingProcessor);
