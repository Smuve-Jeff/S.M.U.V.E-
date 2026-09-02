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
      setDeckGain: jest.fn(),
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
});
