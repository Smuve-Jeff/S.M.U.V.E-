import { TestBed } from '@angular/core/testing';
import { CompressorService } from './compressor.service';
import { AudioEngineService } from '../../services/audio-engine.service';

// jsdom lacks AudioParam — mock the class so `instanceof` checks in the
// compressor work.
class AudioParam {
  value = 0;
  setTargetAtTime = jest.fn();
}
(globalThis as any).AudioParam = AudioParam;

describe('CompressorService', () => {
  let service: CompressorService;
  let ctxMock: any;

  beforeEach(() => {
    const compressorMock = {
      attack: new AudioParam(),
      release: new AudioParam(),
      threshold: new AudioParam(),
      ratio: new AudioParam(),
      knee: new AudioParam(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    compressorMock.threshold.value = -24;
    compressorMock.ratio.value = 4;
    compressorMock.knee.value = 30;
    ctxMock = {
      destination: {},
      currentTime: 100,
      createDynamicsCompressor: jest.fn().mockReturnValue(compressorMock),
    };

    TestBed.configureTestingModule({
      providers: [
        CompressorService,
        { provide: AudioEngineService, useValue: { ctx: ctxMock } },
      ],
    });
    service = TestBed.inject(CompressorService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('creates a VCA compressor by default with fast attack and medium release', () => {
    const comp: any = service.createCompressor();
    expect(ctxMock.createDynamicsCompressor).toHaveBeenCalled();
    expect(comp.compressor.attack.value).toBe(0.01);
    expect(comp.compressor.release.value).toBe(0.1);
  });

  it('creates a FET compressor with fastest attack and long release', () => {
    const comp: any = service.createCompressor('fet');
    expect(comp.compressor.attack.value).toBe(0.001);
    expect(comp.compressor.release.value).toBe(0.2);
  });

  it('creates an optical compressor with slowest attack and shortest release', () => {
    const comp: any = service.createCompressor('optical');
    expect(comp.compressor.attack.value).toBe(0.02);
    expect(comp.compressor.release.value).toBe(0.05);
  });

  it('connects a node through the compressor and into the destination', () => {
    const comp: any = service.createCompressor();
    const node = { connect: jest.fn() } as unknown as AudioNode;
    comp.connect(node);
    expect(node.connect).toHaveBeenCalledWith(comp.compressor);
    expect(comp.compressor.connect).toHaveBeenCalledWith(ctxMock.destination);
  });

  it('disconnects the compressor from the graph', () => {
    const comp: any = service.createCompressor();
    comp.disconnect();
    expect(comp.compressor.disconnect).toHaveBeenCalled();
  });

  it('sets AudioParam targets via setTargetAtTime', () => {
    const comp: any = service.createCompressor();

    comp.set({ threshold: -30 });
    expect(comp.compressor.threshold.setTargetAtTime).toHaveBeenCalledWith(
      -30,
      ctxMock.currentTime,
      0.01
    );
  });
});