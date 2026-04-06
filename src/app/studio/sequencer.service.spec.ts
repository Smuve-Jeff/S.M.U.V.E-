import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SequencerService } from './sequencer.service';
import { InstrumentsService } from '../services/instruments.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';

describe('SequencerService advanced features', () => {
  let service: SequencerService;
  const engineMock = {
    onScheduleStep: undefined as
      | ((stepIndex: number, when: number, stepDur: number) => void)
      | undefined,
    playSynth: jest.fn(),
    tempo: signal(120),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        SequencerService,
        {
          provide: InstrumentsService,
          useValue: {
            getPresets: () => [{ id: 'kit-808', type: 'synth', synth: {} }],
          },
        },
        { provide: AudioEngineService, useValue: engineMock },
        { provide: LoggingService, useValue: { info: jest.fn() } },
      ],
    });
    service = TestBed.inject(SequencerService);
  });

  it('supports swing, probability, ratchets and humanize scheduling', () => {
    const pattern = service.activePattern()!;
    const track = pattern.tracks[0];
    service.setSwing(0.3);
    service.setStepProbability(track.id, 0, 1);
    service.setRatchet(track.id, 0, 3);
    service.setTrackHumanize(track.id, 0.2);

    service.scheduleTick(0, 0, 0.25);
    expect(engineMock.playSynth).toHaveBeenCalled();
    expect(engineMock.playSynth.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('supports polymeter and velocity curves', () => {
    const pattern = service.activePattern()!;
    const track = pattern.tracks[0];
    service.setTrackLength(track.id, 8);
    service.setVelocityCurve(track.id, 'accented');
    service.setStepProbability(track.id, 0, 1);

    service.scheduleTick(8, 0, 0.2);
    expect(engineMock.playSynth).toHaveBeenCalled();
  });

  it('creates and applies variations/scenes', () => {
    const variation = service.createVariation('Alt A');
    expect(variation).toBeTruthy();
    service.randomizeVariation(variation!.id, 0.2);
    service.applyVariation(variation!.id);
    const scene = service.createScene('Drop', service.activePattern()!.id, variation!.id);
    service.triggerScene(scene.id);
    expect(service.scenes().length).toBeGreaterThan(0);
  });
});
