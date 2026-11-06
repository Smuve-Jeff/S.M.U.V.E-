/// <reference lib="webworker" />
/**
 * S.M.U.V.E. 2.0 — Spectral stem-separation worker.
 *
 * Runs the same `separateIntoStems` DSP as the main-thread fallback; this file
 * only moves the work off the UI thread and forwards stage progress so the
 * modal can show what is happening during a long track.
 */
import { separateIntoStems } from "../services/stem-separation.dsp";
import type {
  StemChannels,
  StemSeparationProgress,
} from "../services/stem-separation.dsp";

type WorkerIn = {
  type: "SEPARATE";
  payload: { channels: Float32Array[]; sampleRate: number };
};

type WorkerOut =
  | { type: "PROGRESS"; payload: StemSeparationProgress }
  | { type: "COMPLETE"; payload: StemChannels }
  | { type: "ERROR"; payload: { message: string } };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
  if (event.data?.type !== "SEPARATE") {
    return;
  }

  const { channels, sampleRate } = event.data.payload;
  try {
    const stems = await separateIntoStems(channels, sampleRate, (update) => {
      self.postMessage({ type: "PROGRESS", payload: update } satisfies WorkerOut);
    });

    const transfer: ArrayBuffer[] = [];
    for (const parts of Object.values(stems)) {
      for (const part of parts) {
        transfer.push(part.buffer);
      }
    }
    self.postMessage({ type: "COMPLETE", payload: stems } satisfies WorkerOut, transfer);
  } catch (error) {
    self.postMessage({
      type: "ERROR",
      payload: { message: (error as Error)?.message ?? String(error) },
    } satisfies WorkerOut);
  }
};

export {};
