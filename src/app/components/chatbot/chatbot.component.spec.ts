import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatbotComponent } from './chatbot.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import { LoggingService } from '../../services/logging.service';
import { signal } from '@angular/core';
import { initialProfile } from '../../types/profile.types';
import { ArtistProfileFinetuneService } from '../../services/artist-profile-finetune.service';

describe('ChatbotComponent', () => {
  let component: ChatbotComponent;
  let fixture: ComponentFixture<ChatbotComponent>;
  let userProfileServiceMock: any;
  let aiServiceMock: any;
  let speechRecognitionServiceMock: any;
  let speechSynthesisServiceMock: any;

  beforeEach(async () => {
    userProfileServiceMock = {
      profile: signal(initialProfile),
      updateProfile: jest.fn(),
    };

    aiServiceMock = {
      conversationalTier: signal('Standard'),
      personaDirectives: jest.fn(() => 'Keep S.M.U.V.E. direct, precise, and in character.'),
      processCommand: jest.fn(),
    };

    const uiServiceMock = {
      isMobile: signal(false),
    };

    const audioEngineServiceMock = {
      // Sprint A4 — MusicManagerService.structureSongLengthEffect calls
      // engine.setSongLengthSteps() while instantiating; mock it so the
      // chatbot component test can compile without throwing.
      setSongLengthSteps: jest.fn(),
    };
    speechRecognitionServiceMock = {
      isSupported: signal(true),
      isListening: signal(false),
      startListening: jest.fn(),
      stopListening: jest.fn(),
    };
    speechSynthesisServiceMock = {
      speak: jest.fn(),
      cancel: jest.fn(),
      liveVoice: signal(null),
      isSpeaking: signal(false),
    };
    const loggingServiceMock = {
      error: jest.fn(),
      warn: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ChatbotComponent],
      providers: [
        { provide: UserProfileService, useValue: userProfileServiceMock },
        { provide: AiService, useValue: aiServiceMock },
        { provide: UIService, useValue: uiServiceMock },
        { provide: AudioEngineService, useValue: audioEngineServiceMock },
        {
          provide: SpeechSynthesisService,
          useValue: speechSynthesisServiceMock,
        },
        {
          provide: SpeechRecognitionService,
          useValue: speechRecognitionServiceMock,
        },
        { provide: LoggingService, useValue: loggingServiceMock },
        {
          provide: ArtistProfileFinetuneService,
          useValue: { promptBlock: jest.fn(() => 'SONIC NON-NEGOTIABLE: preserve the room tone.') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatbotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('adds existing artist-specific fine-tuning context to the live AI prompt', () => {
    const prompt = (component as any).buildMasterPrompt('make my next beat');

    expect(prompt).toContain('S.M.U.V.E ARTIST FINE-TUNE');
    expect(prompt).toContain('SONIC NON-NEGOTIABLE: preserve the room tone.');
    expect(prompt).toContain('the artist’s explicit request takes priority');
  });

  it('keeps recent completed turns in follow-up prompts without duplicating the current request', () => {
    component.messages.set([
      {
        id: 'welcome',
        role: 'assistant',
        text: 'Welcome back.',
        timestamp: 1,
        category: 'system',
      },
      {
        id: 'user-1',
        role: 'user',
        text: 'Make the verse warmer.',
        timestamp: 2,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        text: 'I will soften the keys and keep the vocal forward.',
        timestamp: 3,
      },
      {
        id: 'user-2',
        role: 'user',
        text: 'What about the chorus?',
        timestamp: 4,
      },
    ] as any);

    const prompt = (component as any).buildMasterPrompt('What about the chorus?');

    expect(prompt).toContain('RECENT CONVERSATION');
    expect(prompt).toContain('Artist: Make the verse warmer.');
    expect(prompt).toContain(
      'S.M.U.V.E: I will soften the keys and keep the vocal forward.'
    );
    expect(prompt.split('What about the chorus?')).toHaveLength(2);
  });

  it('adds dictated words to the editable draft and stops active voice capture', () => {
    component.userInput = 'Tune the hook';
    component.toggleVoiceInput();

    expect(speechSynthesisServiceMock.cancel).toHaveBeenCalledTimes(1);
    expect(speechRecognitionServiceMock.startListening).toHaveBeenCalledTimes(1);
    const onResult = speechRecognitionServiceMock.startListening.mock.calls[0][0];
    onResult('raise the chorus');
    expect(component.userInput).toBe('Tune the hook raise the chorus');

    speechRecognitionServiceMock.isListening.set(true);
    component.toggleVoiceInput();
    expect(speechRecognitionServiceMock.stopListening).toHaveBeenCalledTimes(1);
  });

  it('lets the artist stop S.M.U.V.E. voice playback', () => {
    component.stopVoiceOutput();
    expect(speechSynthesisServiceMock.cancel).toHaveBeenCalledTimes(1);
  });

  it('should toggle mimic settings correctly with all required AI properties', () => {
    component.toggleMimic();
    expect(userProfileServiceMock.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          ai: expect.objectContaining({
            aiMimicEnabled: true,
            commanderPersona: 'Ominous Musical GOD',
            aiConversationalTier: 'Standard',
          }),
        }),
      })
    );
  });

  it('should toggle profanity settings correctly with all required AI properties', () => {
    component.toggleProfanity();
    expect(userProfileServiceMock.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          ai: expect.objectContaining({
            aiProfanityEnabled: false, // default is now true — toggle turns it off
            commanderPersona: 'Ominous Musical GOD',
            aiConversationalTier: 'Standard',
          }),
        }),
      })
    );
  });

  it('should toggle KB write access correctly with all required AI properties', () => {
    component.toggleKbWriteAccess();
    expect(userProfileServiceMock.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          ai: expect.objectContaining({
            kbWriteAccess: false, // initial is true
            commanderPersona: 'Ominous Musical GOD',
            aiConversationalTier: 'Standard',
          }),
        }),
      })
    );
  });

  it('opens with a profile read-back once the uplink has committed a reading', () => {
    userProfileServiceMock.profile.set({
      ...initialProfile,
      artistName: 'Nova Vale',
      primaryGenre: 'Electronic',
      profileSetupCompleted: true,
      musicalJourney: {
        ...initialProfile.musicalJourney,
        signatureSound: 'warped tape 808s with choir pads',
        currentFocus: 'first official EP',
        personaSynthesis: {
          archetype: 'The Architect — precision-driven, technically focused creator',
          signatureTone: 'Calculated precision.',
          sonicSignature: 'warped tape 808s',
          aiPersonaProfile: 'S.M.U.V.E recognizes you as: The Architect.',
          recommendedStrategy: 'Priority: ship the EP.',
          suggestedGenres: ['Ambient'],
          productionAphorism: 'Craft first.',
        },
      },
    });

    (component as any).setWelcomeGreeting();

    const opening = component.messages()[0].text;
    expect(opening).toContain('PROFILE READING');
    expect(opening).toContain('ARCHETYPE: The Architect');
    expect(opening).toContain('CURRENT MISSION: first official EP');
  });

  it('keeps the roast as the whole greeting when no reading exists', () => {
    (component as any).setWelcomeGreeting();

    expect(component.messages()[0].text).not.toContain('PROFILE READING');
  });

  it('reads the artist’s own register for mimic mode only when mimic is enabled', () => {
    const completed = {
      ...initialProfile,
      artistName: 'Nova Vale',
      musicalJourney: {
        ...initialProfile.musicalJourney,
        vocalRange: 'Tenor (C3–C5)',
      },
    };
    userProfileServiceMock.profile.set(completed);

    // Mimic off — the default Ominous Protocol must never be replaced silently.
    expect((component as any).profileVoiceArchetype()).toBeNull();

    userProfileServiceMock.profile.set({
      ...completed,
      settings: {
        ...completed.settings,
        ai: { ...completed.settings.ai, aiMimicEnabled: true },
      },
    });
    expect((component as any).profileVoiceArchetype()).toBe(
      'Tenor Commander (Male)'
    );
  });

  it('says what mimic mode actually changes when the artist enables it', () => {
    userProfileServiceMock.profile.set({
      ...initialProfile,
      artistName: 'Nova Vale',
      musicalJourney: {
        ...initialProfile.musicalJourney,
        vocalRange: 'Tenor (C3–C5)',
      },
    });

    component.toggleMimic();

    const announcement = component.messages().at(-1)!;
    expect(announcement.text).toContain('MIMIC MODE ENGAGED');
    expect(announcement.text).toContain('Tenor Commander (Male)');
    // The character is never traded for the mirror.
    expect(announcement.text).toContain('arrogance stays mine');
  });

  it('reads the questionnaire’s own register options without collisions', () => {
    const map = (vocalRange: string) =>
      (component as any).archetypeForProfile({
        musicalJourney: { ...initialProfile.musicalJourney, vocalRange },
        primaryGenre: 'Pop',
      });

    expect(map('Mezzo-Soprano (A3–A5)')).toBe('Mezzo Strategist (Female)');
    expect(map('Soprano (C4–C6)')).toBe('Soprano Elite (Female)');
    expect(map('Baritone (A2–A4)')).toBe('Baritone Authority (Male)');
    expect(map('Falsetto')).toBe('Androgynous Oracle');
    expect(map('Spoken / Rap')).toBe('Tenor Commander (Male)');
    // “I don’t sing” carries no register — genre decides, not a guess.
    expect(map('Non-Vocalist')).toBe('Soprano Elite (Female)');
  });

  it('falls back to a genre-level register when no vocal answer exists', () => {
    const profile = {
      ...initialProfile,
      primaryGenre: 'Rock',
      musicalJourney: { ...initialProfile.musicalJourney, vocalRange: '' },
    };
    // No declared register at all → nothing to mimic.
    expect((component as any).archetypeForProfile({ ...profile, primaryGenre: '' })).toBeNull();
    expect((component as any).archetypeForProfile(profile)).toBe(
      'Baritone Authority (Male)'
    );
  });

  it('names the archetype in the live prompt so the model adapts in character', () => {
    userProfileServiceMock.profile.set({
      ...initialProfile,
      artistName: 'Nova Vale',
      musicalJourney: {
        ...initialProfile.musicalJourney,
        personaSynthesis: {
          archetype: 'The Architect — precision-driven, technically focused creator',
          signatureTone: 'Calculated precision.',
          sonicSignature: 'warped tape 808s',
          aiPersonaProfile: 'x',
          recommendedStrategy: 'y',
          suggestedGenres: ['Ambient'],
          productionAphorism: 'Craft first.',
        },
      },
    });

    const prompt = (component as any).buildMasterPrompt('what is my angle?');
    expect(prompt).toContain('PROFILE READING MANDATE');
    expect(prompt).toContain('The Architect');
    expect(prompt).toContain('aimed at the work, never at the person');
  });

  it('should keep voice shape-shift permanently enabled (core S.M.U.V.E. identity)', () => {
    expect(
      userProfileServiceMock.profile().settings.ai.aiVoiceShapeShiftEnabled
    ).toBe(true);

    component.toggleVoiceShift();

    // S.M.U.V.E. identity — toggle is a no-op; the value stays true and
    // no profile update is dispatched.
    expect(userProfileServiceMock.updateProfile).not.toHaveBeenCalled();
    expect(
      userProfileServiceMock.profile().settings.ai.aiVoiceShapeShiftEnabled
    ).toBe(true);
  });
});
