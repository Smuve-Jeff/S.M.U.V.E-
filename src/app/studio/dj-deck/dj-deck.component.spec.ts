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
import { PlayerService } from '../../services/player.service';
import { initialDeckState } from '../../services/user-context.service';

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
        samplerPads: [24, null, null, null, null, null, null, null],
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
      toggleViewMode: jest.fn(),
      toggleSlip: jest.fn(),
      togglePlay: jest.fn(),
      setDeckEq: jest.fn(),
      setDeckFilter: jest.fn(),
      setDeckGain: jest.fn(),
      setDeckSend: jest.fn(),
      setBpm: jest.fn(),
      sync: jest.fn(),
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
            setSaturation: jest.fn(),
            setMasterOutputLevel: jest.fn(),
            brakeDeck: jest.fn(),
            spinbackDeck: jest.fn(),
            transformDeck: jest.fn(),
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
        { provide: PlayerService, useValue: {} },
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
    expect(payload.deckA.samplerPads[0]).toBe(24);
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
      samplerPads: new Array(8).fill(null),
      hotCues: [12, null, null, null, null, null, null, null],
    }));

    component.handlePadPress('A', 1);

    expect(mockDeckService.setSamplerPad).toHaveBeenCalledWith('A', 1);
    expect(mockDeckService.setHotCue).not.toHaveBeenCalled();

    const event = { preventDefault: jest.fn() } as unknown as MouseEvent;
    component.clearPad('A', 1, event);

    expect(mockDeckService.clearSamplerPad).toHaveBeenCalledWith('A', 1);
    expect(mockDeckService.clearHotCue).not.toHaveBeenCalledWith('A', 1);
  });
});
