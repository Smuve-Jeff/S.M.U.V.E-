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

describe('MusicManagerService clip glue workflows', () => {
  let service: MusicManagerService;
  let history: HistoryService;

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
    triggerAttack: jest.fn(),
    onScheduleStep: undefined as any,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
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
      {
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
      } as any,
    ]);
  });

  it('glues touching clips into one merged clip span', () => {
    service.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === 'track-1'
          ? {
              ...track,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Lead Part A',
                  start: 0,
                  length: 4,
                  type: 'midi',
                },
                {
                  id: 'clip-2',
                  name: 'Lead Part B',
                  start: 4,
                  length: 2,
                  type: 'midi',
                },
              ],
            }
          : track
      )
    );

    const mergedId = service.glueClips('track-1', ['clip-1', 'clip-2']);
    const clips = service.tracks()[0].clips;

    expect(mergedId).toBeTruthy();
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      id: mergedId,
      start: 0,
      length: 6,
      type: 'midi',
      name: 'Lead Consolidated',
    });
  });

  it('rejects glue when clips have a gap between them', () => {
    service.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === 'track-1'
          ? {
              ...track,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Lead A',
                  start: 0,
                  length: 2,
                  type: 'midi',
                },
                {
                  id: 'clip-2',
                  name: 'Lead B',
                  start: 3,
                  length: 2,
                  type: 'midi',
                },
              ],
            }
          : track
      )
    );

    const result = service.glueClips('track-1', ['clip-1', 'clip-2']);

    expect(result).toBeNull();
    expect(service.tracks()[0].clips).toHaveLength(2);
  });

  it('supports undo and redo for glued clips', () => {
    service.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === 'track-1'
          ? {
              ...track,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Lead',
                  start: 0,
                  length: 4,
                  type: 'midi',
                },
                {
                  id: 'clip-2',
                  name: 'Lead',
                  start: 4,
                  length: 4,
                  type: 'midi',
                },
              ],
            }
          : track
      )
    );

    const mergedId = service.glueClips('track-1', ['clip-1', 'clip-2']);
    expect(service.tracks()[0].clips).toHaveLength(1);

    history.undo();
    expect(service.tracks()[0].clips.map((clip) => clip.id)).toEqual([
      'clip-1',
      'clip-2',
    ]);

    history.redo();
    expect(service.tracks()[0].clips.map((clip) => clip.id)).toEqual([
      mergedId,
    ]);
  });
});

