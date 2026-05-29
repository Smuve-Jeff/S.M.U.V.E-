import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatbotComponent } from './chatbot.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { LoggingService } from '../../services/logging.service';
import { signal } from '@angular/core';
import { initialProfile } from '../../types/profile.types';

describe('ChatbotComponent', () => {
  let component: ChatbotComponent;
  let fixture: ComponentFixture<ChatbotComponent>;
  let userProfileServiceMock: any;
  let aiServiceMock: any;

  beforeEach(async () => {
    userProfileServiceMock = {
      profile: signal(initialProfile),
      updateProfile: jest.fn()
    };

    aiServiceMock = {
      conversationalTier: signal('Standard'),
      processCommand: jest.fn()
    };

    const uiServiceMock = {
      isMobile: signal(false)
    };

    const audioEngineServiceMock = {};
    const speechSynthesisServiceMock = {
      speak: jest.fn()
    };
    const loggingServiceMock = {
      error: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ChatbotComponent],
      providers: [
        { provide: UserProfileService, useValue: userProfileServiceMock },
        { provide: AiService, useValue: aiServiceMock },
        { provide: UIService, useValue: uiServiceMock },
        { provide: AudioEngineService, useValue: audioEngineServiceMock },
        { provide: SpeechSynthesisService, useValue: speechSynthesisServiceMock },
        { provide: LoggingService, useValue: loggingServiceMock },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatbotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle mimic settings correctly with all required AI properties', () => {
    component.toggleMimic();
    expect(userProfileServiceMock.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        ai: expect.objectContaining({
          aiMimicEnabled: true,
          commanderPersona: 'Elite',
          aiConversationalTier: 'Standard'
        })
      })
    }));
  });

  it('should toggle profanity settings correctly with all required AI properties', () => {
    component.toggleProfanity();
    expect(userProfileServiceMock.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        ai: expect.objectContaining({
          aiProfanityEnabled: true,
          commanderPersona: 'Elite',
          aiConversationalTier: 'Standard'
        })
      })
    }));
  });

  it('should toggle KB write access correctly with all required AI properties', () => {
    component.toggleKbWriteAccess();
    expect(userProfileServiceMock.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        ai: expect.objectContaining({
          kbWriteAccess: false, // initial is true
          commanderPersona: 'Elite',
          aiConversationalTier: 'Standard'
        })
      })
    }));
  });
});
