import { wasmUtilityModule } from './wasm-dsp-kernels';

function stereoFrame(left: number, right: number): Float32Array {
  return new Float32Array([left, right]);
}

describe('WASM utility DSP kernels', () => {
  const module = wasmUtilityModule();

  it('lists all four utility kernels', () => {
    expect(module.listKernels().sort()).toEqual([
      'gate',
      'highpass',
      'transient',
      'width',
    ]);
  });

  it('collapses a stereo signal to mono at width 0', () => {
    const kernel = module.getKernel('width')!;
    const out = new Float32Array(2);
    kernel(stereoFrame(0.8, 0.2), out, new Float32Array([0]), 48_000);
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
  });

  it('keeps width 1 transparent', () => {
    const kernel = module.getKernel('width')!;
    const out = new Float32Array(2);
    kernel(stereoFrame(0.8, 0.2), out, new Float32Array([1]), 48_000);
    expect(out[0]).toBeCloseTo(0.8, 5);
    expect(out[1]).toBeCloseTo(0.2, 5);
  });

  it('attenuates a signal below the gate threshold', () => {
    const kernel = module.getKernel('gate')!;
    const out = new Float32Array(2);
    kernel(stereoFrame(0.001, 0.001), out, new Float32Array([-30, 0.001, 0.02, -60]), 48_000);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Math.abs(out[0])).toBeLessThanOrEqual(0.001);
  });

  it('preserves finite output from transient shaper and high-pass', () => {
    const transient = module.getKernel('transient')!;
    const highpass = module.getKernel('highpass')!;
    const transientOut = new Float32Array(2);
    const highpassOut = new Float32Array(2);
    transient(stereoFrame(0.5, 0.5), transientOut, new Float32Array([0.5, 0.1, 2]), 48_000);
    highpass(stereoFrame(0.5, 0.25), highpassOut, new Float32Array([80, 0.707]), 48_000);
    expect(Array.from(transientOut).every(Number.isFinite)).toBe(true);
    expect(Array.from(highpassOut).every(Number.isFinite)).toBe(true);
  });
});