describe('MusicManagerService pattern slots (channel rack / performance grid)', () => {
  let service: MusicManagerService;
  let history: HistoryService;

  const engineMock = {
    tempo: signal(120),
    visualStep: signal(0),
    setSongLengthSteps: jest.fn(),
    triggerAttack: jest.fn(),
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
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
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
    service.tracks.set([makeTrack()]);
  });

  it('captures the current pattern into a fixed scene slot and activates it', () => {
    service.tracks.set([
      makeTrack({
        notes: [{ id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 }],
        steps: (() => {
          const s = new Array(64).fill(false);
          s[0] = true;
          return s;
        })(),
      }),
    ]);

    service.capturePatternSlot('track-1', 'slot-3', 'Scene 4');

    const track = service.tracks()[0];
    const slot = track.patternSlots?.find((s) => s.id === 'slot-3');
    expect(slot?.name).toBe('Scene 4');
    expect(slot?.versions[slot.versions.length - 1].notes).toEqual([
      { id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 },
    ]);
    expect(slot?.versions[slot.versions.length - 1].steps[0]).toBe(true);
    expect(track.activePatternSlotId).toBe('slot-3');
  });

  it('launches a captured scene by restoring its notes and steps', () => {
    service.tracks.set([
      makeTrack({
        notes: [{ id: 'n1', midi: 64, step: 4, length: 1, velocity: 0.8 }],
      }),
    ]);
    service.capturePatternSlot('track-1', 'slot-1', 'Scene 2');

    // Move on to different content.
    service.tracks.update((ts) =>
      ts.map((t) => ({
        ...t,
        notes: [{ id: 'n2', midi: 72, step: 8, length: 1, velocity: 0.8 }],
        activePatternSlotId: 'slot-0',
      }))
    );

    service.recallPatternSlot('track-1', 'slot-1');
    expect(service.tracks()[0].notes).toEqual([
      { id: 'n1', midi: 64, step: 4, length: 1, velocity: 0.8 },
    ]);
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-1');
  });

  it('does nothing when recalling a scene that was never captured', () => {
    service.tracks.set([makeTrack({ activePatternSlotId: 'slot-0' })]);
    service.recallPatternSlot('track-1', 'slot-5');
    expect(service.tracks()[0].notes).toEqual([]);
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-0');
  });

  it('undoes a scene capture, restoring the pre-capture pattern', () => {
    service.tracks.set([
      makeTrack({
        notes: [{ id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 }],
      }),
    ]);
    service.capturePatternSlot('track-1', 'slot-2', 'Scene 3');

    history.undo();
    expect(service.tracks()[0].patternSlots?.length ?? 0).toBe(0);
    expect(service.tracks()[0].activePatternSlotId).toBeNull();
  });

  it('switching the active scene slot undoes back to the previous slot', () => {
    service.tracks.set([
      makeTrack({
        patternSlots: [
          {
            id: 'slot-0',
            name: 'Pattern 1',
            activeVersionId: 'v1',
            versions: [
              {
                id: 'v1',
                name: 'v1',
                steps: new Array(64).fill(false),
                notes: [],
              },
            ],
          },
        ],
        activePatternSlotId: 'slot-0',
      }),
    ]);

    service.setActivePatternSlot('track-1', 'slot-7');
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-7');
    history.undo();
    expect(service.tracks()[0].activePatternSlotId).toBe('slot-0');
  });

  describe('macro FX slots', () => {
    const withSlots = () =>
      service.tracks.set([
        makeTrack({
          fxSlots: [
            { id: 'fx1', type: 'Reverb', params: {}, enabled: true },
          ],
        }),
      ]);

    it('appends a slot and returns its id', () => {
      withSlots();
      const id = service.addFxSlot('track-1', 'Delay');
      expect(id).toBeTruthy();
      const slots = service.tracks()[0].fxSlots;
      expect(slots).toHaveLength(2);
      expect(slots[1].type).toBe('Delay');
      expect(slots[1].enabled).toBe(true);
      expect(slots[1].params).toEqual({});
    });

    it('undoes an added slot and returns null for an unknown track', () => {
      withSlots();
      service.addFxSlot('track-1', 'Compressor');
      expect(service.tracks()[0].fxSlots).toHaveLength(2);
      history.undo();
      expect(service.tracks()[0].fxSlots).toHaveLength(1);
      expect(service.addFxSlot('nope', 'Reverb')).toBeNull();
    });

    it('removes a slot and restores it on undo', () => {
      withSlots();
      service.removeFxSlot('track-1', 'fx1');
      expect(service.tracks()[0].fxSlots).toHaveLength(0);
      history.undo();
      expect(service.tracks()[0].fxSlots).toHaveLength(1);
      expect(service.tracks()[0].fxSlots[0].id).toBe('fx1');
    });

    it('ignores a removal for a slot that is not there', () => {
      withSlots();
      service.removeFxSlot('track-1', 'missing');
      expect(service.tracks()[0].fxSlots).toHaveLength(1);
    });

    it('writes a parameter value onto the slot', () => {
      withSlots();
      service.setFxSlotParam('track-1', 'fx1', 'decay', 4.2);
      expect(service.tracks()[0].fxSlots[0].params.decay).toBe(4.2);
    });

    it('coalesces a knob gesture so one drag undoes as one step', () => {
      withSlots();
      service.setFxSlotParam('track-1', 'fx1', 'wet', 10);
      service.setFxSlotParam('track-1', 'fx1', 'wet', 20);
      service.setFxSlotParam('track-1', 'fx1', 'wet', 30);
      expect(service.tracks()[0].fxSlots[0].params.wet).toBe(30);

      history.undo();
      // The whole drag is reversed at once, not just the last frame.
      expect(service.tracks()[0].fxSlots[0].params.wet).toBeUndefined();
    });

    it('toggles a slot bypass and undoes it', () => {
      withSlots();
      service.toggleFxSlot('track-1', 'fx1');
      expect(service.tracks()[0].fxSlots[0].enabled).toBe(false);
      history.undo();
      expect(service.tracks()[0].fxSlots[0].enabled).toBe(true);
    });
  });

  describe('per-step observers (AI session musicians)', () => {
    it('notifies a registered observer once per step', () => {
      const observer = jest.fn();
      service.onStep(observer);

      service.playStep(0, 1, 0.25);

      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer).toHaveBeenCalledWith(0, 1, 0.25);
    });

    it('stops notifying after unsubscribe', () => {
      const observer = jest.fn();
      const off = service.onStep(observer);
      service.playStep(0, 1, 0.25);
      off();
      service.playStep(1, 1.25, 0.25);

      expect(observer).toHaveBeenCalledTimes(1);
    });

    it('renders the arrangement before the observers', () => {
      // The AI layer improvises *on top of* what the artist wrote: a generated
      // note must never land before (or instead of) the arranged part.
      const order: string[] = [];
      service.tracks.set([
        makeTrack({
          notes: [{ step: 0, midi: 60, length: 1, velocity: 0.8 }],
        }),
      ]);
      engineMock.triggerAttack.mockImplementation(() => order.push('arranged'));
      service.onStep(() => order.push('ai'));

      service.playStep(0, 1, 0.25);

      expect(order).toEqual(['arranged', 'ai']);
    });

    it('hands observers the swung time, not the raw grid time', () => {
      const observer = jest.fn();
      service.tracks.set([
        makeTrack({
          id: MusicManagerService.DRUM_TRACK_ID,
          type: 'drum',
          swingAmount: 0.4,
        }),
      ]);
      service.onStep(observer);

      service.playStep(1, 1, 0.25);

      // Step 1 is an offbeat: swingOffset * duration * 0.5 = 0.4 * 0.125.
      expect(observer).toHaveBeenCalledWith(1, 1.05, 0.25);
    });

    it('isolates a throwing observer so the transport keeps rendering', () => {
      const good = jest.fn();
      service.onStep(() => {
        throw new Error('bad AI part');
      });
      service.onStep(good);

      expect(() => service.playStep(0, 1, 0.25)).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    });

    it('supports several independent observers', () => {
      const first = jest.fn();
      const second = jest.fn();
      service.onStep(first);
      service.onStep(second);

      service.playStep(4, 2, 0.25);

      expect(first).toHaveBeenCalledWith(4, 2, 0.25);
      expect(second).toHaveBeenCalledWith(4, 2, 0.25);
    });
  });
});

