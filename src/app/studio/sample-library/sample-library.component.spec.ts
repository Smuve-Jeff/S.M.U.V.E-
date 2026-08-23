import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { SampleLibraryComponent } from './sample-library.component';
import { AudioRecorderService } from '../audio-recorder.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SnackbarService } from '../../services/snackbar.service';
import { HapticService } from '../../services/haptic.service';

describe('SampleLibraryComponent', () => {
  let component: SampleLibraryComponent;
  let fixture: ComponentFixture<SampleLibraryComponent>;

  const mockRecorder = {
    isRecording: signal(false),
    getOfflineRecordings: jest.fn().mockResolvedValue([]),
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    revokeRecordingUrl: jest.fn(),
  };

  const mockMusicManager = {
    ensureTrack: jest.fn(),
    addAudioTrack: jest.fn(),
    selectedTrackId: signal<string | null>(null),
    setInstrument: jest.fn(),
    importAudio: jest.fn(),
  };

  // The powerhouse branch's preview synthesizes a one-shot through the live
  // engine, so ctx must expose the full WebAudio factory surface (the jest
  // setup provides a global MockAudioContext).
  const mockAudioEngine = {
    resume: jest.fn(),
    ctx: new (window as any).AudioContext(),
    masterGain: null,
  };

  const mockSnackbar = {
    success: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };

  const mockHaptic = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [SampleLibraryComponent],
      providers: [
        { provide: AudioRecorderService, useValue: mockRecorder },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: SnackbarService, useValue: mockSnackbar },
        { provide: HapticService, useValue: mockHaptic },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SampleLibraryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('pulls offline recordings metadata on mount', () => {
    expect(mockRecorder.getOfflineRecordings).toHaveBeenCalled();
  });

  it('builds category counts from the raw sample bank', () => {
    const cats = component.categories();
    const all = cats.find((c) => c.id === 'all');
    expect(all?.count).toBe(component.filteredSamples().length);
    expect(all!.count).toBeGreaterThan(10);
    expect(cats.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'drum',
        'bass',
        'keys',
        'lead',
        'pad',
        'vox',
        'vfx',
        'loop',
      ])
    );
  });

  it('shows every sample by default', () => {
    expect(component.filteredSamples().length).toBe(22);
  });

  it('filters samples by search query across name, id and tags', () => {
    component.searchQuery.set('808');
    const ids = component.filteredSamples().map((s) => s.id);
    expect(ids).toEqual(['kick']);

    component.searchQuery.set('sub');
    expect(component.filteredSamples().map((s) => s.id)).toEqual([
      'bass-sub',
    ]);
  });

  it('filters samples by category', () => {
    component.selectedCategory.set('bass');
    const ids = component.filteredSamples().map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['bass-sub', 'bass-reese']));
    expect(
      component.filteredSamples().every((s) => s.category === 'bass')
    ).toBe(true);
  });

  it('toggles a tag filter and fires light haptics', () => {
    component.toggleTag('sub');
    expect(component.selectedTag()).toBe('sub');
    expect(mockHaptic.light).toHaveBeenCalled();
    component.toggleTag('sub');
    expect(component.selectedTag()).toBeNull();
  });

  it('loads a sample onto a track mapped to a real instrument preset', () => {
    component.loadSample('kick');
    expect(mockAudioEngine.resume).toHaveBeenCalled();
    // The powerhouse branch maps library IDs to real preset IDs.
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('trap-kit-elite');
    expect(mockSnackbar.success).toHaveBeenCalledWith(
      'Sample loaded: 808 KICK → trap-kit-elite'
    );
  });

  it('falls back to the raw sample id when no preset mapping exists', () => {
    component.loadSample('unknown-sample');
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith(
      'unknown-sample'
    );
  });

  it('previews a sample audibly and clears the previewing state after the timeout', () => {
    jest.useFakeTimers();
    component.previewSample('snare');
    expect(component.previewingId()).toBe('snare');
    expect(mockHaptic.light).toHaveBeenCalled();
    expect(mockSnackbar.info).toHaveBeenCalledWith('Previewing SNARE 909');
    jest.advanceTimersByTime(500);
    expect(component.previewingId()).toBeNull();
    jest.useRealTimers();
  });

  it('does not restart a preview that is already playing', () => {
    component.previewSample('snare');
    mockSnackbar.info.mockClear();
    component.previewSample('snare');
    expect(mockSnackbar.info).not.toHaveBeenCalled();
  });

  it('loads a touch card once and suppresses the follow-up click event', () => {
    const event = { pointerType: 'touch', target: document.createElement('div') } as any;

    component.onCardPointerDown(event, 'kick');
    component.onCardPointerUp(event, 'kick');
    component.onCardClick({ target: document.createElement('div') } as any, 'kick');

    expect(mockMusicManager.ensureTrack).toHaveBeenCalledTimes(1);
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('trap-kit-elite');
  });

  it('uses long-press on touch cards for preview instead of loading', () => {
    jest.useFakeTimers();
    const event = { pointerType: 'touch', target: document.createElement('div') } as any;

    component.onCardPointerDown(event, 'snare');
    jest.advanceTimersByTime(450);
    component.onCardPointerUp(event, 'snare');
    component.onCardClick({ target: document.createElement('div') } as any, 'snare');

    expect(mockSnackbar.info).toHaveBeenCalledWith('Previewing SNARE 909');
    expect(mockMusicManager.ensureTrack).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not suppress the next tap after a touch gesture is cancelled', () => {
    const event = { pointerType: 'touch', target: document.createElement('div') } as any;

    component.onCardPointerDown(event, 'kick');
    component.onCardPointerCancel();
    component.onCardClick({ target: document.createElement('div') } as any, 'kick');

    expect(mockMusicManager.ensureTrack).toHaveBeenCalledTimes(1);
    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('trap-kit-elite');
  });

  it('sets drag payload metadata for drag-to-track', () => {
    const setData = jest.fn();
    const dt = {
      setData,
      effectAllowed: '',
      setDragImage: jest.fn(),
    };
    component.onDragStart({ dataTransfer: dt } as any, 'kick', '808 KICK');
    expect(component.dragSampleId()).toBe('kick');
    expect(setData).toHaveBeenCalledWith(
      'application/smuve-sample',
      JSON.stringify({ id: 'kick', name: '808 KICK' })
    );
    expect(dt.effectAllowed).toBe('copy');
  });

  it('clears the drag state on drag end', () => {
    component.dragSampleId.set('kick');
    component.onDragEnd();
    expect(component.dragSampleId()).toBeNull();
  });
});
