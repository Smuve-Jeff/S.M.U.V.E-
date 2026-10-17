import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';
import {
  wasmDynamicsModule,
  wasmEqModule,
  wasmMasterChainModule,
  wasmSaturationModule,
} from './wasm-dsp-kernels';
import type { DspKernelFn, WasmDspModule } from './wasm-dsp-interface';

/**
 * The live plugin inserts run in `src/assets/worklets/plugin-chain-processor.worklet.js`
 * because the audio thread cannot host the app's TS modules: Angular copies
 * `src/assets` verbatim, so the worklet carries its own copy of the DSP that
 * `wasm-dsp-kernels.ts` runs offline. These specs are the guard against the two
 * copies drifting apart — the first render quantum through the worklet must be
 * numerically identical to one call of the offline kernel, for every kernel.
 */

const SAMPLE_RATE = 48000;
const QUANTUM = 128;

interface RegisteredProcessor {
  name: string;
  ctor: any;
}

let registered: RegisteredProcessor;

/** Load the worklet asset in a fresh realm, exactly like the audio thread does. */
function loadWorklet(): RegisteredProcessor {
  const source = readFileSync(
    join(process.cwd(), 'src/assets/worklets/plugin-chain-processor.worklet.js'),
    'utf8',
  );
  const captured: RegisteredProcessor[] = [];
  const sandbox: Record<string, unknown> = {
    AudioWorkletProcessor: class {
      port = { onmessage: null, postMessage: () => undefined };
    },
    registerProcessor: (name: string, ctor: any) => {
      captured.push({ name, ctor });
    },
    sampleRate: SAMPLE_RATE,
    currentTime: 0,
    console,
  };
  runInNewContext(source, sandbox);
  if (captured.length === 0) throw new Error('worklet did not register a processor');
  return captured[0];
}

beforeAll(() => {
  registered = loadWorklet();
});

interface Slot {
  id: string;
  kernel: string;
  params?: number[] | Float32Array;
}

/**
 * Build a processor instance. `params` are passed as a plain array so the spec
 * exercises the same structured-clone path a `postMessage` from the engine uses.
 */
function makeProcessor(slots: Slot[], channels: 1 | 2 = 2): any {
  const ctor = registered.ctor;
  return new ctor({
    processorOptions: {
      channels,
      chain: slots.map((slot) => ({
        id: slot.id,
        kernel: slot.kernel,
        params: slot.params ? Array.from(slot.params) : [],
      })),
    },
  });
}

/** Render one stereo 128-frame quantum and return both output channels. */
function renderQuantum(
  processor: any,
  left: Float32Array,
  right?: Float32Array,
): { left: Float32Array; right: Float32Array } {
  const outputs = [new Float32Array(QUANTUM), new Float32Array(QUANTUM)];
  processor.process([[left, right ?? left]], [outputs]);
  return { left: outputs[0], right: outputs[1] };
}

function testSignal(): { left: Float32Array; right: Float32Array } {
  const left = new Float32Array(QUANTUM);
  const right = new Float32Array(QUANTUM);
  for (let i = 0; i < QUANTUM; i++) {
    left[i] = 0.7 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
    right[i] = 0.5 * Math.cos((2 * Math.PI * 330 * i) / SAMPLE_RATE);
  }
  return { left, right };
}

function interleave(left: Float32Array, right: Float32Array): Float32Array {
  const frames = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i++) {
    frames[i * 2] = left[i];
    frames[i * 2 + 1] = right[i];
  }
  return frames;
}

function tsKernel(module: () => WasmDspModule, name: string): DspKernelFn {
  const kernel = module().getKernel(name);
  if (!kernel) throw new Error(`offline kernel '${name}' is missing`);
  return kernel;
}

/** Largest sample-wise difference between a worklet render and an offline one. */
function maxDiff(
  outLeft: Float32Array,
  outRight: Float32Array,
  expected: Float32Array,
): number {
  let worst = 0;
  for (let i = 0; i < outLeft.length; i++) {
    worst = Math.max(worst, Math.abs(outLeft[i] - expected[i * 2]));
    worst = Math.max(worst, Math.abs(outRight[i] - expected[i * 2 + 1]));
  }
  return worst;
}

