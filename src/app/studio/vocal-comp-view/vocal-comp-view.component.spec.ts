import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VocalCompViewComponent } from './vocal-comp-view.component';
import { SmartRecordingService, CompGroup, CompTake } from '../smart-recording.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SnackbarService } from '../../services/snackbar.service';
import { LoggingService } from '../../services/logging.service';

describe('VocalCompViewComponent', () => {
  let component: VocalCompViewComponent;
  let fixture: ComponentFixture<VocalCompViewComponent>;
  let smartRecording: jest.Mocked<SmartRecordingService>;
  let snackbar: jest.Mocked<SnackbarService>;

  const mockTakes: CompTake[] = [
    {
      id: 'take-1',
      takeNumber: 1,
      label: 'Take 1',
      blob: new Blob(['test-audio-1']),
      url: 'blob:mock-url-1',
      durationMs: 5000,
      peakDbL: -6,
      peakDbR: -7,
      isCompSelection: false,
      isMuted: false,
      regions: [],
    },
    {
      id: 'take-2',
      takeNumber: 2,
      label: 'Take 2',
      blob: new Blob(['test-audio-2']),
      url: 'blob:mock-url-2',
      durationMs: 4200,
      peakDbL: -8,
      peakDbR: -9,
      isCompSelection: true,
      isMuted: false,
      regions: [],
    },
  ];

  const mockGroup: CompGroup = {
    id: 'group-1',
    sectionLabel: 'Verse 1',
    trackName: 'Vocal Track',
    trackId: 'vocal-track',
    takes: mockTakes,
    createdAt: Date.now() - 60000,
    selectedTakeId: 'take-2',
    fxSlots: [],
    activeRegionId: null,
    baseStartBeat: 0,
    compRegions: [],
  };

  beforeEach(async () => {
    const mockCompGroups = Object.assign(
      jest.fn().mockReturnValue([mockGroup]),
      { update: jest.fn(), set: jest.fn() }
    );

    smartRecording = {
      compGroups: mockCompGroups,
      activeCompGroupId: jest.fn().mockReturnValue('group-1'),
      startNewCompGroup: jest.fn(),
      deleteCompGroup: jest.fn(),
      selectCompTake: jest.fn(),
      toggleTakeMute: jest.fn(),
      deleteTake: jest.fn(),
      createEmptyGroup: jest.fn(),
    } as any;

    snackbar = {
      info: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    } as any;

    const audioEngine = {
      ctx: null,
      isPlaying: jest.fn().mockReturnValue(false),
    } as any;

    const logging = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    await TestBed.configureTestingModule({
      imports: [VocalCompViewComponent],
      providers: [
        { provide: SmartRecordingService, useValue: smartRecording },
        { provide: AudioEngineService, useValue: audioEngine },
        { provide: SnackbarService, useValue: snackbar },
        { provide: LoggingService, useValue: logging },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VocalCompViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should auto-select first group on init', () => {
    expect(component.selectedGroup()).toBeDefined();
    expect(component.selectedGroup()?.sectionLabel).toBe('Verse 1');
  });

  it('should return takes from the selected group', () => {
    expect(component.takes()).toHaveLength(2);
  });

  it('should find the comp-selected take', () => {
    const comp = component.compTake();
    expect(comp).toBeDefined();
    expect(comp?.id).toBe('take-2');
  });

  it('should report correct take count', () => {
    expect(component.takeCount()).toBe(2);
    expect(component.hasTakes()).toBe(true);
  });

  it('should set selectedGroupId when selecting a group', () => {
    component.selectGroup('group-1');
    expect(component.selectedGroupId()).toBe('group-1');
    expect(component.compareMode()).toBe('off');
  });

  it('should create new comp group', () => {
    component.createNewGroup();
    expect(smartRecording.startNewCompGroup).toHaveBeenCalledWith(
      'vocal-track',
      'Vocal Track',
      'Section 2'
    );
    expect(snackbar.info).toHaveBeenCalledWith('New comp group created');
  });

  it('should delete a group', () => {
    component.deleteGroup('group-1');
    expect(smartRecording.deleteCompGroup).toHaveBeenCalledWith('group-1');
    expect(snackbar.info).toHaveBeenCalledWith('Group "Verse 1" deleted');
  });

  it('should rename a group', () => {
    component.renameGroup('group-1', 'Chorus 1');
    expect(smartRecording.compGroups).toHaveBeenCalled();
  });

  it('should select a take as comp', () => {
    component.selectTake('take-1');
    expect(smartRecording.selectCompTake).toHaveBeenCalledWith('group-1', 'take-1');
    expect(component.compareMode()).toBe('off');
  });

  it('should toggle mute on a take', () => {
    component.toggleMute('group-1', 'take-1');
    expect(smartRecording.toggleTakeMute).toHaveBeenCalledWith('group-1', 'take-1');
  });

  it('should delete a take', () => {
    component.deleteTake('group-1', 'take-1');
    expect(smartRecording.deleteTake).toHaveBeenCalledWith('group-1', 'take-1');
    expect(snackbar.info).toHaveBeenCalledWith('Take deleted');
  });

  it('should cycle through compare modes', () => {
    expect(component.compareMode()).toBe('off');
    component.toggleCompare();
    expect(component.compareMode()).toBe('a-b');
    component.toggleCompare();
    expect(component.compareMode()).toBe('all');
    component.toggleCompare();
    expect(component.compareMode()).toBe('off');
  });

  it('should set reference take for A/B comparison', () => {
    component.setReferenceTake('take-1');
    expect(component.abReferenceTakeId()).toBe('take-1');
    expect(snackbar.info).toHaveBeenCalledWith('Reference take set for A/B comparison');
  });

  it('should assemble comp URL from selected take', () => {
    const url = component.assembleComp();
    expect(url).toBe('blob:mock-url-2'); // comp-selected take
  });

  it('should return empty string if no comp group selected', () => {
    component.selectGroup('nonexistent');
    const url = component['_currentAudio'] = null;
    const result = component.assembleComp();
    expect(result).toBe('');
  });

  it('should format duration in M:SS format', () => {
    expect(component.formatDuration(5000)).toBe('0:05');
    expect(component.formatDuration(65000)).toBe('1:05');
    expect(component.formatDuration(120000)).toBe('2:00');
  });

  it('should return distinct colors for take numbers', () => {
    const color1 = component.getTakeColor(1);
    const color2 = component.getTakeColor(2);
    expect(color1).toBeDefined();
    expect(color2).toBeDefined();
    expect(color1).not.toBe(color2);
  });

  it('should generate waveform bars of length 48', () => {
    const bars = component.generateWaveformBars();
    expect(bars).toHaveLength(48);
    bars.forEach((b) => {
      expect(b).toBeGreaterThanOrEqual(0.05);
      expect(b).toBeLessThanOrEqual(1.0);
    });
  });

  it('should filter groups by search query', () => {
    component.searchQuery.set('Verse');
    expect(component.filteredGroups()).toHaveLength(1);
    component.searchQuery.set('Nonexistent');
    expect(component.filteredGroups()).toHaveLength(0);
  });

  it('should stop playback when stopPlayback is called', () => {
    const audioMock = { pause: jest.fn() } as any;
    (component as any)._currentAudio = audioMock;
    component.stopPlayback();
    expect(audioMock.pause).toHaveBeenCalled();
    expect((component as any)._currentAudio).toBeNull();
    expect(component.playingTakeId()).toBeNull();
  });
});
