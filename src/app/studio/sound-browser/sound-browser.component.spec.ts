import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { SoundBrowserComponent } from './sound-browser.component';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SmartSoundService } from '../smart-sound.service';
import { AiMixAssistantService } from '../effects/ai-mix-assistant.service';

const presets: InstrumentPreset[] = [
  {
    id: 'deep-bass',
    name: 'Deep Bass',
    type: 'synth',
    category: 'bass',
    tags: ['bass', 'sub'],
  },
  {
    id: 'saw-lead',
    name: 'Saw Lead',
    type: 'synth',
    category: 'lead',
    tags: ['lead', 'bright'],
  },
  {
    id: 'glass-pad',
    name: 'Glass Pad',
    type: 'synth',
    category: 'pad',
    tags: ['pad', 'ambient'],
  },
];

describe('SoundBrowserComponent', () => {
  let component: SoundBrowserComponent;
  let fixture: ComponentFixture<SoundBrowserComponent>;

  const mockInstruments = {
    getPresets: jest.fn().mockReturnValue(presets),
    audition: jest.fn().mockResolvedValue(undefined),
  };

  const mockMusicManager = {
    ensureTrack: jest.fn(),
    addAudioTrack: jest.fn(),
    selectedTrackId: signal<string | null>(null),
    setInstrument: jest.fn(),
    importAudio: jest.fn(),
  };

  const mockAudioEngine = { resume: jest.fn(), ctx: {} };

  const mockSmartSound = {
    favoriteIds: signal(new Set<string>()),
    recentIds: signal<string[]>([]),
    searchQuery: signal(''),
    activeGenre: signal<string | null>(null),
    activeMood: signal<string | null>(null),
    installedPacks: signal<any[]>([]),
    curatedPacks: signal<any[]>([]),
    installingPack: signal<any>(null),
    installedPackPresets: signal(new Set<string>()),
    favorites: signal<any[]>([]),
    availablePacks: signal<any[]>([]),
    recentSounds: signal<any[]>([]),
    findSimilar: jest.fn().mockReturnValue([]),
    smartSearch: jest.fn().mockReturnValue([]),
    toggleFavorite: jest.fn(),
    recordUsage: jest.fn(),
    isFavorite: jest.fn().mockReturnValue(false),
    uninstallPack: jest.fn(),
    installPack: jest.fn(),
  };

  const mockAiMix = {
    recommendInstruments: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [SoundBrowserComponent],
      providers: [
        { provide: InstrumentsService, useValue: mockInstruments },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: SmartSoundService, useValue: mockSmartSound },
        { provide: AiMixAssistantService, useValue: mockAiMix },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SoundBrowserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lists every preset by default', () => {
    expect(component.presets()).toHaveLength(3);
  });

  it('derives the tag cloud from preset tags', () => {
    expect(component.allTags()).toEqual(
      expect.arrayContaining(['bass', 'sub', 'lead', 'bright', 'pad', 'ambient'])
    );
  });

  it('filters presets by search query', () => {
    component.searchQuery.set('pad');
    const ids = component.presets().map((p) => p.id);
    expect(ids).toEqual(['glass-pad']);
  });

  it('filters presets by category', () => {
    component.selectedCategory.set('lead');
    const ids = component.presets().map((p) => p.id);
    expect(ids).toEqual(['saw-lead']);
  });

  it('filters presets by tag', () => {
    component.toggleTag('sub');
    const ids = component.presets().map((p) => p.id);
    expect(ids).toEqual(['deep-bass']);
    component.toggleTag('sub');
    expect(component.presets()).toHaveLength(3);
  });

  it('filters to installed sound pack presets when enabled', () => {
    mockSmartSound.installedPackPresets.set(new Set(['deep-bass']));
    component.showOnlyInstalledPacks.set(true);
    const ids = component.presets().map((p) => p.id);
    expect(ids).toEqual(['deep-bass']);
  });

  it('selects a preset onto a new track when no track is armed', () => {
    component.selectPreset(presets[0]);
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('deep-bass');
    expect(mockMusicManager.setInstrument).not.toHaveBeenCalled();
  });

  it('applies a preset to the selected track when one is armed', () => {
    mockMusicManager.selectedTrackId.set('track-1');
    component.selectPreset(presets[1]);
    expect(mockMusicManager.setInstrument).toHaveBeenCalledWith(
      'track-1',
      'saw-lead'
    );
    expect(mockMusicManager.ensureTrack).not.toHaveBeenCalled();
  });

  it('adds a preset as a brand new track', () => {
    component.addAsNewTrack(presets[2]);
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('glass-pad');
  });

  it('auditions a preset and clears the previewing state after the timeout', async () => {
    jest.useFakeTimers();
    const stopPropagation = jest.fn();
    await component.previewPreset(presets[0], { stopPropagation } as any);
    expect(stopPropagation).toHaveBeenCalled();
    expect(mockInstruments.audition).toHaveBeenCalledWith('deep-bass');
    expect(component.previewingId()).toBe('deep-bass');
    jest.advanceTimersByTime(600);
    expect(component.previewingId()).toBeNull();
    jest.useRealTimers();
  });

  it('selects a touch card once and suppresses the synthetic click', () => {
    const event = { pointerType: 'touch', target: document.createElement('div') } as any;

    component.onCardPointerDown(event, presets[0]);
    component.onCardPointerUp(event, presets[0]);
    component.onCardClick({ target: document.createElement('div') } as any, presets[0]);

    expect(mockMusicManager.ensureTrack).toHaveBeenCalledTimes(1);
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('deep-bass');
  });

  it('uses long-press on touch cards to preview instead of selecting', async () => {
    jest.useFakeTimers();
    const event = { pointerType: 'touch', target: document.createElement('div') } as any;

    component.onCardPointerDown(event, presets[1]);
    jest.advanceTimersByTime(450);
    await Promise.resolve();
    component.onCardPointerUp(event, presets[1]);
    component.onCardClick({ target: document.createElement('div') } as any, presets[1]);

    expect(mockInstruments.audition).toHaveBeenCalledWith('saw-lead');
    expect(mockMusicManager.ensureTrack).not.toHaveBeenCalled();
    expect(mockMusicManager.setInstrument).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('toggles a preset favorite and records usage', () => {
    component.toggleFavorite('deep-bass');
    expect(mockSmartSound.toggleFavorite).toHaveBeenCalledWith('deep-bass');
    expect(mockSmartSound.recordUsage).toHaveBeenCalledWith('deep-bass');
  });

  it('delegates favorite lookups to the smart sound service', () => {
    mockSmartSound.isFavorite.mockReturnValue(true);
    expect(component.isFavorite('deep-bass')).toBe(true);
    expect(mockSmartSound.isFavorite).toHaveBeenCalledWith('deep-bass');
  });

  it('shows similar sounds for a preset and clears the panel', () => {
    mockSmartSound.findSimilar.mockReturnValue([presets[1]]);
    component.showSimilar('deep-bass');
    expect(component.similarToId()).toBe('deep-bass');
    expect(component.similarSounds()).toHaveLength(1);
    component.clearSimilar();
    expect(component.similarToId()).toBeNull();
    expect(component.similarSounds()).toEqual([]);
  });

  it('sets the genre filter via the smart sound service', () => {
    component.selectGenre('trap');
    expect(mockSmartSound.activeGenre()).toBe('trap');
    component.selectGenre('all');
    expect(mockSmartSound.activeGenre()).toBeNull();
  });

  it('sets the mood filter via the smart sound service', () => {
    component.selectMood('chill');
    expect(mockSmartSound.activeMood()).toBe('chill');
    component.selectMood('all');
    expect(mockSmartSound.activeMood()).toBeNull();
  });

  it('runs an AI search with the current query', () => {
    component.searchQuery.set('dark');
    component.aiSearch();
    expect(mockSmartSound.smartSearch).toHaveBeenCalledWith('dark');
  });

  it('toggles the favorites-only filter', () => {
    component.toggleFavFilter();
    expect(component.showFavs()).toBe(true);
    component.toggleFavFilter();
    expect(component.showFavs()).toBe(false);
  });

  it('sets drag payload metadata for preset cards', () => {
    const setData = jest.fn();
    component.onDragStart(
      { dataTransfer: { setData } } as any,
      presets[0]
    );
    expect(setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify({ type: 'instrument-preset', presetId: 'deep-bass' })
    );
  });
});
