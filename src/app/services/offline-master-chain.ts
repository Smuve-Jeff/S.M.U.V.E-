import type { AudioEngineService } from './audio-engine.service';

/**
 * Splice the live master bus into an offline render.
 *
 * The bounce used to stop at the master fader, so the five-band compression
 * and safety ceiling heard in the suite were missing from every exported
 * file. This rebuilds the same fallback topology from the engine's current
 * state using native nodes: tone shelves, per-band LR4 compression (or the
 * single bus compressor before the suite publishes bands), saturation,
 * limiter, master filter and high shelf.
 *
 * The worklet and this graph are equivalent stages, not bit-identical DSP;
 * both read the same band, tone, makeup and true-peak state.
 */
export function connectOfflineMasterChain(
  offline: OfflineAudioContext,
  input: AudioNode,
  engine: AudioEngineService,
): void {
  const ctx = offline as unknown as BaseAudioContext;
  if (
    typeof (ctx as any).createDynamicsCompressor !== 'function' ||
    typeof (ctx as any).createBiquadFilter !== 'function' ||
    typeof (ctx as any).createWaveShaper !== 'function'
  ) {
    // Older/partial test hosts still get a usable bounce rather than silence.
    input.connect(offline.destination);
    return;
  }

  const finite = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const clamp = (
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ): number => Math.max(min, Math.min(max, finite(value, fallback)));
  const copyCurve = (node: any): Float32Array<ArrayBuffer> | null => {
    const curve = node?.curve;
    return curve ? new Float32Array(curve as ArrayLike<number>) : null;
  };

  let tail: AudioNode = input;
  const chain = (node: AudioNode): void => {
    tail.connect(node);
    tail = node;
  };

  const makeupDb = clamp(
    typeof engine.getMasterMakeupDb === 'function'
      ? engine.getMasterMakeupDb()
      : 0,
    -12,
    12,
    0,
  );
  if (Math.abs(makeupDb) > 0.001) {
    const makeup = ctx.createGain();
    makeup.gain.value = Math.pow(10, makeupDb / 20);
    chain(makeup);
  }

  const tone: {
    lowShelfDb?: number;
    lowMidDb?: number;
    highShelfDb?: number;
  } =
    typeof engine.getMasterToneEq === 'function'
      ? engine.getMasterToneEq()
      : {};
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 60;
  lowShelf.gain.value = clamp(tone.lowShelfDb, -18, 18, 0);
  chain(lowShelf);

  const lowMid = ctx.createBiquadFilter();
  lowMid.type = 'peaking';
  lowMid.frequency.value = 300;
  lowMid.Q.value = 0.7;
  lowMid.gain.value = clamp(tone.lowMidDb, -18, 18, 0);
  chain(lowMid);

  const bands: Array<{ id: number; threshold: number; ratio: number }> =
    typeof engine.getMasteringBands === 'function'
      ? engine.getMasteringBands()
      : [];
  if (Array.isArray(bands) && bands.length > 0) {
    // Same LR4 split as the live fallback: each crossover is two cascaded
    // 12 dB/octave filters, so adjacent bands sum without a broad hole.
    const split: Array<Array<['lowpass' | 'highpass', number]>> = [
      [['lowpass', 120], ['lowpass', 120]],
      [['highpass', 120], ['highpass', 120], ['lowpass', 500], ['lowpass', 500]],
      [
        ['highpass', 120], ['highpass', 120], ['highpass', 500],
        ['highpass', 500], ['lowpass', 2500], ['lowpass', 2500],
      ],
      [
        ['highpass', 120], ['highpass', 120], ['highpass', 500],
        ['highpass', 500], ['highpass', 2500], ['highpass', 2500],
        ['lowpass', 10000], ['lowpass', 10000],
      ],
      [
        ['highpass', 120], ['highpass', 120], ['highpass', 500],
        ['highpass', 500], ['highpass', 2500], ['highpass', 2500],
        ['highpass', 10000], ['highpass', 10000],
      ],
    ];
    const sum = ctx.createGain();
    const splitInput = tail;
    split.forEach((stages, index) => {
      const band = bands.find((candidate) => candidate.id === index + 1) ?? bands[index];
      let bandTail: AudioNode = splitInput;
      for (const [type, frequency] of stages) {
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = 0.7071;
        bandTail.connect(filter);
        bandTail = filter;
      }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = clamp(band?.threshold, -60, 0, -18);
      comp.ratio.value = clamp(band?.ratio, 1, 20, 4);
      comp.attack.value = 0.01;
      comp.release.value = 0.14;
      bandTail.connect(comp);
      comp.connect(sum);
    });
    tail = sum;
  } else {
    const settings: { threshold?: number; ratio?: number } =
      typeof engine.getCompressorSettings === 'function'
        ? engine.getCompressorSettings()
        : {};
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = clamp(settings.threshold, -60, 0, -18);
    comp.ratio.value = clamp(settings.ratio, 1, 20, 4);
    comp.attack.value = 0.01;
    comp.release.value = 0.1;
    chain(comp);
  }

  const saturation = ctx.createWaveShaper();
  const saturationCurve = copyCurve(engine.saturationNode);
  if (saturationCurve) {
    saturation.curve = saturationCurve;
    saturation.oversample = engine.saturationNode?.oversample ?? 'none';
    chain(saturation);
  }

  const quantum = ctx.createWaveShaper();
  const quantumCurve = copyCurve(engine.quantumSaturation);
  if (quantumCurve) {
    quantum.curve = quantumCurve;
    quantum.oversample = engine.quantumSaturation?.oversample ?? 'none';
    chain(quantum);
  }

  const exciterGain = finite(engine.spectralExciter?.gain?.value, 0);
  if (Math.abs(exciterGain) > 0.001) {
    const exciter = ctx.createBiquadFilter();
    exciter.type = engine.spectralExciter?.type ?? 'highshelf';
    exciter.frequency.value = finite(engine.spectralExciter?.frequency?.value, 8000);
    exciter.gain.value = exciterGain;
    chain(exciter);
  }

  const enhancerGain = finite(engine.subAtomicEnhancer?.gain?.value, 1);
  if (Math.abs(enhancerGain - 1) > 0.001) {
    const enhancer = ctx.createGain();
    enhancer.gain.value = enhancerGain;
    chain(enhancer);
  }

  const targets: { lufs?: number; truePeak?: number } =
    typeof engine.getMasteringTargets === 'function'
      ? engine.getMasteringTargets()
      : {};
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = clamp(targets.truePeak, -6, -0.01, -0.1);
  limiter.ratio.value = clamp(engine.limiter?.ratio?.value, 1, 20, 20);
  limiter.attack.value = clamp(engine.limiter?.attack?.value, 0.0001, 1, 0.001);
  limiter.release.value = clamp(engine.limiter?.release?.value, 0.01, 3, 0.05);
  limiter.knee.value = clamp(engine.limiter?.knee?.value, 0, 40, 0);
  chain(limiter);

  const masterFilterHz = finite(engine.masterEQ?.frequency?.value, 20000);
  if (masterFilterHz < 19999) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = masterFilterHz;
    chain(filter);
  }

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = finite(engine.masterShelf?.frequency?.value, 5000);
  highShelf.gain.value = clamp(tone.highShelfDb, -18, 18, 0);
  chain(highShelf);

  tail.connect(offline.destination);
}

