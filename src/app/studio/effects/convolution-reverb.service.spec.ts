import { TestBed } from '@angular/core/testing';
import { ConvolutionReverbService } from './convolution-reverb.service';
import { HttpClient } from '@angular/common/http';
import { AudioEngineService } from '../../services/audio-engine.service';
import { of } from 'rxjs';

describe('ConvolutionReverbService', () => {
  let service: ConvolutionReverbService;
  let httpMock: any;
  let ctxMock: any;

  beforeEach(() => {
    const convolverMock = {
      buffer: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const gainMock = {
      gain: {
        value: 0,
        setTargetAtTime: jest.fn(),
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    ctxMock = {
      destination: {},
      currentTime: 200,
      createConvolver: jest.fn().mockReturnValue(convolverMock),
      createGain: jest.fn().mockReturnValue({ ...gainMock }),
      decodeAudioData: jest.fn().mockResolvedValue({ length: 100 }),
    };
    httpMock = {
      get: jest.fn().mockReturnValue(of(new ArrayBuffer(8))),
    };

    TestBed.configureTestingModule({
      providers: [
        ConvolutionReverbService,
        { provide: HttpClient, useValue: httpMock },
        { provide: AudioEngineService, useValue: { ctx: ctxMock } },
      ],
    });
    service = TestBed.inject(ConvolutionReverbService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('loads an impulse response from a URL and decodes it', async () => {
    const buffer = await service.loadImpulseResponse('/ir/hall.wav');
    expect(httpMock.get).toHaveBeenCalledWith('/ir/hall.wav', {
      responseType: 'arraybuffer',
    });
    expect(ctxMock.decodeAudioData).toHaveBeenCalled();
    expect(buffer).toEqual({ length: 100 });
  });

  it('creates a reverb with the given impulse response', () => {
    const ir = { length: 100 } as AudioBuffer;
    const reverb: any = service.createReverb(ir);

    expect(ctxMock.createConvolver).toHaveBeenCalled();
    expect(reverb.convolver.buffer).toBe(ir);
  });

  it('routes node through dry and wet paths on connect', () => {
    const ir = { length: 100 } as AudioBuffer;
    const reverb: any = service.createReverb(ir);
    const node = { connect: jest.fn() } as unknown as AudioNode;

    reverb.connect(node);

    expect(node.connect).toHaveBeenCalledWith(reverb.dryGain);
    expect(node.connect).toHaveBeenCalledWith(reverb.convolver);
    expect(reverb.convolver.connect).toHaveBeenCalledWith(reverb.wetGain);
    expect(reverb.dryGain.connect).toHaveBeenCalledWith(ctxMock.destination);
    expect(reverb.wetGain.connect).toHaveBeenCalledWith(ctxMock.destination);
  });

  it('sets wet and dry mix via setTargetAtTime', () => {
    const ir = { length: 100 } as AudioBuffer;
    const reverb: any = service.createReverb(ir);
    reverb.dryGain.gain.setTargetAtTime.mockClear();
    reverb.wetGain.gain.setTargetAtTime.mockClear();

    reverb.set({ wet: 0.7, dry: 0.3 });

    expect(reverb.wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      0.7,
      ctxMock.currentTime,
      0.01
    );
    expect(reverb.dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      0.3,
      ctxMock.currentTime,
      0.01
    );
  });

  it('disconnects the full chain', () => {
    const ir = { length: 100 } as AudioBuffer;
    const reverb: any = service.createReverb(ir);

    reverb.disconnect();

    expect(reverb.dryGain.disconnect).toHaveBeenCalled();
    expect(reverb.wetGain.disconnect).toHaveBeenCalled();
    expect(reverb.convolver.disconnect).toHaveBeenCalled();
  });
});