import { TestBed } from '@angular/core/testing';
import { NeuralMixerService } from './neural-mixer.service';
import { MusicManagerService } from './music-manager.service';
import { LoggingService } from './logging.service';
import { signal } from '@angular/core';

describe('NeuralMixerService', () => {
  let service: NeuralMixerService;
  let musicManagerMock: any;
  let loggerMock: any;

  beforeEach(() => {
    loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const tracks = signal([
      {
        id: 'track-1',
        gain: 0.8,
        fxSlots: [],
      },
      {
        id: 'track-2',
        gain: 0.9,
        fxSlots: [
          { id: 'fx-existing', type: 'EQ', params: {}, enabled: true },
        ],
      },
    ]);

    musicManagerMock = {
      tracks,
      updateVolume: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        NeuralMixerService,
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: LoggingService, useValue: loggerMock },
      ],
    });
    service = TestBed.inject(NeuralMixerService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('applies gain adjustments to all tracks', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // adjustment = 0
    service.applyNeuralMix();

    expect(musicManagerMock.updateVolume).toHaveBeenCalledTimes(2);
    // With random=0.5, adjustment is 0, gain stays the same
    expect(musicManagerMock.updateVolume).toHaveBeenCalledWith('track-1', 0.8);
    expect(musicManagerMock.updateVolume).toHaveBeenCalledWith('track-2', 0.9);
    jest.restoreAllMocks();
  });

  it('clamps gain to the [0, 1.5] range', () => {
    // Force a positive adjustment > 0.7 to overflow track-2 (0.9 + 0.7 = 1.6)
    jest.spyOn(Math, 'random').mockReturnValue(1); // adjustment = +0.05
    service.applyNeuralMix();

    const args1 = musicManagerMock.updateVolume.mock.calls[0];
    const args2 = musicManagerMock.updateVolume.mock.calls[1];
    expect(args1[0]).toBe('track-1');
    expect(args1[1]).toBeCloseTo(0.85, 5);
    expect(args2[0]).toBe('track-2');
    expect(args2[1]).toBeCloseTo(0.95, 5);
    jest.restoreAllMocks();
  });

  it('adds a compressor FX slot to tracks without FX', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    service.applyNeuralMix();

    const tracks = musicManagerMock.tracks();
    const track1 = tracks.find((t: any) => t.id === 'track-1');
    expect(track1.fxSlots.length).toBe(1);
    expect(track1.fxSlots[0].type).toBe('Compressor');
    expect(track1.fxSlots[0].enabled).toBe(true);

    // Track-2 already had FX — untouched
    const track2 = tracks.find((t: any) => t.id === 'track-2');
    expect(track2.fxSlots.length).toBe(1);
    expect(track2.fxSlots[0].type).toBe('EQ');
    jest.restoreAllMocks();
  });

  it('logs when applying neural mix', () => {
    service.applyNeuralMix();
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Applying Neural Mix across all tracks...'
    );
  });
});