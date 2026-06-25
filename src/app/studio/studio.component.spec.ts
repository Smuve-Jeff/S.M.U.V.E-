import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudioComponent } from './studio.component';
import { AudioSessionService } from './audio-session.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService } from '../services/ai.service';
import { UIService } from '../services/ui.service';
import { NotificationService } from '../services/notification.service';
import { MusicManagerService } from '../services/music-manager.service';
import { UserProfileService } from '../services/user-profile.service';
import { AiCopilotService } from './ai-copilot.service';
import { HapticService } from '../services/haptic.service';
import { TouchGestureService } from '../services/touch-gesture.service';
import { SequencerService } from './sequencer.service';
import { InteractionDialogService } from '../services/interaction-dialog.service';
import { ProjectTemplateService } from '../services/project-template.service';
import { SnackbarService } from '../services/snackbar.service';
import { ActivatedRoute, Router } from '@angular/router';
import { signal, Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

describe('StudioComponent', () => {
  let component: StudioComponent;
  let fixture: ComponentFixture<StudioComponent>;

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    stop: jest.fn(),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
  };

  const mockAudioEngine = {
    tempo: signal(124),
    performanceTier: signal('ultra'),
    visualStep: signal(0),
    resume: jest.fn(),
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: AiService, useValue: {} },
        { provide: UIService, useValue: { isCompactMobile: () => false } },
        { provide: NotificationService, useValue: {} },
        { provide: MusicManagerService, useValue: { currentStep: signal(0) } },
        { provide: UserProfileService, useValue: { profile: signal({}) } },
        { provide: AiCopilotService, useValue: {} },
        { provide: HapticService, useValue: mockHaptic },
        { provide: TouchGestureService, useValue: {} },
        { provide: SequencerService, useValue: {} },
        { provide: InteractionDialogService, useValue: {} },
        { provide: ProjectTemplateService, useValue: { templates: [] } },
        { provide: SnackbarService, useValue: { info: jest.fn() } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => 'arrangement' }), snapshot: { queryParamMap: { get: () => 'arrangement' } } } },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).overrideComponent(StudioComponent, { set: { imports: [], template: '<div></div>' } })
    .compileComponents();

    fixture = TestBed.createComponent(StudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
