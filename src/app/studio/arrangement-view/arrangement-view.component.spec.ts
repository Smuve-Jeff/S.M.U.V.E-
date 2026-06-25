import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ArrangementViewComponent } from './arrangement-view.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HistoryService } from '../../services/history.service';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { HapticService } from '../../services/haptic.service';
import { AiService } from '../../services/ai.service';

describe('ArrangementViewComponent', () => {
  let component: ArrangementViewComponent;
  let fixture: ComponentFixture<ArrangementViewComponent>;

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
    engine: { ctx: { createAnalyser: jest.fn() } },
    musicManager: { addAutomationLane: jest.fn() }
  };

  const mockMusicManager = {
    tracks: signal([{ id: '1', name: 'Lead', clips: [], mute: false, solo: false }]),
    selectedTrackId: signal('1'),
    currentStep: signal(0),
    ensureTrack: jest.fn(),
    removeTrack: jest.fn(),
    removeClip: jest.fn(),
    toggleMute: jest.fn(),
    toggleSolo: jest.fn(),
    takesExpanded: signal({}),
    addTrack: jest.fn(),
  };

  const mockHistory = {
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: signal(false),
    canRedo: signal(false),
    lastActionName: signal(''),
  };

  const mockEnhancedGestures = {
    handlePinch: jest.fn(),
    zoomLevel: signal(1.0),
    verticalZoomLevel: signal(1.0)
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
    impact: jest.fn()
  };

  const mockAiService = {
     getProductionSmartAssist: jest.fn()
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArrangementViewComponent, CommonModule, FormsModule],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: { tempo: signal(124), visualStep: signal(0) } },
        { provide: HistoryService, useValue: mockHistory },
        { provide: EnhancedTouchGestureService, useValue: mockEnhancedGestures },
        { provide: HapticService, useValue: mockHaptic },
        { provide: AiService, useValue: mockAiService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ArrangementViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call removeTrack', () => {
    window.confirm = jest.fn().mockReturnValue(true);
    component.removeTrack('1', new MouseEvent('click') as any);
    expect(mockMusicManager.removeTrack).toHaveBeenCalledWith('1');
  });
});
