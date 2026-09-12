import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AiMusiciansService } from './ai-musicians.service';
import { AiService } from '../services/ai.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';

const DRUM_ID = MusicManagerService.DRUM_TRACK_ID;

/**
 * The AI session musicians are a *transport observer*: they must never claim
 * `engine.onScheduleStep` (MusicManagerService owns that hook and all playback),
 * must only make noise while their toggles are engaged, and must report exactly
 * the notes that sounded.
 */
describe('AiMusiciansService (AI session musicians)', () => {
  let service: AiMusiciansService;
  let aiMock: any;
  let engineMock: any;
  let tracks: any;
  let onStep: jest.Mock;
  let unsubscribe: jest.Mock;

  const melodicTrack = (over: any = {}) => ({
    id: 'track-lead',
    type: 'midi',
    muted: false,
    gain: 0.8,
    synthParams: { wave: 'saw' },
    notes: [{ step: 0, midi: 60, length: 1, velocity: 0.8 }],
    ...over,
  });

  const drumTrack = (over: any = {}) => ({
    id: DRUM_ID,
    type: 'drum',
    muted: false,
    gain: 0.8,
    synthParams: {},
    notes: [],
    ...over,
  });

  const step = (n: number) => service.renderStep(n, 0.5, 0.25);

  beforeEach(() => {
    tracks = signal<any[]>([]);
    unsubscribe = jest.fn();
    onStep = jest.fn(() => unsubscribe);
    aiMock = {
      aiDrummerActive: signal(false),
      aiBassistActive: signal(false),
      aiKeyboardistActive: signal(false),
      isAIDrummerActive() {
        return this.aiDrummerActive();
      },
      isAIBassistActive() {
        return this.aiBassistActive();
      },
      isAIKeyboardistActive() {
        return this.aiKeyboardistActive();
      },
    };
    engineMock = { triggerAttack: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        AiMusiciansService,
        { provide: AiService, useValue: aiMock },
        { provide: MusicManagerService, useValue: { tracks, onStep } },
        { provide: AudioEngineService, useValue: engineMock },
      ],
    });

    service = TestBed.inject(AiMusiciansService);
  });

  describe('transport attachment', () => {
    it('stays off the transport until a player is engaged', () => {
      TestBed.flushEffects();
      expect(onStep).not.toHaveBeenCalled();
      expect(service.isAttached()).toBe(false);
    });

    it('subscribes exactly once no matter how many players join', () => {
      aiMock.aiDrummerActive.set(true);
      TestBed.flushEffects();
      expect(onStep).toHaveBeenCalledTimes(1);
      expect(service.isAttached()).toBe(true);

      aiMock.aiBassistActive.set(true);
      TestBed.flushEffects();
      expect(onStep).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes when the last player disengages', () => {
      aiMock.aiDrummerActive.set(true);
      aiMock.aiBassistActive.set(true);
      TestBed.flushEffects();

      aiMock.aiDrummerActive.set(false);
      TestBed.flushEffects();
      expect(unsubscribe).not.toHaveBeenCalled();

      aiMock.aiBassistActive.set(false);
      TestBed.flushEffects();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(service.isAttached()).toBe(false);
    });

    it('renders the roster back through the subscribed observer', () => {
      aiMock.aiDrummerActive.set(true);
      TestBed.flushEffects();
      tracks.set([drumTrack()]);

      const observer = onStep.mock.calls[0][0];
      observer(0, 0.5, 0.25);

      expect(engineMock.triggerAttack).toHaveBeenCalled();
      expect(service.lastRendered()).toEqual({
        step: 0,
        musicians: ['drummer'],
      });
    });

    it('clears the step read-out once the band disengages', () => {
      aiMock.aiDrummerActive.set(true);
      tracks.set([drumTrack()]);
      step(0);
      expect(service.lastRendered()).not.toBeNull();

      aiMock.aiDrummerActive.set(false);
      TestBed.flushEffects();
      expect(service.lastRendered()).toBeNull();
    });
  });

  describe('drummer', () => {
    beforeEach(() => {
      aiMock.aiDrummerActive.set(true);
    });

    it('plays kick on the downbeat and a lighter snare on the backbeat', () => {
      tracks.set([drumTrack()]);

      expect(step(0)).toEqual(['drummer']);
      const kick = engineMock.triggerAttack.mock.calls[0];
      expect(kick[0]).toBe(DRUM_ID);
      expect(kick[1]).toBeCloseTo(65.41, 1); // midi 36
      expect(kick[3]).toBe(0.95);

      expect(step(4)).toEqual(['drummer']);
      const snare = engineMock.triggerAttack.mock.calls[1];
      expect(snare[1]).toBeCloseTo(73.42, 1); // midi 38
      // Regression: the velocity test used `step % 4 === 0`, which is always
      // true on this path, so every backbeat snare hit as hard as the kick.
      expect(snare[3]).toBeLessThan(kick[3]);
    });

    it('stays on its own subdivision', () => {
      tracks.set([drumTrack()]);
      expect(step(2)).toEqual([]);
      expect(engineMock.triggerAttack).not.toHaveBeenCalled();
    });

    it('goes silent when the kit is muted or missing', () => {
      expect(step(0)).toEqual([]);

      tracks.set([drumTrack({ muted: true })]);
      expect(step(0)).toEqual([]);

      expect(engineMock.triggerAttack).not.toHaveBeenCalled();
      expect(service.lastRendered()).toBeNull();
    });
  });

  describe('bassist', () => {
    beforeEach(() => {
      aiMock.aiBassistActive.set(true);
    });

    it('doubles the anchor root an octave down', () => {
      tracks.set([melodicTrack()]);

      expect(step(0)).toEqual(['bassist']);
      const call = engineMock.triggerAttack.mock.calls[0];
      expect(call[0]).toBe('track-lead');
      expect(call[1]).toBeCloseTo(130.81, 1); // midi 60 root → midi 48
      expect(call[4]).toBeCloseTo(0.5, 5); // duration * 2
    });

    it('keeps a root under the bar between note onsets', () => {
      // Regression: the bassist used to require a note onset on the exact step
      // it played, so it dropped out on every step without a human note.
      tracks.set([
        melodicTrack({
          notes: [{ step: 0, midi: 60, length: 1, velocity: 0.8 }],
        }),
      ]);

      expect(step(2)).toEqual(['bassist']);
      expect(engineMock.triggerAttack).toHaveBeenCalledTimes(1);
    });

    it('anchors to the lowest note sounding at the step', () => {
      tracks.set([
        melodicTrack({
          notes: [
            { step: 0, midi: 72, length: 1, velocity: 0.8 },
            { step: 2, midi: 48, length: 1, velocity: 0.8 },
          ],
        }),
      ]);

      step(2);
      // Lowest sounding note (48) an octave down → midi 36.
      expect(engineMock.triggerAttack.mock.calls[0][1]).toBeCloseTo(65.41, 1);
    });

    it('ignores muted tracks and drum/bus rows', () => {
      tracks.set([melodicTrack({ muted: true }), drumTrack()]);
      expect(step(0)).toEqual([]);

      tracks.set([melodicTrack({ type: 'bus' })]);
      expect(step(0)).toEqual([]);

      expect(engineMock.triggerAttack).not.toHaveBeenCalled();
    });
  });

  describe('keyboardist', () => {
    it('stabs a fifth above on the off-beat, deterministically', () => {
      aiMock.aiKeyboardistActive.set(true);
      tracks.set([melodicTrack()]);

      expect(step(1)).toEqual([]);

      expect(step(2)).toEqual(['keyboardist']);
      const call = engineMock.triggerAttack.mock.calls[0];
      expect(call[0]).toBe('track-lead');
      expect(call[1]).toBeCloseTo(392, 0); // midi 60 root + 7 → G4
      expect(call[3]).toBe(0.35);

      // Same step, same result — no Math.random() flicker.
      engineMock.triggerAttack.mockClear();
      expect(step(2)).toEqual(['keyboardist']);
      expect(engineMock.triggerAttack).toHaveBeenCalledTimes(1);
    });

    it('has nothing to play with an empty arrangement', () => {
      aiMock.aiKeyboardistActive.set(true);
      expect(step(2)).toEqual([]);
      expect(service.lastRendered()).toBeNull();
    });
  });

  describe('full band', () => {
    it('reports only the players that actually sounded', () => {
      aiMock.aiDrummerActive.set(true);
      aiMock.aiBassistActive.set(true);
      aiMock.aiKeyboardistActive.set(true);
      tracks.set([drumTrack(), melodicTrack()]);

      expect(step(0)).toEqual(['drummer', 'bassist']);
      expect(step(2)).toEqual(['bassist', 'keyboardist']);
      expect(service.stepsRendered()).toBe(2);
      expect(service.lastRendered()).toEqual({
        step: 2,
        musicians: ['bassist', 'keyboardist'],
      });
    });

    it('never lets a dead audio context break the transport', () => {
      aiMock.aiDrummerActive.set(true);
      tracks.set([drumTrack()]);
      engineMock.triggerAttack.mockImplementation(() => {
        throw new Error('AudioContext is closed');
      });

      expect(() => step(0)).not.toThrow();
      expect(step(0)).toEqual([]);
      expect(service.lastRendered()).toBeNull();
    });
  });
});

describe('AiMusiciansService without a step hook', () => {
  it('is inert when the manager exposes no onStep', () => {
    const tracks = signal<any[]>([]);
    const aiMock: any = {
      aiDrummerActive: signal(false),
      aiBassistActive: signal(false),
      aiKeyboardistActive: signal(false),
      isAIDrummerActive: () => aiMock.aiDrummerActive(),
      isAIBassistActive: () => aiMock.aiBassistActive(),
      isAIKeyboardistActive: () => aiMock.aiKeyboardistActive(),
    };

    TestBed.configureTestingModule({
      providers: [
        AiMusiciansService,
        { provide: AiService, useValue: aiMock },
        { provide: MusicManagerService, useValue: { tracks } },
        { provide: AudioEngineService, useValue: { triggerAttack: jest.fn() } },
      ],
    });

    const service = TestBed.inject(AiMusiciansService);
    aiMock.aiDrummerActive.set(true);
    TestBed.flushEffects();

    expect(service.isAttached()).toBe(false);
    expect(() => service.renderStep(0, 0, 0.25)).not.toThrow();
  });
});
