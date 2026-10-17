import { TestBed } from '@angular/core/testing';
import { AuxAudioContextService } from './aux-audio-context.service';
import { LoggingService } from './logging.service';

describe('AuxAudioContextService', () => {
  const originalAudioContext = (globalThis as any).AudioContext;
  let constructed: any[];
  let created: Array<Record<string, jest.Mock>>;

  const makeContext = () => {
    const sink = { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() };
    const ctx = {
      destination: { name: 'destination' },
      createGain: jest.fn(() => sink),
      close: jest.fn(() => Promise.resolve()),
      sink,
    };
    created.push(ctx);
    return ctx;
  };

  beforeEach(() => {
    constructed = [];
    created = [];
    (globalThis as any).AudioContext = jest.fn((options?: any) => {
      constructed.push(options);
      return makeContext();
    });
    TestBed.configureTestingModule({
      providers: [
        AuxAudioContextService,
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
  });

  afterEach(() => {
    (globalThis as any).AudioContext = originalAudioContext;
    jest.clearAllMocks();
  });

  it('asks for a playback buffer by default', () => {
    const service = TestBed.inject(AuxAudioContextService);

    service.createAuxContext();

    expect(constructed).toEqual([{ latencyHint: 'playback' }]);
  });

  it('passes the requested latency intent through to the host', () => {
    const service = TestBed.inject(AuxAudioContextService);

    service.createAuxContext('interactive');

    expect(constructed).toEqual([{ latencyHint: 'interactive' }]);
  });

  it('shares one analysis context between callers', () => {
    const service = TestBed.inject(AuxAudioContextService);

    const first = service.analysisContext();
    const second = service.analysisContext();

    expect(first).toBe(second);
    expect(constructed).toEqual([{ latencyHint: 'playback' }]);
  });

  it('wires a zero-gain sink so an analyser/worklet is actually pulled', () => {
    const service = TestBed.inject(AuxAudioContextService);
    const ctx = service.createAuxContext('playback') as any;
    const node = { connect: jest.fn() } as unknown as AudioNode;

    const sink = service.attachSilentSink(ctx, node);

    expect(sink).toBe(ctx.sink);
    expect(ctx.sink.gain.value).toBe(0);
    expect(node.connect).toHaveBeenCalledWith(ctx.sink);
    expect(ctx.sink.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('degrades to null instead of throwing when the graph cannot be wired', () => {
    const service = TestBed.inject(AuxAudioContextService);
    const logger = TestBed.inject(LoggingService) as any;
    const ctx = service.createAuxContext() as any;
    ctx.createGain = jest.fn(() => {
      throw new Error('no graph here');
    });

    expect(service.attachSilentSink(ctx, {} as AudioNode)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('releases every sink and the shared context on destroy', () => {
    const service = TestBed.inject(AuxAudioContextService);
    const ctx = service.analysisContext() as any;
    service.attachSilentSink(ctx, { connect: jest.fn() } as unknown as AudioNode);

    service.ngOnDestroy();

    expect(ctx.sink.disconnect).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    // The shared instance is released, so the next caller gets a fresh graph.
    const next = service.analysisContext() as any;
    expect(next).not.toBe(ctx);
  });
});
