import { signal } from '@angular/core';
import {
  CompositionAuditionService,
  planAuditionChunks,
  writeAuditionChunk,
  type AuditionChunkBuffer,
  type AuditionScore,
} from './composition-audition.service';

function fakeChunk(channels: number[][]): AuditionChunkBuffer {
  return {
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    getChannelData: (channel) => Float32Array.from(channels[channel]),
  };
}

function fakeOutput(frames: number, channels = 2) {
  const data = Array.from(
    { length: channels },
    () => new Float32Array(frames),
  );
  return {
    length: frames,
    numberOfChannels: channels,
    data,
    getChannelData: (channel: number) => data[channel],
  };
}

describe('planAuditionChunks', () => {
  it('splits a long score into two-minute slices with overlap tails', () => {
    expect(planAuditionChunks(300, 120, 1)).toEqual([
      { startSeconds: 0, mainSeconds: 120, renderSeconds: 121 },
      { startSeconds: 120, mainSeconds: 120, renderSeconds: 121 },
      { startSeconds: 240, mainSeconds: 60, renderSeconds: 60 },
    ]);
  });

  it('renders a score that fits in one slice without an unused tail', () => {
    expect(planAuditionChunks(120, 120, 1)).toEqual([
      { startSeconds: 0, mainSeconds: 120, renderSeconds: 120 },
    ]);
  });

  it('crossfades an exact two-minute boundary without adding extra audio', () => {
    expect(planAuditionChunks(240, 120, 1)).toEqual([
      { startSeconds: 0, mainSeconds: 120, renderSeconds: 121 },
      { startSeconds: 120, mainSeconds: 120, renderSeconds: 120 },
    ]);
  });
});

class FakeAudioBuffer {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  private channels: Float32Array[];

