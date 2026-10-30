import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatbotComponent } from './chatbot.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import { LoggingService } from '../../services/logging.service';
import { UserStoreService } from '../../services/user-store.service';
import { signal } from '@angular/core';
import { initialProfile } from '../../types/profile.types';
import { ArtistProfileFinetuneService } from '../../services/artist-profile-finetune.service';
import { SmuveTotalControlService } from '../../services/smuve-total-control.service';

describe('ChatbotComponent', () => {
  let component: ChatbotComponent;
  let fixture: ComponentFixture<ChatbotComponent>;
  let userProfileServiceMock: any;
  let aiServiceMock: any;
  let speechRecognitionServiceMock: any;
  let speechSynthesisServiceMock: any;
  let finetuneMock: any;
  let uiServiceMock: any;

  beforeEach(async () => {
    localStorage.clear();
    userProfileServiceMock = {
      profile: signal(initialProfile),
      updateProfile: jest.fn(),
    };

    aiServiceMock = {
      conversationalTier: signal('Standard'),
      personaDirectives: jest.fn(() => 'Keep S.M.U.V.E. direct, precise, and in character.'),
      processCommand: jest.fn(),
    };

    // Mutable calibration signal: tests flip it to foundational/partial/
    // calibrated and assert the chat prompt and ADAPTED badge follow.
    finetuneMock = {
      promptBlock: jest.fn(() => 'SONIC NON-NEGOTIABLE: preserve the room tone.'),
      profileCalibration: signal({
        state: 'foundational',
        completeness: 12,
        sharing: true,
      }),
    };

    uiServiceMock = {
      isMobile: signal(false),
      pendingChatPrompt: signal<string | null>(null),
      takePendingChatPrompt: jest.fn(() => null),
      openChatbot: jest.fn(),
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
      capability: signal<string>('ready'),
      capabilityMessage: jest.fn(() => 'Voice input ready.'),
      startListening: jest.fn(),
      stopListening: jest.fn(),
    };
    speechSynthesisServiceMock = {
      speak: jest.fn(),
      cancel: jest.fn(),
      isSupported: signal(true),
      outputCapability: signal<string>('ready'),
      liveVoice: signal(null),
      isSpeaking: signal(false),
      // Voice Lab surface.
      archetypeCatalog: jest.fn(() => [
        {
          name: 'Ominous Protocol',
          description: 'The signature persona.',
          gender: 'neutral',
          texture: 'plain',
        },
        {
          name: 'Creature',
          description: 'Subterranean growl.',
          gender: 'creature',
          texture: 'growl',
        },
      ]),
      availableVoiceNames: jest.fn(() => ['Fake Voice A', 'Fake Voice B']),
      setArchetype: jest.fn(),
      clearArchetypePin: jest.fn(),
      pinnedArchetypeName: jest.fn(() => null),
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
          useValue: finetuneMock,
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

  it('re-reads a committed profile change and says what moved', () => {
    userProfileServiceMock.profile.set({
      ...initialProfile,
      artistName: 'Nova Vale',
      profileSetupCompleted: true,
      musicalJourney: {
        ...initialProfile.musicalJourney,
        signatureSound: 'warped tape 808s with choir pads',
        currentFocus: 'first official EP',
      },
    });

    (component as any).announceProfileRevision();

    const receipt = component.messages().at(-1)!;
    expect(receipt.text).toContain('PROFILE REVISION');
    expect(receipt.text).toContain('signature sound');
    expect(receipt.text).toContain('warped tape 808s with choir pads');
    expect(receipt.text).toContain('current focus');

    // One receipt per revision, not one per render.
    (component as any).announceProfileRevision();
    expect(
      component.messages().filter((message) => message.text.includes('PROFILE REVISION'))
    ).toHaveLength(1);
  });

  it('sends a question queued by another surface, exactly once', () => {
    const send = jest.spyOn(component, 'sendMessage').mockResolvedValue(undefined);
    uiServiceMock.takePendingChatPrompt.mockReturnValue(
      'S.M.U.V.E., work the Mix Bus room with me.'
    );

    (component as any).consumeQueuedPrompt();

    expect(component.userInput).toBe('S.M.U.V.E., work the Mix Bus room with me.');
    expect(send).toHaveBeenCalledTimes(1);
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

  it('never sends local system notices or revision receipts back to the model', () => {
    component.messages.set([
      { id: 'u1', role: 'user', text: 'Make the verse warmer.', timestamp: 1 },
      { id: 'a1', role: 'assistant', text: 'Keys softened.', timestamp: 2 },
      {
        id: 'revision',
        role: 'assistant',
        text: '🧠 PROFILE REVISION — signature sound changed.',
        timestamp: 3,
        category: 'system',
      },
      { id: 'u2', role: 'user', text: 'What about the chorus?', timestamp: 4 },
    ] as any);

    const prompt = (component as any).buildMasterPrompt('What about the chorus?');

    expect(prompt).toContain('Artist: Make the verse warmer.');
    expect(prompt).not.toContain('PROFILE REVISION');
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

  it('explains a blocked microphone instead of leaving a dead mic button', () => {
    const blocked =
      'Microphone access is blocked. Allow the microphone for this site, then tap the mic again.';
    speechRecognitionServiceMock.capability.set('permission-denied');
    speechRecognitionServiceMock.capabilityMessage.mockReturnValue(blocked);
    speechRecognitionServiceMock.startListening.mockImplementation(
      (_onResult: (text: string) => void, onError: (error: any) => void) =>
        onError({ code: 'not-allowed', message: blocked })
    );

    component.toggleVoiceInput();
    fixture.detectChanges();

    // The blocked mic stays pressable so the artist can retry after fixing
    // access, and the reason is announced in the composer.
    expect(component.voiceInputPressable()).toBe(true);
    expect(component.voiceInputNotice()).toBe(blocked);
    const notice = fixture.nativeElement.querySelector(
      '[role="status"][aria-live="polite"]'
    );
    expect(notice?.textContent).toContain('Microphone access is blocked');
  });

  it('names the real reason when the shell has no usable dictation engine', () => {
    const reason =
      "Dictation isn't available inside the mobile app shell. Type your command here, or open S.M.U.V.E. in Chrome to dictate.";
    speechRecognitionServiceMock.isSupported.set(false);
    speechRecognitionServiceMock.capability.set('native-shell');
    speechRecognitionServiceMock.capabilityMessage.mockReturnValue(reason);

    expect(component.voiceInputPressable()).toBe(false);
    expect(component.voiceInputTitle()).toBe(reason);

    component.toggleVoiceInput();

    expect(speechRecognitionServiceMock.startListening).not.toHaveBeenCalled();
    expect(component.voiceInputNotice()).toBe(reason);
  });

  it('clears the notice once dictation delivers words', () => {
    speechRecognitionServiceMock.startListening.mockImplementation(
      (onResult: (text: string) => void) => onResult('open the mixer')
    );

    component.toggleVoiceInput();

    expect(component.voiceInputNotice()).toBe('');
    expect(component.userInput).toBe('open the mixer');
    expect(speechSynthesisServiceMock.cancel).toHaveBeenCalled();
  });

  it('badges voice morph as unavailable when the device has no speech engine', () => {
    speechSynthesisServiceMock.isSupported.set(false);
    fixture.detectChanges();

    expect(component.voiceOutputSupported()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[title^="Voice Morph: unavailable"]')
    ).toBeTruthy();

    speechSynthesisServiceMock.isSupported.set(true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[title^="Voice Morph: active"]')
    ).toBeTruthy();
  });

  it('badges voice morph as unavailable when the engine published no voices', () => {
    speechSynthesisServiceMock.outputCapability.set('no-voices');
    fixture.detectChanges();

    expect(component.voiceOutputCapability()).toBe('no-voices');
    expect(component.voiceOutputSupported()).toBe(false);
    expect(component.voiceOutputTitle()).toContain('no speech voices');
    expect(
      fixture.nativeElement.querySelector('[title^="Voice Morph: unavailable"]')
    ).toBeTruthy();
  });

  it('passes the live voice state to the brand mark', () => {
    const glyph = () =>
      fixture.nativeElement.querySelector('app-smuve-widget svg');

    expect(glyph().getAttribute('data-voice-state')).toBe('idle');

    speechSynthesisServiceMock.isSpeaking.set(true);
    fixture.detectChanges();
    expect(glyph().getAttribute('data-voice-state')).toBe('speaking');

    speechRecognitionServiceMock.isListening.set(true);
    fixture.detectChanges();
    expect(glyph().getAttribute('data-voice-state')).toBe('listening');
    expect(glyph().getAttribute('aria-label')).toContain('listening');
  });

  it('opens the Voice Lab with the tone roster and auditions one tone', () => {
    component.toggleVoiceLab();
    fixture.detectChanges();

    expect(component.voiceLabOpen()).toBe(true);
    expect(component.voiceLabArchetypes()).toHaveLength(2);
    expect(component.labVoiceCount()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Creature');

    component.auditionArchetype('Creature');

    expect(speechSynthesisServiceMock.speak).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ shapeShift: false, forceArchetype: 'Creature' })
    );
    // The notice names the delivery the artist is hearing.
    expect(component.voiceLabNotice()).toContain('growl');
  });

  it('runs the spectrum demo through the shape-shifting path', () => {
    component.runVoiceSpectrumDemo();

    expect(speechSynthesisServiceMock.speak).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ shapeShift: true })
    );
    expect(speechSynthesisServiceMock.clearArchetypePin).toHaveBeenCalled();
    expect(component.voiceLabNotice()).toContain('spectrum');
  });

  it('pins a tone for the next reply, shows it, and releases it', () => {
    speechSynthesisServiceMock.pinnedArchetypeName.mockReturnValue('Creature');

    component.toggleVoiceLab();
    component.pinArchetype('Creature');
    fixture.detectChanges();

    expect(speechSynthesisServiceMock.setArchetype).toHaveBeenCalledWith(
      'Creature'
    );
    expect(component.pinnedVoice()).toBe('Creature');
    expect(fixture.nativeElement.textContent).toContain('PINNED');

    component.clearArchetypePin();
    fixture.detectChanges();

    expect(speechSynthesisServiceMock.clearArchetypePin).toHaveBeenCalled();
    expect(component.pinnedVoice()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('PINNED');
  });

  it('says so when the device cannot audition anything', () => {
    speechSynthesisServiceMock.outputCapability.set('no-voices');
    fixture.detectChanges();

    expect(component.labOutputNotice()).toContain('no speech voices');
  });

  it('shows the delivery texture of the sentence being spoken', () => {
    speechSynthesisServiceMock.liveVoice.set({
      archetype: 'Creature',
      band: 'low',
      voiceName: 'Fake Male Voice A',
      pitch: 0.31,
      rate: 0.62,
      prosody: 'dramatic',
      texture: 'growl',
    });
    speechSynthesisServiceMock.isSpeaking.set(true);
    fixture.detectChanges();

    const readout = fixture.nativeElement.textContent as string;

    expect(readout).toContain('Creature');
    expect(readout).toContain('growl');
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
            commanderPersona: 'S.M.U.V.E. Prime',
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
            commanderPersona: 'S.M.U.V.E. Prime',
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
            commanderPersona: 'S.M.U.V.E. Prime',
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
      settings: { ...initialProfile.settings, security: { ...initialProfile.settings.security, shareProfileAnswersWithAi: true, hideSensitiveProfileDetails: false } },
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
  it('renders a long completed reply immediately without per-word timers', async () => {
    const reply = 'My verdict. '.repeat(800);
    const timer = jest.spyOn(globalThis, 'setTimeout');
    const before = timer.mock.calls.length;
    await (component as any).streamResponse(reply, 'production');
    expect(component.messages().at(-1)?.text).toBe(reply);
    expect(timer.mock.calls.length).toBe(before);
    expect(component.messages().at(-1)?.isStreaming).toBe(false);
    timer.mockRestore();
  });

  it('ignores a late live reply after the artist clears the conversation', async () => {
    let resolve!: (reply: string) => void;
    aiServiceMock.getAIResponse = jest.fn(() => new Promise<string>((r) => { resolve = r; }));
    component.userInput = 'What is my best next campaign?';
    const sending = component.sendMessage();
    await Promise.resolve();
    component.clearHistory();
    resolve('Late reply must never appear');
    await sending;
    expect(component.messages().some((m) => m.text.includes('Late reply'))).toBe(false);
    expect(component.isTyping()).toBe(false);
    expect(speechSynthesisServiceMock.speak).not.toHaveBeenCalled();
  });

  it('isolates saved conversations by authenticated account and drops legacy unscoped history', async () => {
    const users = TestBed.inject(UserStoreService);
    localStorage.setItem('smuve.master.chat.v1', JSON.stringify([{ role: 'assistant', text: 'Legacy private history', timestamp: 1 }]));
    users.user.set({ id: 'artist-a' } as any);
    fixture.detectChanges();
    await (component as any).streamResponse('Account A private message', 'business');
    expect(localStorage.getItem('smuve.master.chat.v1:artist-a')).toContain('Account A private');
    users.user.set({ id: 'artist-b' } as any);
    fixture.detectChanges();
    expect(component.messages().some((m) => m.text.includes('Account A private'))).toBe(false);
    expect(component.messages().some((m) => m.text.includes('Legacy private'))).toBe(false);
    users.user.set({ id: 'artist-a' } as any);
    fixture.detectChanges();
    expect(component.messages().some((m) => m.text.includes('Account A private'))).toBe(true);
  });

  it('continues ordinary music questions to live AI rather than returning a generic lesson', async () => {
    aiServiceMock.getAIResponse = jest.fn().mockResolvedValue('Actual personalized answer.');
    component.userInput = 'How do I improve my melody?';
    await component.sendMessage();
    expect(aiServiceMock.getAIResponse).toHaveBeenCalledWith(expect.stringContaining('How do I improve my melody?'));
    expect(component.messages().at(-1)?.text).toBe('Actual personalized answer.');
    expect(speechSynthesisServiceMock.speak).toHaveBeenCalledWith('Actual personalized answer.', expect.objectContaining({ shapeShift: true }));
  });

  it('executes a natural-language app request through the control engine', async () => {
    const control = TestBed.inject(SmuveTotalControlService);
    const execute = jest
      .spyOn(control, 'executeCommand')
      .mockResolvedValue({ success: true, message: 'bass muted.' });
    aiServiceMock.getAIResponse = jest.fn().mockResolvedValue('model answer');

    component.userInput = 'mute the bass';
    await component.sendMessage();

    expect(execute).toHaveBeenCalledWith('/mixer mute bass');
    expect(component.messages().at(-1)?.text).toContain('bass muted.');
    // The model is advisory only for requests S.M.U.V.E. can execute.
    expect(aiServiceMock.getAIResponse).not.toHaveBeenCalled();
    execute.mockRestore();
  });

  it('treats any persona casing of an offline reply as local knowledge', async () => {
    aiServiceMock.getAIResponse = jest.fn().mockResolvedValue('Strategic link severed.');
    component.userInput = 'Explain sample clearance';
    await component.sendMessage();
    expect(component.messages().at(-1)?.text).toContain('LOCAL KNOWLEDGE MODE');
    expect(component.messages().at(-1)?.text).toContain('copyright.gov');
  });


  it('labels the artist context with the profile\u2019s real calibration state', () => {
    // Shared answers so the context block is not the private variant.
    userProfileServiceMock.profile.set({
      ...initialProfile,
      settings: {
        ...initialProfile.settings,
        security: {
          ...initialProfile.settings.security,
          shareProfileAnswersWithAi: true,
        },
      },
    });

    const thin = (component as any).buildMasterPrompt('what is my first step?');
    expect(thin).toContain('ARTIST PROFILE CONTEXT \u2014 FOUNDATIONAL');
    expect(thin).toContain('keep advice foundational until the questionnaire is finished');

    finetuneMock.profileCalibration.set({
      state: 'partial',
      completeness: 72,
      sharing: true,
    });
    const partial = (component as any).buildMasterPrompt('what is my first step?');
    expect(partial).toContain('ARTIST PROFILE CONTEXT \u2014 PARTIAL (72% evidence)');
    expect(partial).toContain('never as an assumption');

    finetuneMock.profileCalibration.set({
      state: 'calibrated',
      completeness: 100,
      sharing: true,
    });
    const calibrated = (component as any).buildMasterPrompt('what is my first step?');
    expect(calibrated).toContain('COMPLETE ARTIST CONTEXT \u2014 CALIBRATED (100% evidence)');
    expect(calibrated).toContain('SONIC NON-NEGOTIABLE: preserve the room tone.');
  });

  it('falls back to the foundational heading when the compiler gives no calibration', () => {
    userProfileServiceMock.profile.set({
      ...initialProfile,
      settings: {
        ...initialProfile.settings,
        security: {
          ...initialProfile.settings.security,
          shareProfileAnswersWithAi: true,
        },
      },
    });
    finetuneMock.profileCalibration = undefined;

    const prompt = (component as any).buildMasterPrompt('what is my first step?');
    expect(prompt).toContain('ARTIST PROFILE CONTEXT \u2014 FOUNDATIONAL');
    expect(prompt).toContain('no shared evidence');
  });

  it('does not send the artist name or synthesized identity when profile sharing is disabled', () => {
    userProfileServiceMock.profile.set({
      ...initialProfile,
      artistName: 'PRIVATE ARTIST',
      musicalJourney: {
        ...initialProfile.musicalJourney,
        personaSynthesis: { archetype: 'PRIVATE ARCHETYPE', sonicSignature: 'PRIVATE SIGNATURE' },
      },
      settings: {
        ...initialProfile.settings,
        security: { ...initialProfile.settings.security, shareProfileAnswersWithAi: false },
      },
    });
    const prompt = (component as any).buildMasterPrompt('hello');
    expect(prompt).toContain('Artist: private artist');
    expect(prompt).not.toContain('PRIVATE ARTIST');
    expect(prompt).not.toContain('PRIVATE ARCHETYPE');
    expect(prompt).not.toContain('PRIVATE SIGNATURE');
  });

  it('marks the context private while the artist has not shared profile answers', () => {
    const prompt = (component as any).buildMasterPrompt('hello');
    expect(prompt).toContain('ARTIST PROFILE CONTEXT \u2014 PRIVATE');
    expect(prompt).not.toContain('CALIBRATED');
  });

  it('shows the ADAPTED badge only once the profile actually reaches calibrated', () => {
    // Default: foundational — nothing to advertise yet.
    expect(component.adaptedChip()).toBeNull();

    finetuneMock.profileCalibration.set({
      state: 'partial',
      completeness: 72,
      sharing: true,
    });
    expect(component.adaptedChip()).toBeNull();

    finetuneMock.profileCalibration.set({
      state: 'calibrated',
      completeness: 100,
      sharing: true,
    });
    expect(component.adaptedChip()).toEqual({
      completeness: 100,
      title: expect.stringContaining('re-read your artist profile'),
    });

    // …and it actually renders in the header, not just in the computed.
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ADAPTED · 100%');

    // Calibrated but withheld: the badge must not claim an adaptation the
    // model cannot actually read.
    finetuneMock.profileCalibration.set({
      state: 'calibrated',
      completeness: 100,
      sharing: false,
    });
    expect(component.adaptedChip()).toBeNull();
  });
});
