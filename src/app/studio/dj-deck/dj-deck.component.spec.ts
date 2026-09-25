import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DjDeckComponent } from './dj-deck.component';
import { FileLoaderService } from '../../services/file-loader.service';
import { ExportService } from '../../services/export.service';
import { LibraryService } from '../../services/library.service';
import { DeckService } from '../../services/deck.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { DatabaseService } from '../../services/database.service';
import { UIService } from '../../services/ui.service';
import { UserProfileService } from '../../services/user-profile.service';
import { initialDeckState } from '../../services/user-context.service';
import { AiService } from '../../services/ai.service';
import { DjMidiService } from '../../services/dj-midi.service';

describe('DjDeckComponent', () => {
  let component: DjDeckComponent;
  let mockExportService: { downloadBlob: jest.Mock };
  let mockDatabaseService: { saveProject: jest.Mock };
  let mockDeckService: any;

  beforeEach(() => {
    mockExportService = {
      downloadBlob: jest.fn().mockResolvedValue(undefined),
    };

    mockDatabaseService = {
      saveProject: jest.fn().mockResolvedValue(undefined),
    };

    mockDeckService = {
      deckA: signal({
        ...initialDeckState,
        track: { name: 'Track A', url: '' },
        hotCues: [12, null, null, null, null, null, null, null],
        samplerPads: {
          drums: [24, null, null, null, null, null, null, null],
          fx: new Array(8).fill(null),
          vocals: new Array(8).fill(null),
        },
        progress: 16,
        duration: 120,
        bpm: 120,
      }),
      deckB: signal({
        ...initialDeckState,
        track: { name: 'Track B', url: '' },
        progress: 32,
        duration: 140,
        bpm: 128,
      }),
      crossfade: signal(0.2),
      viewMode: signal<'functional' | 'flat'>('functional'),
      syncProgress: jest.fn(),
      setHotCue: jest.fn(),
      setSamplerPad: jest.fn(),
      jumpToHotCue: jest.fn(),
      clearHotCue: jest.fn(),
      clearSamplerPad: jest.fn(),
      onStemGainChange: jest.fn().mockImplementation((id, payload) => {
        const target = mockDeckService[id === 'A' ? 'deckA' : 'deckB'];
        target.update((d: typeof initialDeckState) => ({
          ...d,
          stemGains: { ...d.stemGains, [payload.stem]: payload.gain },
        }));
      }),
      toggleViewMode: jest.fn(),
      toggleSlip: jest.fn(),
      togglePlay: jest.fn(),
      setDeckEq: jest.fn().mockImplementation((id, high, mid, low) => {
        const target = mockDeckService[id === 'A' ? 'deckA' : 'deckB'];
        target.update((d: typeof initialDeckState) => ({
          ...d,
          eqHigh: high,
          eqMid: mid,
          eqLow: low,
        }));
      }),
      setDeckFilter: jest.fn().mockImplementation((id, freq) => {
        const target = mockDeckService[id === 'A' ? 'deckA' : 'deckB'];
        target.update((d: typeof initialDeckState) => ({
          ...d,
          filterFreq: freq,
        }));
      }),
      setDeckGain: jest.fn().mockImplementation((id, gain) => {
        const target = mockDeckService[id === 'A' ? 'deckA' : 'deckB'];
        target.update((d: typeof initialDeckState) => ({ ...d, gain }));
      }),
      setDeckSend: jest.fn(),
      setBpm: jest.fn(),
      sync: jest.fn(),
      toggleLoop: jest.fn(),
      autoSync: jest.fn(),
      setFx: jest.fn(),
      toggleAutomix: jest.fn(),
      automixEnabled: jest.fn().mockReturnValue(false),
      setPlaybackRate: jest.fn().mockImplementation((id, rate) => {
        const target = mockDeckService[id === 'A' ? 'deckA' : 'deckB'];
        target.update((d: typeof initialDeckState) => ({
          ...d,
          playbackRate: rate,
        }));
      }),
      setKeyLock: jest.fn().mockImplementation((id, enabled) => {
        const target = mockDeckService[id === 'A' ? 'deckA' : 'deckB'];
        target.update((d: typeof initialDeckState) => ({
          ...d,
          keyLock: enabled,
        }));
      }),
      setBassBoost: jest.fn(),
      setDeckFilterMode: jest.fn().mockImplementation((id, filterMode) => {
        const target = mockDeckService[id === 'A' ? 'deckA' : 'deckB'];
        target.update((d: typeof initialDeckState) => ({ ...d, filterMode }));
      }),
      scratch: jest.fn(),
    };

    TestBed.configureTestingModule({
      imports: [DjDeckComponent],
      providers: [
        {
          provide: FileLoaderService,
          useValue: {
            pickLocalFiles: jest.fn(),
            decodeToAudioBuffer: jest.fn(),
          },
        },
        { provide: ExportService, useValue: mockExportService },
        { provide: LibraryService, useValue: {} },
        { provide: DeckService, useValue: mockDeckService },
        {
          provide: AudioEngineService,
          useValue: {
            currentBeat: signal(0),
            getContext: jest.fn().mockReturnValue({ sampleRate: 44100 }),
            getDeckWaveformData: jest.fn().mockReturnValue(new Float32Array(0)),
            getDeckLevel: jest.fn().mockReturnValue(0),
            getDeckProgress: jest.fn().mockReturnValue({
              position: 0,
              duration: 120,
              isPlaying: false,
              slipPosition: 0,
            }),
            seekDeck: jest.fn(),
            playDeck: jest.fn(),
            pauseDeck: jest.fn(),
            setDeckRate: jest.fn(),
            setDeckLoopRegion: jest.fn(),
            setSaturation: jest.fn(),
            setMasterOutputLevel: jest.fn(),
            setDeckGain: jest.fn(),
            setDeckFilter: jest.fn(),
            brakeDeck: jest.fn(),
            spinbackDeck: jest.fn(),
            transformDeck: jest.fn(),
            setCrossfader: jest.fn(),
          },
        },
        { provide: DatabaseService, useValue: mockDatabaseService },
        {
          provide: UIService,
          useValue: {
            activeTheme: signal({
              name: 'Dark',
              primary: '#10b981',
              accent: '#38bdf8',
              neutral: '#020617',
              purple: '#6366f1',
              red: '#f43f5e',
              blue: '#3b82f6',
            }),
            isLowPower: signal(false),
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({
              id: 'user-1',
              daw: [],
              equipment: [],
              settings: { ui: {} },
            }),
          },
        },
        {
          provide: AiService,
          useValue: { isUnlocked: jest.fn().mockReturnValue(false) },
        },
        { provide: DjMidiService, useValue: { initMidi: jest.fn() } },
      ],
    });

    component = TestBed.createComponent(DjDeckComponent).componentInstance;
  });

  it('saves a DJ session snapshot through the database service', async () => {
    await component.saveSessionSnapshot();

    expect(mockDatabaseService.saveProject).toHaveBeenCalled();
    const [, , payload, userId] = mockDatabaseService.saveProject.mock.calls[0];
    expect(payload.type).toBe('dj-session-snapshot');
    expect(payload.deckA.trackName).toBe('Track A');
    expect(userId).toBe('user-1');
  });

  it('exports a DJ session snapshot as JSON', async () => {
    await component.exportSessionSnapshot();

    expect(mockExportService.downloadBlob).toHaveBeenCalled();
    const [blob, filename] = mockExportService.downloadBlob.mock.calls[0];
    expect(filename).toMatch(/dj-session-\d+\.json/);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('includes sampler pads in a saved DJ session snapshot', async () => {
    await component.saveSessionSnapshot();

    const [, , payload] = mockDatabaseService.saveProject.mock.calls[0];
    expect(payload.deckA.samplerPads.drums[0]).toBe(24);
  });

  it('clears a hot cue through the deck service', () => {
    const event = { preventDefault: jest.fn() } as unknown as MouseEvent;

    component.clearHotCue('A', 0, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockDeckService.clearHotCue).toHaveBeenCalledWith('A', 0);
  });

  it('returns roll pad labels when roll mode is active', () => {
    component.performanceMode.set('roll');

    expect(component.getPadLabel(0)).toBe('1/8 Roll');
  });

  it('starts and releases a BPM-aware slip roll', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    engine.getDeckProgress.mockReturnValue({
      position: 32,
      duration: 120,
      isPlaying: true,
      slipPosition: 32,
    });

    component.performanceMode.set('roll');
    component.handlePadDown('A', 2, {
      preventDefault: jest.fn(),
    } as unknown as MouseEvent);

    expect(engine.seekDeck).toHaveBeenCalledWith('A', 31.75);
    expect(engine.playDeck).toHaveBeenCalledWith('A');
    expect(component.isRollPadActive('A', 2)).toBe(true);

    component.handlePadRelease('A', 2);

    expect(component.isRollPadActive('A', 2)).toBe(false);
  });

  it('window release clears a roll whose pad mouseup was missed (drag-off)', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    engine.getDeckProgress.mockReturnValue({
      position: 32,
      duration: 120,
      isPlaying: true,
      slipPosition: 32,
    });
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      bpm: 128,
      playbackRate: 1,
      duration: 120,
      isPlaying: true,
    }));

    component.performanceMode.set('roll');
    component.handlePadDown('A', 0, {
      preventDefault: jest.fn(),
    } as unknown as MouseEvent);
    expect(component.isRollPadActive('A', 0)).toBe(true);

    // No handlePadRelease — the pointer left the pad; the window listener fires.
    component.onGlobalPointerRelease();

    expect(component.isRollPadActive('A', 0)).toBe(false);
    expect(engine.playDeck).toHaveBeenCalledWith('A'); // groove resumed
  });

  it('touchcancel clears an active roll instead of leaving it looping', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    engine.getDeckProgress.mockReturnValue({
      position: 32,
      duration: 120,
      isPlaying: true,
      slipPosition: 32,
    });
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      bpm: 128,
      playbackRate: 1,
      duration: 120,
      isPlaying: true,
    }));

    component.performanceMode.set('roll');
    component.handlePadDown('A', 1, {
      preventDefault: jest.fn(),
    } as unknown as TouchEvent);
    expect(component.isRollPadActive('A', 1)).toBe(true);

    component.onGlobalPointerRelease(); // simulates window:touchcancel

    expect(component.isRollPadActive('A', 1)).toBe(false);
  });

  it('touchcancel releases a platter scratch and resumes playback', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      isPlaying: true,
      slip: false,
    }));

    component.onPlatterDown('A', {
      preventDefault: jest.fn(),
      changedTouches: [{ identifier: 7 }],
      touches: [{ identifier: 7 }],
    } as unknown as TouchEvent);
    expect(component.isScratchingA()).toBe(true);

    component.onPlatterUp(); // simulates window:touchcancel

    expect(component.isScratchingA()).toBe(false);
    expect(component.scratchVelocityA()).toBe(0);
    expect(engine.playDeck).toHaveBeenCalledWith('A');
  });

  it('arms and clears sampler pads independently from hot cues', () => {
    component.performanceMode.set('sampler');
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      samplerPads: {
        drums: new Array(8).fill(null),
        fx: new Array(8).fill(null),
        vocals: new Array(8).fill(null),
      },
      hotCues: [12, null, null, null, null, null, null, null],
    }));

    component.handlePadPress('A', 1);

    expect(mockDeckService.setSamplerPad).toHaveBeenCalledWith('A', 1, 'drums');
    expect(mockDeckService.setHotCue).not.toHaveBeenCalled();

    const event = { preventDefault: jest.fn() } as unknown as MouseEvent;
    component.clearPad('A', 1, event);

    expect(mockDeckService.clearSamplerPad).toHaveBeenCalledWith(
      'A',
      1,
      'drums'
    );
    expect(mockDeckService.clearHotCue).not.toHaveBeenCalledWith('A', 1);
  });

  it('shows effective BPM using playback rate per deck', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      bpm: 100,
      playbackRate: 1.2,
    }));

    expect(component.deckATempo()).toBe(120);
  });

  it('toggles key lock through the deck service', () => {
    component.toggleKeyLock('A');

    expect(mockDeckService.setKeyLock).toHaveBeenCalledWith('A', false);
  });

  it('propagates the keyLock flag when releasing a scratch on Deck A', () => {
    const engine = TestBed.inject(AudioEngineService) as any;

    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      keyLock: false,
      playbackRate: 1.15,
    }));

    component.isScratchingA.set(true);
    component.onPlatterUp();

    expect(component.isScratchingA()).toBe(false);
    expect(component.scratchVelocityA()).toBe(0);
    expect(engine.setDeckRate).toHaveBeenCalledWith('A', 1.15, false);
  });

  it('propagates the keyLock flag when releasing a scratch on Deck B', () => {
    const engine = TestBed.inject(AudioEngineService) as any;

    mockDeckService.deckB.update((d: typeof initialDeckState) => ({
      ...d,
      keyLock: true,
      playbackRate: 0.95,
    }));

    component.isScratchingB.set(true);
    component.onPlatterUp();

    expect(component.isScratchingB()).toBe(false);
    expect(component.scratchVelocityB()).toBe(0);
    expect(engine.setDeckRate).toHaveBeenCalledWith('B', 0.95, true);
  });

  // ------------------------------------------------------------------
  // Setter hardening: every setter must reject NaN / out-of-range values
  // before they reach the deck service or the audio engine.
  // ------------------------------------------------------------------

  it('clamps setPlaybackRate to the safe [0.5, 2] range', () => {
    component.setPlaybackRate('A', 5);
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 2);

    component.setPlaybackRate('A', -1);
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 0.5);

    // NaN coerces to fallback 0, which is then clamped to the safe floor 0.5.
    component.setPlaybackRate('A', Number.NaN);
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 0.5);

    component.setPlaybackRate('A', null);
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 0.5);

    component.setPlaybackRate('A', '');
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 0.5);
  });

  it('clamps setBassBoost into [0, 1]', () => {
    component.setBassBoost('A', 2);
    expect(mockDeckService.setBassBoost).toHaveBeenLastCalledWith('A', 1);

    component.setBassBoost('A', -3);
    expect(mockDeckService.setBassBoost).toHaveBeenLastCalledWith('A', 0);

    component.setBassBoost('A', 'not-a-number');
    expect(mockDeckService.setBassBoost).toHaveBeenLastCalledWith('A', 0);
  });

  it('clamps setMasterVolume into [0, 1.5] and ignores garbage', () => {
    const engine = TestBed.inject(AudioEngineService) as any;

    component.setMasterVolume(2);
    expect(component.masterVolume()).toBe(1.5);
    expect(engine.setMasterOutputLevel).toHaveBeenLastCalledWith(1.5);

    component.setMasterVolume(-1);
    expect(component.masterVolume()).toBe(0);
    expect(engine.setMasterOutputLevel).toHaveBeenLastCalledWith(0);

    component.setMasterVolume(undefined);
    expect(component.masterVolume()).toBe(0);
    expect(engine.setMasterOutputLevel).toHaveBeenLastCalledWith(0);
  });

  it('clamps setCrossfade into [-1, 1]', () => {
    component.setCrossfade(2);
    expect(mockDeckService.crossfade()).toBe(1);

    component.setCrossfade(-3);
    expect(mockDeckService.crossfade()).toBe(-1);

    component.setCrossfade('abc');
    expect(mockDeckService.crossfade()).toBe(0);
  });

  it('clamps setGain / updateGain into [0, 2]', () => {
    component.setGain('A', 5);
    expect(mockDeckService.setDeckGain).toHaveBeenLastCalledWith('A', 2);

    component.setGain('A', -1);
    expect(mockDeckService.setDeckGain).toHaveBeenLastCalledWith('A', 0);

    component.updateGain('A', NaN);
    expect(mockDeckService.deckA().gain).toBe(0);
    expect(mockDeckService.setDeckGain).toHaveBeenLastCalledWith('A', 0);

    const engine = TestBed.inject(AudioEngineService) as any;
    component.updateGain('B', 7);
    expect(mockDeckService.deckB().gain).toBe(2);
    expect(engine.setDeckGain).toHaveBeenLastCalledWith('B', 2);
  });

  it('clamps updateCrossfader into [-1, 1]', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    component.updateCrossfader(5);
    expect(mockDeckService.crossfade()).toBe(1);
    expect(engine.setCrossfader).toHaveBeenLastCalledWith(1);

    component.updateCrossfader(-5);
    expect(mockDeckService.crossfade()).toBe(-1);
    expect(engine.setCrossfader).toHaveBeenLastCalledWith(-1);

    component.updateCrossfader('garbage');
    expect(mockDeckService.crossfade()).toBe(0);
    expect(engine.setCrossfader).toHaveBeenLastCalledWith(0);
  });

  it('clamps setSend into [0, 1]', () => {
    component.setSend('A', 'A', 2);
    expect(mockDeckService.setDeckSend).toHaveBeenLastCalledWith('A', 'A', 1);

    component.setSend('B', 'B', -1);
    expect(mockDeckService.setDeckSend).toHaveBeenLastCalledWith('B', 'B', 0);
  });

  it('clamps setFxAmount into [0, 1]', () => {
    component.setFxAmount('A', 4);
    expect(mockDeckService.setFx).toHaveBeenLastCalledWith('A', 'echo', 1);

    component.setFxAmount('A', -2);
    expect(mockDeckService.setFx).toHaveBeenLastCalledWith('A', 'echo', 0);

    component.setFxAmount('A', 'oops');
    expect(mockDeckService.setFx).toHaveBeenLastCalledWith('A', 'echo', 0);
  });

  it('clamps setSaturation into [0, 1]', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    component.setSaturation(3);
    expect(engine.setSaturation).toHaveBeenLastCalledWith(1);

    component.setSaturation(-1);
    expect(engine.setSaturation).toHaveBeenLastCalledWith(0);

    component.setSaturation(NaN);
    expect(engine.setSaturation).toHaveBeenLastCalledWith(0);
  });

  it('selectFxMode re-engages both loaded decks at their current depth', () => {
    component.selectFxMode('echo');
    expect(component.fxMode()).toBe('echo');
    // Deck A: depth 0 (default). Deck B: same. Loaded decks get setFx.
    expect(mockDeckService.setFx).toHaveBeenCalledWith('A', 'echo', 0);
    expect(mockDeckService.setFx).toHaveBeenCalledWith('B', 'echo', 0);
  });

  it('selectFxMode skips decks without a loaded track', () => {
    mockDeckService.deckB.update((d: typeof initialDeckState) => ({
      ...d,
      track: null,
    }));
    mockDeckService.setFx.mockClear();
    component.selectFxMode('phaser');
    expect(component.fxMode()).toBe('phaser');
    expect(mockDeckService.setFx).toHaveBeenCalledTimes(1);
    expect(mockDeckService.setFx).toHaveBeenCalledWith('A', 'phaser', 0);
  });

  it('selectFxMode hands the deck depth through setFx unclamped-proof', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      fxAmount: 0.6,
    }));
    mockDeckService.setFx.mockClear();
    component.selectFxMode('damp');
    expect(mockDeckService.setFx).toHaveBeenCalledWith('A', 'damp', 0.6);
    expect(mockDeckService.setFx).toHaveBeenCalledWith('B', 'damp', 0);
  });

  it('clamps updateFilter frequencies into the audible range', () => {
    component.updateFilter('A', 100000);
    expect(mockDeckService.setDeckFilter).toHaveBeenLastCalledWith('A', 22050);

    component.updateFilter('A', -50);
    expect(mockDeckService.setDeckFilter).toHaveBeenLastCalledWith('A', 20);

    // 'wat' coerces to NaN → fallback 0 → clamped to audible floor 20.
    component.updateFilter('A', 'wat');
    expect(mockDeckService.setDeckFilter).toHaveBeenLastCalledWith('A', 20);
  });

  it('clamps updateEq band values into [0, 2] and preserves untouched bands', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      eqHigh: 1,
      eqMid: 1.1,
      eqLow: 0.9,
    }));

    component.updateEq('A', 'high', 5);
    expect(mockDeckService.setDeckEq).toHaveBeenLastCalledWith(
      'A',
      2,
      1.1,
      0.9
    );

    component.updateEq('A', 'low', -2);
    expect(mockDeckService.setDeckEq).toHaveBeenLastCalledWith('A', 2, 1.1, 0);
  });

  it('clamps setStemGain event values into [0, 2] and rejects unknown stems', () => {
    component.setStemGain('A', 'vocals', {
      target: { valueAsNumber: 5 },
    } as unknown as Event);
    expect(mockDeckService.onStemGainChange).toHaveBeenLastCalledWith('A', {
      stem: 'vocals',
      gain: 2,
    });

    component.setStemGain('A', 'unknown-stem', {
      target: { valueAsNumber: 0.5 },
    } as unknown as Event);
    expect(mockDeckService.onStemGainChange).toHaveBeenCalledTimes(1);

    component.setStemGain('A', 'vocals', {
      target: null,
    } as unknown as Event);
    expect(mockDeckService.onStemGainChange).toHaveBeenLastCalledWith('A', {
      stem: 'vocals',
      gain: 0,
    });
  });

  it('rejects invalid sampler categories without changing state', () => {
    component.setSamplerCategory('fx');
    expect(component.samplerCategory()).toBe('fx');

    // Invalid string should be ignored (runtime guard in addition to TS type).
    component.setSamplerCategory(
      'invalid' as unknown as 'drums' | 'fx' | 'vocals'
    );
    expect(component.samplerCategory()).toBe('fx');
  });

  it('clamps nudgePitch into the safe playback rate range', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      playbackRate: 1.49,
    }));

    component.nudgePitch('A', 'up');
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 1.5);

    component.nudgePitch('A', 'up');
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 1.51);

    // Reset always returns to 1.0 regardless of current rate.
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      playbackRate: 1.95,
    }));
    component.nudgePitch('A', 'reset');
    expect(mockDeckService.setPlaybackRate).toHaveBeenLastCalledWith('A', 1);
  });

  it('refuses setLoopLengthPreset when no track is loaded', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      track: { name: '', url: '' },
    }));
    component.setLoopLengthPreset('A', 1);
    expect(mockDeckService.toggleLoop).not.toHaveBeenCalled();
  });

  it('refuses setLoopLengthPreset when beats is not finite', () => {
    component.setLoopLengthPreset('A', NaN);
    expect(mockDeckService.toggleLoop).not.toHaveBeenCalled();
    expect(component.sessionNotice()).toMatch(/finite/i);
  });

  it('clamps setPrecisionEqBand into [0, 2] and ignores out-of-range indices', () => {
    component.precisionEqA.set(new Array(10).fill(1));

    component.setPrecisionEqBand('A', 3, 5);
    expect(component.precisionEqA()[3]).toBe(2);

    component.setPrecisionEqBand('A', 7, -1);
    expect(component.precisionEqA()[7]).toBe(0);

    component.setPrecisionEqBand('A', 99, 1);
    // Out-of-range index should not mutate the precision EQ array length.
    expect(component.precisionEqA().length).toBe(10);
  });

  it('flips setQuickEq between off (0) and on (1) based on current value', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      eqHigh: 1,
      eqMid: 0,
      eqLow: 1,
    }));

    component.setQuickEq('A', 'high');
    expect(mockDeckService.setDeckEq).toHaveBeenLastCalledWith('A', 0, 0, 1);

    component.setQuickEq('A', 'mid');
    expect(mockDeckService.setDeckEq).toHaveBeenLastCalledWith('A', 0, 1, 1);

    component.setQuickEq('A', 'low');
    expect(mockDeckService.setDeckEq).toHaveBeenLastCalledWith('A', 0, 1, 0);
  });

  // ------------------------------------------------------------------
  // Vintage transport: multi-touch safety, tonearm needle drops,
  // rotary knobs, motor speed and keyboard scrubbing.
  // ------------------------------------------------------------------

  /** A window-level `touchend` carrying the identifiers that lifted. */
  const endTouches = (...identifiers: number[]) =>
    ({
      changedTouches: identifiers.map((identifier) => ({ identifier })),
    }) as unknown as TouchEvent;

  const grabTouches = (identifier: number, x = 120, y = 120) =>
    ({
      preventDefault: jest.fn(),
      touches: [{ identifier, clientX: x, clientY: y }],
      changedTouches: [{ identifier, clientX: x, clientY: y }],
    }) as unknown as TouchEvent;

  const pointer = (x: number, y: number, extra: object = {}) =>
    ({
      preventDefault: jest.fn(),
      clientX: x,
      clientY: y,
      ...extra,
    }) as unknown as MouseEvent;

  it('keeps a scratch alive when another finger ends elsewhere (multi-touch)', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      isPlaying: true,
    }));

    component.onPlatterDown('A', grabTouches(7));
    expect(component.isScratchingA()).toBe(true);

    // A pad hit / fader drag on the other hand lifts its own touch point.
    component.onPlatterTouchEnd(endTouches(99));

    expect(component.isScratchingA()).toBe(true);
    expect(engine.playDeck).not.toHaveBeenCalledWith('A');

    // The scratch's own finger is the only one that can end it.
    component.onPlatterTouchEnd(endTouches(7));
    expect(component.isScratchingA()).toBe(false);
    expect(engine.playDeck).toHaveBeenCalledWith('A');
  });

  it('never ends a touch-held scratch on a mouse release', () => {
    component.onPlatterDown('A', grabTouches(11));
    expect(component.isScratchingA()).toBe(true);

    component.onPlatterMouseUp({} as MouseEvent);

    expect(component.isScratchingA()).toBe(true);
    component.onPlatterUp();
  });

  it('drops the needle proportionally along the tonearm rail', () => {
    const engine = TestBed.inject(AudioEngineService) as any;

    const rail = (clientX: number) =>
      ({
        preventDefault: jest.fn(),
        clientX,
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 1000 }),
        },
      }) as unknown as MouseEvent;

    // Middle of the rail maps to the middle of the record.
    component.onTonearmDown('A', rail(500));
    expect(engine.seekDeck.mock.calls.at(-1)[0]).toBe('A');
    expect(engine.seekDeck.mock.calls.at(-1)[1]).toBeCloseTo(60, 6);

    // The arm cannot reach the label or the lead-in rim.
    component.onPlatterMove(rail(1000));
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 120);

    component.onPlatterMove(rail(0));
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 0);

    component.onPlatterMouseUp({} as MouseEvent);
    expect(component.tonearmDragging()).toBeNull();
  });

  it('ignores tonearm drags for a deck with no record on the platter', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    engine.getDeckProgress.mockReturnValue({
      position: 0,
      duration: 0,
      isPlaying: false,
      slipPosition: 0,
    });
    mockDeckService.deckB.update((d: typeof initialDeckState) => ({
      ...d,
      duration: 0,
    }));

    component.onTonearmDown('B', pointer(500));

    expect(engine.seekDeck).not.toHaveBeenCalled();
    component.onTonearmUp();
  });

  it('sweeps a rotary knob on a vertical drag and stops when released', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      gain: 1,
    }));

    component.onKnobDown('gain', 'A', pointer(0, 300));
    expect(component.activeKnob()).toEqual({ deck: 'A', param: 'gain' });

    // Half of a 170px sweep up == +1.0 gain on a 0..2 control.
    component.onPlatterMove(pointer(0, 215));
    expect(mockDeckService.setDeckGain).toHaveBeenLastCalledWith('A', 2);

    component.onPlatterMouseUp({} as MouseEvent);
    expect(component.activeKnob()).toBeNull();

    mockDeckService.setDeckGain.mockClear();
    component.onPlatterMove(pointer(0, 40));
    expect(mockDeckService.setDeckGain).not.toHaveBeenCalled();
  });

  it('routes knob sweeps onto the existing deck-service parameters', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      eqHigh: 1,
      fxAmount: 0,
    }));

    component.onKnobDown('eqHigh', 'A', pointer(0, 200));
    component.onPlatterMove(pointer(0, 115));
    expect(mockDeckService.setDeckEq).toHaveBeenLastCalledWith('A', 2, 1, 1);
    component.onPlatterMouseUp({} as MouseEvent);

    component.onKnobDown('fxAmount', 'A', pointer(0, 200));
    component.onPlatterMove(pointer(0, 115));
    expect(mockDeckService.setFx).toHaveBeenLastCalledWith('A', 'echo', 0.5);
    component.onPlatterMouseUp({} as MouseEvent);
  });

  it('snaps a knob back to its engraved detent', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      eqLow: 1.8,
    }));

    component.resetKnob('eqLow', 'A');

    expect(mockDeckService.setDeckEq).toHaveBeenLastCalledWith('A', 1, 1, 1);
    expect(component.sessionNotice()).toMatch(/LOW/i);
  });

  it('reads rotary positions back in hardware units', () => {
    mockDeckService.deckA.update((d: typeof initialDeckState) => ({
      ...d,
      eqHigh: 1,
      filterFreq: 20000,
    }));

    expect(component.knobNormalized('eqHigh', 'A')).toBe(0.5);
    expect(component.knobRotation('eqHigh', 'A')).toBe(0);
    expect(component.knobReadout('eqHigh', 'A')).toBe('+0.0 dB');
    expect(component.knobReadout('filter', 'A')).toMatch(/kHz/);
  });

  it('flips the motor between 33 and 45 RPM', () => {
    expect(component.platterRpm().A).toBe(33);

    component.togglePlatterRpm('A');
    expect(component.platterRpm().A).toBe(45);
    expect(component.platterRpm().B).toBe(45);
    expect(component.sessionNotice()).toMatch(/45 RPM/);

    component.togglePlatterRpm('A');
    expect(component.platterRpm().A).toBe(33);
  });

  it('engages slip mode through the deck service', () => {
    component.toggleSlip('B');
    expect(mockDeckService.toggleSlip).toHaveBeenCalledWith('B');
  });

  it('switches the analog filter between LPF and HPF', () => {
    component.setFilterMode('A', 'highpass');

    expect(component.filterMode().A).toBe('highpass');
    expect(mockDeckService.setDeckFilterMode).toHaveBeenCalledWith(
      'A',
      'highpass'
    );
    expect(component.sessionNotice()).toMatch(/HPF/);
  });

  it('tracks the filter switch even when the mode is set outside the booth', () => {
    // The switch used to keep its own copy of the filter type, so a mode change
    // made through the deck service left the booth showing a stale value.
    mockDeckService.deckB.update((d: typeof initialDeckState) => ({
      ...d,
      filterMode: 'highpass',
    }));

    expect(component.filterMode().B).toBe('highpass');
    expect(component.filterMode().A).toBe('lowpass');
  });

  it('seeks, nudges and plays from the platter keyboard', () => {
    const engine = TestBed.inject(AudioEngineService) as any;
    const press = (key: string, shiftKey = false) =>
      ({ key, shiftKey, preventDefault: jest.fn() }) as unknown as KeyboardEvent;

    engine.getDeckProgress.mockReturnValue({
      position: 10,
      duration: 120,
      isPlaying: false,
      slipPosition: 10,
    });

    component.onPlatterKeydown('A', press('ArrowRight'));
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 10.5);

    component.onPlatterKeydown('A', press('ArrowLeft', true));
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 5);

    component.onPlatterKeydown('A', press('Home'));
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 0);

    component.onPlatterKeydown('A', press('End'));
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 120);

    component.onPlatterKeydown('A', press(' '));
    expect(mockDeckService.togglePlay).toHaveBeenCalledWith('A');
  });

  it('clamps every seek into the loaded track', () => {
    const engine = TestBed.inject(AudioEngineService) as any;

    component.seekTo('A', 999);
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 120);

    component.seekTo('A', -40);
    expect(engine.seekDeck).toHaveBeenLastCalledWith('A', 0);
  });

  it('carries a flick out of the scratch and cancels it on the next grab', () => {
    component.onPlatterDown('A', pointer(100, 100));
    expect(component.platterSpin().A).toBe(0);

    component.onPlatterMove(pointer(190, 30));
    expect(Math.abs(component.platterSpin().A)).toBeGreaterThan(0);

    // Catching the spinning record stops the free-wheel.
    component.onPlatterDown('A', pointer(100, 100));
    expect(component.platterSpin().A).toBe(0);

    component.onPlatterUp();
  });

  it('formats booth timecodes and flags the deck on air', () => {
    expect(component.formatTimecode(0)).toBe('0:00.0');
    expect(component.formatTimecode(75.5)).toBe('1:15.5');

    mockDeckService.crossfade.set(0.5);
    expect(component.isDeckLeading('B')).toBe(true);
    expect(component.isDeckLeading('A')).toBe(false);
  });

  it('lights the sync lamp only when both decks share a tempo', () => {
    expect(component.syncLocked()).toBe(false);

    mockDeckService.deckB.update((d: typeof initialDeckState) => ({
      ...d,
      bpm: 120,
      playbackRate: 1,
    }));

    expect(component.syncLocked()).toBe(true);
  });

  it('reports which decks already have a record on the platter', () => {
    expect(component.trackLoaded('A')).toBe(true);

    mockDeckService.deckB.update((d: typeof initialDeckState) => ({
      ...d,
      track: { name: '', url: '' },
    }));
    expect(component.trackLoaded('B')).toBe(false);
  });

  /**
   * The booth is defined by its pair of platters: both turntables must be on
   * the bench at the same time, on every viewport, with nothing swapping one
   * out for the other.
   */
  const renderBench = async () => {
    const fixture = TestBed.createComponent(DjDeckComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('renders both turntables and both platters at once', async () => {
    const booth = await renderBench();

    expect(booth.querySelectorAll('.deck-chassis').length).toBe(2);
    expect(booth.querySelectorAll('.deck-chassis.deck-a').length).toBe(1);
    expect(booth.querySelectorAll('.deck-chassis.deck-b').length).toBe(1);
    expect(booth.querySelectorAll('.vinyl-platter').length).toBe(2);
  });

  it('never hides a deck behind a deck-switching control', async () => {
    const booth = await renderBench();

    // The single-deck rocker is gone: with both platters permanently on the
    // bench there is no "visible turntable" left to choose between.
    expect(booth.querySelector('.mobile-deck-switcher')).toBeNull();
    expect(booth.querySelector('.deck-chassis.mobile-hidden')).toBeNull();
    const chassis = Array.from(booth.querySelectorAll('.deck-chassis'));
    expect(
      chassis.every((deck) => !deck.classList.contains('mobile-hidden'))
    ).toBe(true);
  });
});