/**
 * Mirrors the slice of DynamicEffectsRack the macro FX chain drives, including
 * its append-on-create ordering, so the wiring can be asserted without a real
 * (node-building) rack.
 */
class FakeRack {
  inserts: Array<{ id: string; plugin: { id: string; enabled: boolean } }> = [];
  private seq = 0;

  addInsert(pluginId: string) {
    const entry = {
      id: `ins${++this.seq}`,
      plugin: { id: pluginId, enabled: true },
    };
    this.inserts.push(entry);
    return entry;
  }

  removeInsert(id: string) {
    this.inserts = this.inserts.filter((s) => s.id !== id);
  }

  moveInsert(id: string, index: number) {
    const i = this.inserts.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [entry] = this.inserts.splice(i, 1);
    this.inserts.splice(Math.max(0, Math.min(index, this.inserts.length)), 0, entry);
  }

  toggleInsert(id: string) {
    const entry = this.inserts.find((s) => s.id === id);
    if (entry) entry.plugin.enabled = !entry.plugin.enabled;
  }
}

/**
 * The rack's Add Effect menu wrote `fxSlots` records that never reached an
 * AudioNode, so every effect it offered — Chorus included — was inaudible.
 */
describe('MusicManagerService macro FX slots (rack wiring)', () => {
  let service: MusicManagerService;
  let history: HistoryService;
  let rack: FakeRack;

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
    ...overrides,
  });

  const pluginIds = () => rack.inserts.map((s) => s.plugin.id);

  beforeEach(() => {
    rack = new FakeRack();
    const engineMock = {
      tempo: signal(120),
      visualStep: signal(0),
      setSongLengthSteps: jest.fn(),
      triggerAttack: jest.fn(),
      onScheduleStep: undefined as any,
      getTrackEffectsRack: jest.fn(() => rack),
    };

    TestBed.configureTestingModule({
      providers: [
        MusicManagerService,
        HistoryService,
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
    service.tracks.set([makeTrack()]);
  });

  it('adds a Chorus from the Add Effect menu as a real insert', () => {
    const id = service.addFxSlot('track-1', 'Chorus');

    expect(id).toBeTruthy();
    expect(pluginIds()).toEqual(['smuve.chorus.v1']);
  });

  it('maps every effect the menu offers that has a plugin behind it', () => {
    for (const type of [
      'Reverb',
      'Delay',
      'Compressor',
      'EQ',
      'Saturation',
      'Chorus',
    ]) {
      service.addFxSlot('track-1', type);
    }

    expect(pluginIds()).toEqual([
      'smuve.reverb.v1',
      'smuve.delay.v1',
      'smuve.compressor.v1',
      'smuve.eq.v1',
      'smuve.distortion.v1',
      'smuve.chorus.v1',
    ]);
  });

  it('leaves a slot with no plugin behind it data-only', () => {
    service.addFxSlot('track-1', 'Filter');

    expect(rack.inserts).toHaveLength(0);
    expect(service.tracks()[0].fxSlots).toHaveLength(1);
  });

  it('removes the insert when its slot goes away', () => {
    service.addFxSlot('track-1', 'Chorus');
    const slotId = service.tracks()[0].fxSlots[0].id;

    service.removeFxSlot('track-1', slotId);

    expect(rack.inserts).toHaveLength(0);
  });

  it('undoing an add releases the insert too', () => {
    service.addFxSlot('track-1', 'Chorus');
    expect(rack.inserts).toHaveLength(1);

    history.undo();

    expect(rack.inserts).toHaveLength(0);
  });

  it('mirrors a slot bypass onto its plugin, and back on undo', () => {
    service.addFxSlot('track-1', 'Chorus');
    const slotId = service.tracks()[0].fxSlots[0].id;
    expect(rack.inserts[0].plugin.enabled).toBe(true);

    service.toggleFxSlot('track-1', slotId);
    expect(rack.inserts[0].plugin.enabled).toBe(false);

    history.undo();
    expect(rack.inserts[0].plugin.enabled).toBe(true);
  });

  it('seats inserts in the order the slots are displayed in', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx1', type: 'Reverb', params: {}, enabled: true },
          { id: 'fx2', type: 'Chorus', params: {}, enabled: true },
          { id: 'fx3', type: 'EQ', params: {}, enabled: true },
        ],
      }),
    ]);

    service.toggleFxSlot('track-1', 'fx3');

    expect(pluginIds()).toEqual([
      'smuve.reverb.v1',
      'smuve.chorus.v1',
      'smuve.eq.v1',
    ]);
    // Only the toggled slot is bypassed; the chain order is untouched.
    expect(rack.inserts.map((s) => s.plugin.enabled)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('re-seats a slot an undo puts back in front of the chain', () => {
    service.tracks.set([
      makeTrack({
        fxSlots: [
          { id: 'fx1', type: 'Reverb', params: {}, enabled: true },
          { id: 'fx2', type: 'Chorus', params: {}, enabled: true },
        ],
      }),
    ]);
    service.toggleFxSlot('track-1', 'fx1');
    service.removeFxSlot('track-1', 'fx1');
    expect(pluginIds()).toEqual(['smuve.chorus.v1']);

    history.undo();

    // Re-created inserts append, so they must be re-seated to the slot order.
    expect(pluginIds()).toEqual(['smuve.reverb.v1', 'smuve.chorus.v1']);
    expect(rack.inserts.map((s) => s.plugin.enabled)).toEqual([false, true]);
  });

  it('picks up a chain written outside the manager (AI / neural mixer path)', () => {
    service.tracks.update((ts) =>
      ts.map((t) => ({
        ...t,
        fxSlots: [{ id: 'ai1', type: 'Chorus', params: {}, enabled: true }],
      })),
    );
    expect(rack.inserts).toHaveLength(0);

    service.syncTrackFxChain('track-1');

    expect(pluginIds()).toEqual(['smuve.chorus.v1']);
  });
});