describe('plugin-chain-processor worklet', () => {
  it('registers the processor name the engine splices into the graph', () => {
    expect(registered.name).toBe('plugin-chain-processor');
  });

  describe('first-quantum parity with the offline kernels', () => {
    const cases: Array<{
      label: string;
      kernel: string;
      module: () => WasmDspModule;
      params: Float32Array;
    }> = [
      {
        label: 'compressor',
        kernel: 'compressor',
        module: wasmDynamicsModule,
        params: new Float32Array([-24, 4, 0.003, 0.1, 6, 0]),
      },
      {
        label: 'limiter',
        kernel: 'limiter',
        module: wasmDynamicsModule,
        params: new Float32Array([-0.3, 0.01, 64, -0.1]),
      },
      {
        label: 'eq',
        kernel: 'eq',
        module: wasmEqModule,
        params: new Float32Array([
          40, 3, 0.707, 120, -2, 0.707, 800, 1.5, 0.707, 4000, -1, 0.707, 12000, 2, 0.707,
        ]),
      },
      {
        label: 'saturate',
        kernel: 'saturate',
        module: wasmSaturationModule,
        params: new Float32Array([0.4, 1, 0]),
      },
      {
        label: 'master chain (process)',
        kernel: 'process',
        module: wasmMasterChainModule,
        params: new Float32Array([
          40, 0, 0.707, 120, 0, 0.707, 800, 0, 0.707, 4000, 0, 0.707, 12000, 0, 0.707,
          -20, 4, 0.003, 0.1, 6, 0, 0.15, 1, 0, -0.3, 0.01, 0, -1,
        ]),
      },
    ];

    for (const testCase of cases) {
      it(`${testCase.label} matches the offline kernel sample for sample`, () => {
        const { left, right } = testSignal();
        const expected = new Float32Array(QUANTUM * 2);
        tsKernel(testCase.module, testCase.kernel)(
          interleave(left, right),
          expected,
          testCase.params,
          SAMPLE_RATE,
        );

        const processor = makeProcessor([
          { id: `smuve.${testCase.label}`, kernel: testCase.kernel, params: testCase.params },
        ]);
        const out = renderQuantum(processor, left, right);

        expect(maxDiff(out.left, out.right, expected)).toBeLessThan(1e-9);
      });
    }

    it('honours a zero-valued param instead of falling back to the default', () => {
      // A peaking band at 0 dB is exactly unity, so the EQ must return the
      // input unchanged — the `??`-style defaults in the kernels would break
      // this if they were written as `||`.
      const { left, right } = testSignal();
      const processor = makeProcessor([
        {
          id: 'smuve.eq.mastering.v2',
          kernel: 'eq',
          params: [40, 0, 0.707, 120, 0, 0.707, 800, 0, 0.707, 4000, 0, 0.707, 12000, 0, 0.707],
        },
      ]);
      const out = renderQuantum(processor, left, right);

      expect(maxDiff(out.left, out.right, interleave(left, right))).toBeLessThan(1e-6);
    });
  });

  describe('kernel state across render quanta', () => {
    it('carries compressor gain reduction into the next quantum', () => {
      const loud = new Float32Array(QUANTUM).fill(0.9);
      const quiet = new Float32Array(QUANTUM).fill(0.05);
      const chain = [{ id: 'comp', kernel: 'compressor', params: [-24, 4, 0.003, 0.1, 6, 0] }];

      const continuing = makeProcessor(chain);
      renderQuantum(continuing, loud, loud);
      const carried = renderQuantum(continuing, quiet, quiet);

      // A fresh processor has no envelope yet, so it cannot be reducing gain.
      const fresh = makeProcessor(chain);
      const noState = renderQuantum(fresh, quiet, quiet);

      expect(carried.left[0]).toBeLessThan(noState.left[0]);

      // The envelope releases: 40 quiet quanta later the signal is closer to
      // its unprocessed level than it was on the first quiet quantum.
      for (let i = 0; i < 39; i++) renderQuantum(continuing, quiet, quiet);
      const released = renderQuantum(continuing, quiet, quiet);
      expect(released.left[0]).toBeGreaterThan(carried.left[0]);
    });

    it('carries biquad memory across quanta (no per-quantum reset click)', () => {
      const { left, right } = testSignal();
      const chain = [
        {
          id: 'eq',
          kernel: 'eq',
          params: [40, 6, 0.707, 120, 0, 0.707, 800, 0, 0.707, 4000, 0, 0.707, 12000, 0, 0.707],
        },
      ];
      const processor = makeProcessor(chain);
      renderQuantum(processor, left, right);
      const second = renderQuantum(processor, left, right);

      // Resetting the filter each quantum would make the second render
      // identical to the first; carried state must make it differ.
      const first = renderQuantum(makeProcessor(chain), left, right);
      expect(
        maxDiff(second.left, second.right, interleave(first.left, first.right)),
      ).toBeGreaterThan(0);
    });
  });

  describe('degradation', () => {
    it('passes audio through for an unknown kernel instead of muting the track', () => {
      const { left, right } = testSignal();
      const processor = makeProcessor([
        { id: 'smuve.community.v1', kernel: 'not-a-kernel', params: [] },
      ]);
      const out = renderQuantum(processor, left, right);

      expect(maxDiff(out.left, out.right, interleave(left, right))).toBe(0);
    });

    it('is a pure pass-through for an empty chain', () => {
      const { left, right } = testSignal();
      const out = renderQuantum(makeProcessor([]), left, right);

      expect(maxDiff(out.left, out.right, interleave(left, right))).toBe(0);
    });

    it('reads a disconnected input as silence without throwing', () => {
      const processor = makeProcessor([{ id: 'sat', kernel: 'saturate', params: [0.5, 1, 0] }]);
      const outputs = [new Float32Array(QUANTUM), new Float32Array(QUANTUM)];

      expect(() => processor.process([], [outputs])).not.toThrow();
      expect(Array.from(outputs[0])).toEqual(Array.from(new Float32Array(QUANTUM)));
    });

    it('keeps returning true so the node stays alive', () => {
      const { left, right } = testSignal();
      const processor = makeProcessor([{ id: 'sat', kernel: 'saturate', params: [0.5, 1, 0] }]);
      const outputs = [new Float32Array(QUANTUM), new Float32Array(QUANTUM)];
      expect(processor.process([[left, right]], [outputs])).toBe(true);
      expect(processor.process([[left, right]], [outputs])).toBe(true);
    });
  });

  describe('chain updates over the port', () => {
    it('swaps the running chain when the engine posts a new one', () => {
      const { left, right } = testSignal();
      const processor = makeProcessor([]);
      const clean = renderQuantum(processor, left, right);
      processor.port.onmessage({
        data: {
          type: 'chain',
          slots: [{ id: 'sat', kernel: 'saturate', params: [0.9, 1, 0] }],
        },
      });
      const driven = renderQuantum(processor, left, right);

      expect(
        maxDiff(clean.left, clean.right, interleave(driven.left, driven.right)),
      ).toBeGreaterThan(0);
    });

    it('ignores unrelated messages', () => {
      const { left, right } = testSignal();
      const processor = makeProcessor([{ id: 'sat', kernel: 'saturate', params: [0.5, 1, 0] }]);
      const before = renderQuantum(processor, left, right);
      processor.port.onmessage({ data: { type: 'something-else', slots: [] } });
      const after = renderQuantum(processor, left, right);

      expect(Array.from(after.left)).toEqual(Array.from(before.left));
    });
  });

  describe('mono inserts (per-track)', () => {
    it('processes a mono node and writes one output channel', () => {
      const left = new Float32Array(QUANTUM).fill(0.5);
      const processor = makeProcessor(
        [{ id: 'sat', kernel: 'saturate', params: [0.6, 1, 0] }],
        1,
      );
      const output = [new Float32Array(QUANTUM)];

      processor.process([[left]], [output]);

      expect(output.length).toBe(1);
      // tanh(0.5 * 6.4) / 6.4 — driven and attenuated, but present.
      expect(Math.abs(output[0][0])).toBeGreaterThan(0);
      expect(Math.abs(output[0][0])).toBeLessThan(Math.abs(left[0]));
    });
  });
});
