import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SequencerService } from './sequencer.service';
import { InstrumentsService } from '../services/instruments.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';

describe('SequencerService advanced features', () => {
  let service: SequencerService;
  let randomSpy: jest.SpyInstance<number, []>;
  const engineMock = {
    onScheduleStep: undefined as
      | ((stepIndex: number, when: number, stepDur: number) => void)
      | undefined,
    playSynth: jest.fn(),
    tempo: signal(120),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
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

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('supports swing, probability, ratchets and humanize scheduling', () => {
    const pattern = service.activePattern()!;
    const track = pattern.tracks[0];
    pattern.tracks.slice(1).forEach((other) => {
      other.mute = true;
    });
    service.setSwing(0.3);
    service.toggleStep(track.id, 1);
    service.setStepProbability(track.id, 1, 1);
    service.setRatchet(track.id, 1, 3);
    service.setTrackHumanize(track.id, 0.2);

    service.scheduleTick(1, 10, 0.25);

    expect(engineMock.playSynth).toHaveBeenCalledTimes(3);
    expect(engineMock.playSynth).toHaveBeenNthCalledWith(
      1,
      10.025,
      expect.any(Number),
      0.08333333333333333,
      expect.closeTo(0.64, 5),
      0,
      0.6,
      0.1,
      0.05,
      {}
    );
    expect(engineMock.playSynth).toHaveBeenNthCalledWith(
      3,
      10.191666666666666,
      expect.any(Number),
      0.08333333333333333,
      expect.closeTo(0.64, 5),
      0,
      0.6,
      0.1,
      0.05,
      {}
    );
  });

  it('supports polymeter and velocity curves', () => {
    const pattern = service.activePattern()!;
    const track = pattern.tracks[0];
    pattern.tracks.slice(1).forEach((other) => {
      other.mute = true;
    });
    service.setTrackLength(track.id, 8);
    service.setVelocityCurve(track.id, 'accented');
    service.setStepProbability(track.id, 0, 1);

    service.scheduleTick(8, 0, 0.2);
    expect(engineMock.playSynth).toHaveBeenCalledTimes(1);
    expect(engineMock.playSynth).toHaveBeenCalledWith(
      0,
      expect.any(Number),
      0.2,
      expect.closeTo(0.768, 5),
      0,
      0.6,
      0.1,
      0.05,
      {}
    );
  });

  it('skips notes when step probability rejects playback', () => {
    const track = service.activePattern()!.tracks[0];
    service
      .activePattern()!
      .tracks.slice(1)
      .forEach((other) => {
        other.mute = true;
      });
    randomSpy.mockReturnValue(0.75);
    service.setStepProbability(track.id, 0, 0.5);

    service.scheduleTick(0, 2, 0.25);

    expect(engineMock.playSynth).not.toHaveBeenCalled();
  });

  it('creates and applies variations/scenes', () => {
    const variation = service.createVariation('Alt A');
    expect(variation).toBeTruthy();
    service.randomizeVariation(variation!.id, 0.2);
    service.applyVariation(variation!.id);
    const scene = service.createScene(
      'Drop',
      service.activePattern()!.id,
      variation!.id
    );
    service.triggerScene(scene.id);
    expect(service.scenes().length).toBeGreaterThan(0);
  });
});
