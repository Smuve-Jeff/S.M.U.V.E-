import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { AudioEngineService } from './audio-engine.service';
import { ProjectService } from './project.service';
import { HistoryService } from './history.service';
import { PluginStoreService } from './plugin-store.service';
import { InstrumentsService } from './instruments.service';
import { StemSeparationService } from './stem-separation.service';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { LoggingService } from './logging.service';
import { TakeManagerService } from './take-manager.service';
import { StudioDeviceProfileService } from './studio-device-profile.service';
import { NotificationService } from './notification.service';

/**
 * A deliberately small device profile keeps the budget assertions independent
 * of whatever hardware happens to run the suite.
 */
describe('MusicManagerService device budgets', () => {
  let service: MusicManagerService;
  let history: HistoryService;
  const notify = { show: jest.fn() };

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
    triggerAttack: jest.fn(),
    setBaseFaderGain: jest.fn(),
    updateTrack: jest.fn(),
    installTrackPluginInsert: jest.fn(),
    onScheduleStep: undefined as any,
  };

  const makeTrack = (overrides: any = {}) => ({
    id: 'track-1',
    name: 'Lead',
    type: 'midi',
    instrumentId: 'grand-piano',
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    notes: [],
    steps: new Array(64).fill(false),
    fxSlots: [],
    sendA: 0,
    sendB: 0,
    effects: [],
    patternSlots: [],
    activePatternSlotId: null,
    pluginIds: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
        {
          provide: StudioDeviceProfileService,
          useValue: {
            budget: () => ({
              maxVoices: 8,
              maxActiveEffects: 1,
              maxTracks: 2,
            }),
          },
        },
        { provide: NotificationService, useValue: notify },
        { provide: AudioEngineService, useValue: engineMock },
        { provide: ProjectService, useValue: { currentProject: signal(null) } },
        { provide: PluginStoreService, useValue: { preload: jest.fn() } },
        { provide: InstrumentsService, useValue: { getPresets: () => [] } },
        { provide: StemSeparationService, useValue: {} },
        { provide: StudioRecordingEngineService, useValue: {} },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: TakeManagerService,
          useValue: { getCompNotesForStepNow: () => [] },
        },
      ],
    });
    service = TestBed.inject(MusicManagerService);
    history = TestBed.inject(HistoryService);
    service.tracks.set([
      makeTrack({ id: 'track-1', name: 'Lead' }),
      makeTrack({ id: 'track-2', name: 'Pad' }),
    ]);
  });

  it('reports the device ceilings and refuses a third track', () => {
    expect(service.trackLimit()).toBe(2);
    expect(service.atTrackLimit()).toBe(true);

    expect(service.addTrack('Bass', 'grand-piano')).toBeNull();
    expect(service.duplicateTrack('track-1')).toBeNull();
    expect(service.tracks()).toHaveLength(2);
    expect(service.tracks().map((track) => track.name)).toEqual(['Lead', 'Pad']);
    expect(notify.show).toHaveBeenCalledWith(
      'Track limit reached (2). Remove a track before adding another.',
      'warning',
    );
  });

  it('allows a track again after space is freed', () => {
    service.tracks.set([makeTrack({ id: 'track-1', name: 'Lead' })]);

    expect(service.canAddTrack()).toBe(true);
    expect(service.addTrack('Bass', 'grand-piano')).toEqual(expect.any(String));
    expect(service.tracks()).toHaveLength(2);
  });

  it('caps active effects, preserves bypassed slots, and releases budget on bypass', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx-active', type: 'Reverb', params: {}, enabled: true },
          { id: 'fx-bypassed', type: 'Delay', params: {}, enabled: false },
        ],
      }),
    ]);

    expect(service.effectLimit()).toBe(1);
    expect(service.activeEffectCount('track-1')).toBe(1);
    expect(service.canAddEffect('track-1')).toBe(false);

    expect(service.addFxSlot('track-1', 'EQ')).toBeNull();
    expect(service.tracks()[0].fxSlots).toHaveLength(2);
    expect(service.tracks()[0].fxSlots?.[1]).toMatchObject({
      id: 'fx-bypassed',
      enabled: false,
    });

    // Re-enabling a bypassed insert would exceed the cap.
    service.toggleFxSlot('track-1', 'fx-bypassed');
    expect(service.tracks()[0].fxSlots?.[1].enabled).toBe(false);

    // Bypassing the only active insert frees the slot for a new effect.
    service.toggleFxSlot('track-1', 'fx-active');
    expect(service.tracks()[0].fxSlots?.[0].enabled).toBe(false);
    expect(service.canAddEffect('track-1')).toBe(true);
    expect(service.addFxSlot('track-1', 'EQ')).toEqual(expect.any(String));
    expect(service.tracks()[0].fxSlots).toHaveLength(3);
  });

  it('does not count a bypassed live insert and refuses to re-enable it over budget', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx-active', type: 'Reverb', params: {}, enabled: true },
        ],
        pluginIds: ['smuve.saturation.v2'],
        bypassedPluginIds: ['smuve.saturation.v2'],
      }),
    ]);

    expect(service.activeEffectCount('track-1')).toBe(1);
    expect(service.canAddEffect('track-1')).toBe(false);

    service.toggleTrackPluginBypass('track-1', 'smuve.saturation.v2');

    expect(service.tracks()[0].bypassedPluginIds).toEqual([
      'smuve.saturation.v2',
    ]);
    expect(notify.show).toHaveBeenCalledWith(
      'Effect limit reached (1). Bypass an insert first.',
      'warning',
    );
  });

  it('refuses an over-budget live plugin insert without changing the chain', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx-active', type: 'Reverb', params: {}, enabled: true },
        ],
        pluginIds: [],
      }),
    ]);

    service.setTrackPlugins('track-1', ['smuve.chorus.v1']);

    expect(service.tracks()[0].pluginIds).toEqual([]);
    expect(engineMock.installTrackPluginInsert).not.toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      'Effect limit reached (1). Bypass an insert first.',
      'warning',
    );
  });

  it('loads an over-budget restored project without deleting its inserts', () => {
    service.tracks.set([
      makeTrack({ id: 'restored-1', name: 'Restored A', fxSlots: [
        { id: 'a1', type: 'Reverb', params: {}, enabled: true },
        { id: 'a2', type: 'Delay', params: {}, enabled: true },
      ] }),
      makeTrack({ id: 'restored-2', name: 'Restored B' }),
      makeTrack({ id: 'restored-3', name: 'Restored C' }),
    ]);

    expect(service.tracks()).toHaveLength(3);
    expect(service.trackLimit()).toBe(2);
    expect(service.effectLimit()).toBe(1);
    expect(service.activeEffectCount('restored-1')).toBe(2);
    expect(service.canAddEffect('restored-1')).toBe(false);
    expect(service.tracks()[0].fxSlots).toHaveLength(2);
    expect(service.addFxSlot('restored-1', 'EQ')).toBeNull();
  });

  it('recalls an insert preset as one undoable parameter edit', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          {
            id: 'fx1',
            type: 'Reverb',
            params: { wet: 20, decay: 2.5 },
            enabled: true,
          },
        ],
      }),
    ]);

    service.applyFxSlotPreset('track-1', 'fx1', {
      wet: 80,
      decay: 4,
      bogus: Number.NaN,
      label: 'ignored' as any,
    });

    expect(service.tracks()[0].fxSlots?.[0].params).toEqual({
      wet: 80,
      decay: 4,
    });

    history.undo();
    expect(service.tracks()[0].fxSlots?.[0].params).toEqual({
      wet: 20,
      decay: 2.5,
    });
  });

  it('does not create history for an empty or unknown preset recall', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx1', type: 'Reverb', params: { wet: 20 }, enabled: true },
        ],
      }),
    ]);
    const before = history.undoCount();

    service.applyFxSlotPreset('track-1', 'fx1', {});
    service.applyFxSlotPreset('track-1', 'missing', { wet: 50 });
    service.applyFxSlotPreset('missing', 'fx1', { wet: 50 });

    expect(history.undoCount()).toBe(before);
    expect(service.tracks()[0].fxSlots?.[0].params).toEqual({ wet: 20 });
  });
});