  constructor(options: {
    length: number;
    numberOfChannels?: number;
    sampleRate?: number;
  }) {
    this.length = options.length;
    this.numberOfChannels = options.numberOfChannels ?? 1;
    this.sampleRate = options.sampleRate ?? 44100;
    this.duration = this.length / this.sampleRate;
    this.channels = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length),
    );
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class FakeOfflineAudioContext {
  static instances: FakeOfflineAudioContext[] = [];
  destination = {};

  constructor(
    public channels: number,
    public frames: number,
    public sampleRate: number,
  ) {
    FakeOfflineAudioContext.instances.push(this);
  }

  private param(value = 0) {
    return {
      value,
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    };
  }

  createGain() {
    return { gain: this.param(1), connect: jest.fn(), disconnect: jest.fn() };
  }

  createDynamicsCompressor() {
    return {
      threshold: this.param(),
      knee: this.param(),
      ratio: this.param(),
      attack: this.param(),
      release: this.param(),
      connect: jest.fn(),
    };
  }

  createBiquadFilter() {
    return {
      type: '',
      frequency: this.param(),
      Q: this.param(),
      connect: jest.fn(),
    };
  }

  createOscillator() {
    return {
      type: '',
      frequency: this.param(),
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
  }

  createBufferSource() {
    return {
      buffer: null as unknown,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeAudioBuffer({ length, numberOfChannels: channels, sampleRate });
  }

  startRendering() {
    return Promise.resolve(
      new FakeAudioBuffer({
        length: this.frames,
        numberOfChannels: 2,
        sampleRate: this.sampleRate,
      }),
    );
  }
}

describe('CompositionAuditionService chunked rendering', () => {
  it('renders past two minutes in crossfaded slices and keeps the full buffer', async () => {
    const originalAudioBuffer = (globalThis as any).AudioBuffer;
    const originalOffline = (globalThis as any).OfflineAudioContext;
    (globalThis as any).AudioBuffer = FakeAudioBuffer;
    (globalThis as any).OfflineAudioContext = FakeOfflineAudioContext;
    FakeOfflineAudioContext.instances = [];

    try {
      const service = Object.create(
        CompositionAuditionService.prototype,
      ) as CompositionAuditionService;
      Object.assign(service as any, {
        engine: {
          auditionPlaying: signal(false),
          auditionProgress: signal(0),
          playAudition: jest.fn(),
          stopAudition: jest.fn(),
        },
        notify: { show: jest.fn() },
        rendering: signal(false),
        error: signal<string | null>(null),
        readyCompositionId: signal<string | null>(null),
        previewSeconds: signal(0),
        previewBars: signal(0),
        renderProgress: signal(0),
        buffer: null,
        noise: null,
        renderToken: 0,
      });

      const score: AuditionScore = {
        id: 'long-score',
        bpm: 120,
        durationSeconds: 130,
        totalBars: 65,
        parts: [
          {
            id: 'pad',
            role: 'pad',
            name: 'Pad',
            instrument: 'synth',
            instrumentId: 'synth',
            range: '',
            mixNote: '',
            notes: [
              {
                bar: 0,
                step: 0,
                midi: 60,
                length: 1100,
                velocity: 1,
              },
            ],
            hits: [{ bar: 0, step: 0, lane: 'kick', velocity: 1 }],
          },
        ],
      };

      await service.renderScore(score);

      expect(FakeOfflineAudioContext.instances.map((ctx) => ctx.frames)).toEqual([
        Math.ceil(121 * 44100),
        Math.ceil(10 * 44100),
      ]);
      expect(service.previewSeconds()).toBe(130);
      expect(service.previewBars()).toBe(65);
      expect(service.readyCompositionId()).toBe('long-score');
      expect(service.renderProgress()).toBe(1);
      expect((service as any).buffer.length).toBe(Math.ceil(130 * 44100));
      expect(service.error()).toBeNull();
    } finally {
      (globalThis as any).AudioBuffer = originalAudioBuffer;
      (globalThis as any).OfflineAudioContext = originalOffline;
    }
  });
});

describe('cancelRender', () => {
  it('abandons an in-flight render and resets its progress', () => {
    const service = Object.create(
      CompositionAuditionService.prototype,
    ) as CompositionAuditionService;
    Object.assign(service as any, {
      rendering: signal(true),
      renderProgress: signal(0.4),
      readyCompositionId: signal<string | null>('old-score'),
      error: signal<string | null>('old error'),
      buffer: { length: 10 },
      renderToken: 3,
    });

    service.cancelRender();

    expect(service.rendering()).toBe(false);
    expect(service.renderProgress()).toBe(0);
    expect(service.readyCompositionId()).toBeNull();
    expect(service.error()).toBeNull();
    expect((service as any).buffer).toBeNull();
    expect((service as any).renderToken).toBe(4);
  });
});

describe('writeAuditionChunk', () => {
  it('copies the first slice and keeps its tail out of the output', () => {
    const output = fakeOutput(8);
    const first = fakeChunk([
      [1, 2, 3, 4, 5],
      [11, 12, 13, 14, 15],
    ]);

    const writeFrame = writeAuditionChunk(output, null, 0, first, 4, 1, 0);

    expect(writeFrame).toBe(4);
    expect([...output.data[0]]).toEqual([1, 2, 3, 4, 0, 0, 0, 0]);
    expect([...output.data[1]]).toEqual([11, 12, 13, 14, 0, 0, 0, 0]);
  });

  it('crossfades the previous tail into the next slice before copying the rest', () => {
    const output = fakeOutput(8);
    const first = fakeChunk([
      [1, 2, 3, 4, 5],
      [11, 12, 13, 14, 15],
    ]);
    const second = fakeChunk([
      [10, 11, 12, 13],
      [20, 21, 22, 23],
    ]);

    writeAuditionChunk(output, null, 0, first, 4, 1, 0);
    const writeFrame = writeAuditionChunk(output, first, 4, second, 4, 1, 4);

    expect(writeFrame).toBe(8);
    expect(output.data[0][4]).toBeCloseTo(7.5, 6);
    expect([...output.data[0].slice(5)]).toEqual([11, 12, 13]);
    expect(output.data[1][4]).toBeCloseTo(17.5, 6);
    expect([...output.data[1].slice(5)]).toEqual([21, 22, 23]);
  });
});
