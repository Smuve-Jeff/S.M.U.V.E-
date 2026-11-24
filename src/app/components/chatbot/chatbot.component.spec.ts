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
import { ArtistRelationshipService } from '../../services/artist-relationship.service';
import {
  ARTIST_ROLES,
  ARTIST_ROLE_CHIPS,
  artistRoleForAlias,
} from '../../services/artist-role.registry';
import { SmuveMemoryService } from '../../services/smuve-memory.service';
import { SmuveTotalControlService } from '../../services/smuve-total-control.service';
import { DeskTelemetryService } from '../../services/desk-telemetry.service';

describe('ChatbotComponent', () => {
  let component: ChatbotComponent;
  let fixture: ComponentFixture<ChatbotComponent>;
  let userProfileServiceMock: any;
  let aiServiceMock: any;
  let speechRecognitionServiceMock: any;
  let speechSynthesisServiceMock: any;
  let finetuneMock: any;
  let uiServiceMock: any;
  let relationshipMock: any;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    userProfileServiceMock = {
      profile: signal(initialProfile),
      updateProfile: jest.fn(),
    };

    aiServiceMock = {
      conversationalTier: signal('Standard'),
      personaDirectives: jest.fn(() => 'Keep S.M.U.V.E. direct, precise, and in character.'),
      processCommand: jest.fn(),
      getArtistDirective: jest.fn((role: string) => ({
        role,
        profileState: 'calibrated',
        directive: `${role} directive from the artist's evidence`,
        tips: [`${role} tip`],
        guardrails: [],
      })),
    };

    // Mutable calibration signal: tests flip it to foundational/partial/
    // calibrated and assert the chat prompt and ADAPTED badge follow.
    // Quiet by default: a confidant with nothing to ask, so existing
    // transcript tests never see an interview card. Card tests override.
    relationshipMock = {
      stage: jest.fn(() => 'confidant'),
      nextQuestion: jest.fn(() => null),
      interviewProgress: jest.fn(() => ({ answered: 0, total: 12 })),
      answerCurrentQuestion: jest.fn(async () => true),
      skipCurrentQuestion: jest.fn(() => null),
      undoInterviewAnswer: jest.fn(async () => ({
        ok: true,
        reason: 'undone',
        label: 'Primary genre',
      })),
      brief: jest.fn(() => ''),
      voice: jest.fn(() => ({
        opener:
          'Kairo. 4 moments on the file, and I am not starting from zero with you.',
        note: 'The mission on record: “Debut tape”.',
      })),
    };

    finetuneMock = {
      promptBlock: jest.fn(() => 'SONIC NON-NEGOTIABLE: preserve the room tone.'),
      missingEvidence: jest.fn(() => ['release date']),
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
        {
          provide: ArtistRelationshipService,
          useValue: relationshipMock,
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

  it('teaches app features and professional craft from S.M.U.V.E. only', async () => {
    const teach = await (component as any).routeMasterIntent('#teach studio');
    expect(teach.content).toContain('#TEACH // STUDIO: IDEA TO MASTER');
    expect(teach.content).toContain('STEP BY STEP');
    expect(teach.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'open-route', data: '/studio' }),
      ])
    );

    const learn = await (component as any).routeMasterIntent('#learn books');
    expect(learn.content).toContain('#LEARN // BOOKS: WRITE, REVISE, PUBLISH');
    expect(learn.content).toContain('CORE CONCEPTS');
    expect(learn.content).toContain('Writer’s Pad');
    expect(learn.actions).toEqual([
      expect.objectContaining({ id: 'open-route', data: '/songwriting/pad' }),
    ]);
  });

  it('answers /engineer, /teach and /ceo from their role directives', async () => {
    const engineer = await (component as any).routeMasterIntent('/engineer');
    expect(engineer.content).toContain('ENGINEER DESK');
    expect(engineer.content).toContain("engineer directive from the artist's evidence");
    expect(engineer.content).toContain('engineer tip');
    expect(aiServiceMock.getArtistDirective).toHaveBeenCalledWith('engineer');

    const teach = await (component as any).routeMasterIntent('/teach');
    expect(teach.content).toContain('TEACHER DESK');
    expect(teach.content).toContain("teacher directive from the artist's evidence");
    expect(aiServiceMock.getArtistDirective).toHaveBeenCalledWith('teacher');

    const coach = await (component as any).routeMasterIntent('/coach');
    expect(coach.content).toContain('COACH DESK');
    expect(coach.content).toContain("coach directive from the artist's evidence");
    expect(aiServiceMock.getArtistDirective).toHaveBeenCalledWith('coach');

    for (const [alias, role] of [
      ['manager', 'manager'],
      ['ar', 'ar'],
      ['marketing', 'marketing'],
      ['legal', 'legal'],
    ] as const) {
      const intent = await (component as any).routeMasterIntent(`/${alias}`);
      expect(intent.content).toContain(`${role} directive from the artist's evidence`);
      expect(aiServiceMock.getArtistDirective).toHaveBeenCalledWith(role);
    }

    const ceo = await (component as any).routeMasterIntent('/ceo');
    expect(ceo.content).toContain('CEO DESK');
    expect(ceo.content).toContain("ceo directive from the artist's evidence");
    expect(aiServiceMock.getArtistDirective).toHaveBeenCalledWith('ceo');
  });

  it('opens a desk for every alias in the shared role registry', async () => {
    for (const definition of ARTIST_ROLES) {
      for (const alias of definition.aliases) {
        const intent = await (component as any).routeMasterIntent(`/${alias}`);
        expect(intent.content).toContain(
          `${definition.label.toUpperCase()} DESK`
        );
        expect(intent.content).toContain(
          `${definition.role} directive from the artist's evidence`
        );
      }
    }
  });

  it('keeps /teach <feature> as the walkthrough and bare /teach as the desk', async () => {
    const walkthrough = await (component as any).routeMasterIntent('/teach studio');
    expect(walkthrough.content).toContain('#TEACH // STUDIO: IDEA TO MASTER');
    expect(walkthrough.content).toContain('STEP BY STEP');

    const desk = await (component as any).routeMasterIntent('/teach');
    expect(desk.content).toContain('TEACHER DESK');
    expect(desk.content).toContain("teacher directive from the artist's evidence");

    // A short topic that is not a shipped feature falls back to the lesson
    // index, so the artist can pick a real one.
    const index = await (component as any).routeMasterIntent(
      '/teach quantum knitting'
    );
    expect(index.content).toContain('No app module matched');
    expect(index.content).toContain('Ask by name');
    expect(index.content).not.toContain('TEACHER DESK');
  });

  it('opens a walkthrough only for an exact feature name', async () => {
    const exactAlias = await (component as any).routeMasterIntent('/teach beat');
    expect(exactAlias.content).toContain('#TEACH //');
    expect(exactAlias.content).toContain('STEP BY STEP');

    // A near miss used to fuzzy-match the studio lesson; it is now an index
    // request rather than a walkthrough the artist did not ask for.
    const nearMiss = await (component as any).routeMasterIntent(
      '/teach recording vocals'
    );
    expect(nearMiss.content).toContain('No app module matched');
    expect(nearMiss.content).not.toContain('#TEACH //');
  });

  it('keeps an open desk for follow-up questions and shows it', async () => {
    const getAIResponse = jest.fn(async () => 'Fix the phase before EQ.');
    aiServiceMock.getAIResponse = getAIResponse;

    await (component as any).routeMasterIntent('/ar');
    expect(component.activeDeskLabel()).toBe('A&R');

    const followUp = await (component as any).routeMasterIntent(
      'what do I fix first?'
    );
    expect(followUp.content).toBe('Fix the phase before EQ.');
    const prompt = getAIResponse.mock.calls[0][0] as string;
    expect(prompt).toContain("ar directive from the artist's evidence");
    expect(prompt).toContain('what do I fix first?');
    expect(aiServiceMock.getArtistDirective).toHaveBeenCalledWith('ar');

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A&R desk active');
  });

  it('lets explicit navigation and app control through without closing the desk', async () => {
    const control = TestBed.inject(SmuveTotalControlService);
    const execute = jest
      .spyOn(control, 'executeCommand')
      .mockResolvedValue({ success: true, message: 'Opening the mixer.' });
    aiServiceMock.getAIResponse = jest.fn().mockResolvedValue('desk answer');

    await (component as any).routeMasterIntent('/engineer');

    const nav = await (component as any).routeMasterIntent('open the mixer');
    expect(nav.content).toContain('Opening the mixer.');
    expect(nav.content).toContain('Still with the Engineer');
    expect(execute).toHaveBeenCalledWith('/go the mixer');
    expect(component.activeDeskLabel()).toBe('Engineer');

    const appControl = await (component as any).routeMasterIntent(
      'mute the bass'
    );
    expect(appControl.content.toLowerCase()).toContain('mute bass');
    expect(execute).toHaveBeenLastCalledWith('/mixer mute bass');
    expect(component.activeDeskLabel()).toBe('Engineer');

    // The desk was not asked to answer either phrase.
    expect(aiServiceMock.getAIResponse).not.toHaveBeenCalled();

    // A question is still the desk's, so the bypass stays narrow.
    const question = await (component as any).routeMasterIntent(
      'how do I open the mixer?'
    );
    expect(question.content).toBe('desk answer');

    execute.mockRestore();
  });

  it('offers the desk surface and a handoff as actions', async () => {
    const intent = await (component as any).routeMasterIntent('/manager');

    expect(intent.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'open-route', data: '/career' }),
        expect.objectContaining({ id: 'desk-switch', data: 'ceo' }),
      ])
    );
  });

  it('hands work to the next desk without losing the reply', async () => {
    const manager = await (component as any).routeMasterIntent('/manager');
    const handoff = manager.actions.find(
      (action: any) => action.id === 'desk-switch'
    );

    await component.runChatAction(handoff);

    expect(component.activeDeskLabel()).toBe('CEO');
    expect(component.messages().at(-1)?.desk).toBe('CEO');
    expect(component.messages().at(-1)?.text).toContain('CEO DESK');
  });

  it('draws desk history into the next prompt and attributes the reply', async () => {
    aiServiceMock.getAIResponse = jest
      .fn()
      .mockResolvedValueOnce('The low end is phase.')
      .mockResolvedValueOnce('Fix the phase, then re-check.');

    component.userInput = '/engineer why is the low end muddy?';
    await component.sendMessage();
    component.userInput = 'and after that?';
    await component.sendMessage();

    const prompt = aiServiceMock.getAIResponse.mock.calls[1][0] as string;
    expect(prompt).toContain('Conversation so far with this artist:');
    expect(prompt).toContain('why is the low end muddy?');
    expect(prompt).toContain('The low end is phase.');
    expect(component.messages().at(-1)?.desk).toBe('Engineer');
  });

  it('surfaces missing evidence on a desk brief', async () => {
    const intent = await (component as any).routeMasterIntent('/ar');
    expect(intent.content).toContain('Evidence gap: release date');
    expect(intent.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'open-route', data: '/profile' }),
      ])
    );
  });

  it('lists every registry desk in /roles', async () => {
    const intent = await (component as any).routeMasterIntent('/roles');

    for (const definition of ARTIST_ROLES) {
      expect(intent.content).toContain(`/${definition.aliases[0]}`);
      expect(intent.content).toContain(definition.label);
    }
    expect(intent.content).toContain('/promotion');
    expect(intent.content).toContain('/promo is still the promotion plan');
    expect(intent.content).toContain('/exit leaves it');
  });

  it('turns the lesson index into one action per module', async () => {
    const index = await (component as any).routeMasterIntent(
      '/teach quantum knitting'
    );

    expect(index.actions.length).toBeGreaterThan(0);
    expect(
      index.actions.every(
        (action: any) =>
          action.id === 'open-route' && action.data?.startsWith('/')
      )
    ).toBe(true);
  });

  it('can reach every shipped lesson by its exact id and aliases', () => {
    const teach = (component as any).teachLearn;

    for (const entry of teach.teachTopics) {
      expect(teach.findTeachExact(entry.lesson.id)).toBeTruthy();
      for (const alias of entry.aliases) {
        expect(teach.findTeachExact(alias)).toBeTruthy();
      }
    }
  });

  const deskStorageKeys = () =>
    Array.from({ length: sessionStorage.length }, (_, i) =>
      sessionStorage.key(i) ?? ''
    ).filter((key) => key.startsWith('smuve.master.desk.v1'));

  it('persists the open desk for the session and closes it on Escape', async () => {
    await (component as any).routeMasterIntent('/coach');
    const keys = deskStorageKeys();
    expect(keys).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem(keys[0])!).alias).toBe('coach');

    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape' })
    );

    expect(component.activeDesk()).toBeNull();
    expect(deskStorageKeys()).toHaveLength(0);
  });

  it('files a desk question in the case file under the expert', async () => {
    const memory = TestBed.inject(SmuveMemoryService);
    const capture = jest.spyOn(memory, 'captureTurn');
    aiServiceMock.getAIResponse = jest.fn().mockResolvedValue('Phase first.');

    component.userInput = '/ar what do I fix first?';
    await component.sendMessage();

    expect(component.messages().at(-1)?.text).toContain('Phase first.');
    expect((component as any).caseFile).toBe(memory);
    expect(capture).toHaveBeenCalledWith(
      expect.any(String),
      'A&R Desk',
      expect.stringContaining('/ar'),
      expect.stringContaining('Phase first.')
    );
    capture.mockRestore();
  });

  it('does not file a bare desk command in the case file', async () => {
    const memory = TestBed.inject(SmuveMemoryService);
    const capture = jest.spyOn(memory, 'captureTurn');

    component.userInput = '/ar';
    await component.sendMessage();

    expect(component.messages().at(-1)?.text).toContain('A&R DESK');
    expect(capture).not.toHaveBeenCalled();
    capture.mockRestore();
  });

  it('carries the previous exchange into the receiving desk', async () => {
    aiServiceMock.getAIResponse = jest
      .fn()
      .mockResolvedValueOnce('Phase first.')
      .mockResolvedValue('Check translation next.');

    component.userInput = '/ar why is my low end muddy?';
    await component.sendMessage();

    await component.runChatAction({
      id: 'desk-switch',
      label: 'Take this to the Marketing',
      data: 'marketing',
    });

    component.userInput = 'what should the campaign say?';
    await component.sendMessage();

    const prompt = aiServiceMock.getAIResponse.mock.calls[1][0] as string;
    expect(prompt).toContain('why is my low end muddy?');
    expect(prompt).toContain('Phase first.');
    expect(prompt).toContain('A&R:');
    expect(component.activeDeskLabel()).toBe('Marketing');
  });

  it('restores the desk conversation with the role', async () => {
    aiServiceMock.getAIResponse = jest
      .fn()
      .mockResolvedValueOnce('Phase first.')
      .mockResolvedValue('Check translation next.');

    component.userInput = '/ar why is my low end muddy?';
    await component.sendMessage();

    const restoredFixture = TestBed.createComponent(ChatbotComponent);
    const restored = restoredFixture.componentInstance;
    restored.ngOnInit();
    restoredFixture.detectChanges();

    expect(restored.activeDeskLabel()).toBe('A&R');

    aiServiceMock.getAIResponse = jest.fn().mockResolvedValue('Next answer.');
    restored.userInput = 'what do I fix first?';
    await restored.sendMessage();

    const prompt = aiServiceMock.getAIResponse.mock.calls[0][0] as string;
    expect(prompt).toContain('why is my low end muddy?');
    expect(prompt).toContain('Phase first.');
    expect(prompt).toContain('A&R:');

    restoredFixture.destroy();
  });

  it('migrates a desk saved in the old bare-alias format on first load', () => {
    const users = TestBed.inject(UserStoreService);
    users.user.set(null);
    fixture.detectChanges();
    TestBed.flushEffects();

    sessionStorage.setItem('smuve.master.desk.v1', 'coach');

    const restoredFixture = TestBed.createComponent(ChatbotComponent);
    const restored = restoredFixture.componentInstance;
    restored.ngOnInit();
    restoredFixture.detectChanges();

    expect(restored.activeDeskLabel()).toBe('Coach');
    expect(sessionStorage.getItem('smuve.master.desk.v1')).toBeNull();
    expect(
      sessionStorage.getItem((restored as any).deskStorageKey())
    ).toContain('"alias":"coach"');

    restoredFixture.destroy();
  });

  it('moves a legacy guest migration into the account when it resolves', () => {
    const users = TestBed.inject(UserStoreService);
    users.user.set(null);
    fixture.detectChanges();
    TestBed.flushEffects();

    sessionStorage.setItem('smuve.master.desk.v1', 'coach');

    const restoredFixture = TestBed.createComponent(ChatbotComponent);
    const restored = restoredFixture.componentInstance;
    restored.ngOnInit();
    restoredFixture.detectChanges();

    // Migrated provisionally into the guest bucket because no owner was known.
    expect(restored.activeDeskLabel()).toBe('Coach');
    expect(sessionStorage.getItem('smuve.master.desk.v1:guest')).toContain(
      '"alias":"coach"'
    );

    users.user.set({ id: 'artist-a' } as any);
    restoredFixture.detectChanges();
    TestBed.flushEffects();

    // When the account resolves shortly after, the desk moves with it rather
    // than staying guest-owned or being lost.
    expect(restored.activeDeskLabel()).toBe('Coach');
    expect(sessionStorage.getItem('smuve.master.desk.v1:artist-a')).toContain(
      '"alias":"coach"'
    );
    expect(sessionStorage.getItem('smuve.master.desk.v1:guest')).toBeNull();

    restoredFixture.destroy();
  });

  it('restores the guest desk on sign-out instead of the account desk', async () => {
    const users = TestBed.inject(UserStoreService);
    users.user.set(null);
    fixture.detectChanges();
    TestBed.flushEffects();

    await (component as any).routeMasterIntent('/coach');
    expect(component.activeDeskLabel()).toBe('Coach');

    users.user.set({ id: 'artist-a' } as any);
    fixture.detectChanges();
    TestBed.flushEffects();

    await (component as any).routeMasterIntent('/ar');
    expect(component.activeDeskLabel()).toBe('A&R');

    users.user.set(null);
    fixture.detectChanges();
    TestBed.flushEffects();

    // Signing out closes the account desk and restores the guest's own.
    expect(component.activeDeskLabel()).toBe('Coach');
    expect(sessionStorage.getItem('smuve.master.desk.v1:artist-a')).toContain(
      '"alias":"ar"'
    );
  });

  it('closes a guest desk when an account appears and restores the account desk', async () => {
    const users = TestBed.inject(UserStoreService);
    users.user.set(null);
    fixture.detectChanges();
    TestBed.flushEffects();

    // Account A has its own saved desk from a previous session.
    sessionStorage.setItem(
      'smuve.master.desk.v1:artist-a',
      JSON.stringify({ alias: 'ar', turns: [] })
    );

    await (component as any).routeMasterIntent('/coach');
    expect(component.activeDeskLabel()).toBe('Coach');
    expect(sessionStorage.getItem('smuve.master.desk.v1:guest')).toContain(
      '"alias":"coach"'
    );

    users.user.set({ id: 'artist-a' } as any);
    fixture.detectChanges();
    TestBed.flushEffects();

    // The guest desk did not carry in; A's own saved desk was restored, and
    // the guest's state remains in its own bucket.
    expect(component.activeDeskLabel()).toBe('A&R');
    expect(sessionStorage.getItem('smuve.master.desk.v1:guest')).toContain(
      '"alias":"coach"'
    );
  });

  it('scopes the saved desk to the account and never lets another inherit it', async () => {
    const users = TestBed.inject(UserStoreService);
    users.user.set({ id: 'artist-a' } as any);
    fixture.detectChanges();
    TestBed.flushEffects();

    await (component as any).routeMasterIntent('/ar');
    const keyA = 'smuve.master.desk.v1:artist-a';
    expect(sessionStorage.getItem(keyA)).toContain('"alias":"ar"');

    users.user.set({ id: 'artist-b' } as any);
    fixture.detectChanges();
    TestBed.flushEffects();

    // B starts with no desk and cannot read A's saved state.
    expect(component.activeDesk()).toBeNull();
    expect(sessionStorage.getItem('smuve.master.desk.v1:artist-b')).toBeNull();
    expect(sessionStorage.getItem(keyA)).toContain('"alias":"ar"');

    // Returning to A restores A's own desk.
    users.user.set({ id: 'artist-a' } as any);
    fixture.detectChanges();
    TestBed.flushEffects();
    expect(component.activeDeskLabel()).toBe('A&R');
  });

  it('keeps a desk restored from the session after the owner read', () => {
    sessionStorage.setItem(
      (component as any).deskStorageKey(),
      JSON.stringify({ alias: 'coach', turns: [] })
    );
    const restoredFixture = TestBed.createComponent(ChatbotComponent);
    const restored = restoredFixture.componentInstance;

    restored.ngOnInit();
    restoredFixture.detectChanges();

    expect(restored.activeDeskLabel()).toBe('Coach');
    restoredFixture.destroy();
  });

  it('counts desk opens in category-level telemetry', async () => {
    const telemetry = TestBed.inject(DeskTelemetryService);
    telemetry.reset();

    await (component as any).routeMasterIntent('/legal');

    expect(telemetry.snapshot().legal?.opened).toBe(1);
  });

  it('navigates “show me <surface>” but keeps “show me how…” with the desk', async () => {
    const control = TestBed.inject(SmuveTotalControlService);
    const execute = jest
      .spyOn(control, 'executeCommand')
      .mockResolvedValue({ success: true, message: 'Opening the mixer.' });
    aiServiceMock.getAIResponse = jest
      .fn()
      .mockResolvedValue('Record vocals close, then check the room.');

    await (component as any).routeMasterIntent('/engineer');

    const nav = await (component as any).routeMasterIntent('show me the mixer');
    expect(nav.content).toContain('Opening the mixer.');
    expect(execute).toHaveBeenCalledWith('/go the mixer');
    expect(component.activeDeskLabel()).toBe('Engineer');

    const question = await (component as any).routeMasterIntent(
      'show me how to record vocals'
    );
    expect(question.content).toBe('Record vocals close, then check the room.');
    const prompt = aiServiceMock.getAIResponse.mock.calls[0][0] as string;
    expect(prompt).toContain("engineer directive from the artist's evidence");
    expect(prompt).toContain('show me how to record vocals');
    expect(component.activeDeskLabel()).toBe('Engineer');

    execute.mockRestore();
  });

  it('switches desks when another desk is chosen', async () => {
    await (component as any).routeMasterIntent('/ar');
    await (component as any).routeMasterIntent('/coach');
    expect(component.activeDeskLabel()).toBe('Coach');

    const followUp = await (component as any).routeMasterIntent(
      'what is the next commitment?'
    );
    expect(followUp.content).toContain('COACH DESK');
    expect(aiServiceMock.getArtistDirective).toHaveBeenLastCalledWith('coach');
  });

  it('leaves the desk on /exit and stops answering as that expert', async () => {
    await (component as any).routeMasterIntent('/ar');

    const exit = await (component as any).routeMasterIntent('/exit');
    expect(exit.content).toContain('A&R DESK CLOSED');
    expect(component.activeDesk()).toBeNull();

    // With no desk open, /exit is still this component's command, not a
    // shadowed engine command with different behaviour.
    const noDesk = await (component as any).routeMasterIntent('/exit');
    expect(noDesk.content).toContain('No desk is open');

    aiServiceMock.getArtistDirective.mockClear();
    await (component as any).routeMasterIntent('what do I fix first?');
    expect(aiServiceMock.getArtistDirective).not.toHaveBeenCalled();
  });

  it('closes the desk from the visible /exit control', async () => {
    await (component as any).routeMasterIntent('/engineer');
    fixture.detectChanges();

    const exit = fixture.nativeElement.querySelector(
      '[data-testid="desk-exit"]'
    ) as HTMLButtonElement;
    expect(exit).toBeTruthy();
    exit.click();

    expect(component.activeDesk()).toBeNull();
  });

  it('sends a real /teach question to the teacher desk, not the walkthrough', async () => {
    const question = await (component as any).routeMasterIntent(
      '/teach how do I record vocals'
    );

    expect(question.content).toContain('TEACHER DESK');
    expect(question.content).toContain(
      "teacher directive from the artist's evidence"
    );
    expect(aiServiceMock.getArtistDirective).toHaveBeenCalledWith('teacher');
  });

  it('still walks through an exact short feature name', async () => {
    const lyrics = await (component as any).routeMasterIntent('/teach lyrics');

    expect(lyrics.content).toMatch(/#TEACH \/\//);
    expect(lyrics.content).toContain('STEP BY STEP');
  });

  it('builds every desk chip from the shared registry', () => {
    const labels = component.quickCommands.map((command) => command.label);

    for (const chip of ARTIST_ROLE_CHIPS) {
      expect(labels).toContain(chip.label);
      // Each chip's alias must resolve, or the chip would be a dead command.
      expect(artistRoleForAlias(chip.label.slice(1))).toBeTruthy();
    }
    expect(labels).toContain('/teach');
  });

  it('sends a role-desk question to the model with that desk’s directive', async () => {
    const getAIResponse = jest.fn(async () => 'Check phase before EQ.');
    aiServiceMock.getAIResponse = getAIResponse;

    const intent = await (component as any).routeMasterIntent(
      '/engineer why is my low end muddy?'
    );

    expect(intent.content).toBe('Check phase before EQ.');
    const prompt = getAIResponse.mock.calls[0][0] as string;
    expect(prompt).toContain("engineer directive from the artist's evidence");
    expect(prompt).toContain('why is my low end muddy?');
  });

  it('falls back to the local role brief when the model is unreachable', async () => {
    aiServiceMock.getAIResponse = jest.fn(async () => {
      throw new Error('offline');
    });

    const intent = await (component as any).routeMasterIntent('/ceo what do I fund?');

    expect(intent.content).toContain('CEO DESK');
    expect(intent.content).toContain("ceo directive from the artist's evidence");
  });

  it('lists every teaching module when #teach or #learn is used bare', async () => {
    const teach = await (component as any).routeMasterIntent('#teach');
    expect(teach.content).toContain('S.M.U.V.E. TEACH');
    expect(teach.content).toContain('Tha Spot');

    const learn = await (component as any).routeMasterIntent('#learn');
    expect(learn.content).toContain('S.M.U.V.E. LEARN');
    expect(learn.content).toContain('Books: Write, Revise, Publish');
  });

  it('resolves each named app feature and craft discipline', async () => {
    const cases: [string, string][] = [
      ['#teach studio', 'STUDIO: IDEA TO MASTER'],
      ['#teach image video lab', 'IMAGE & VIDEO LAB'],
      ['#teach tha spot', 'THA SPOT'],
      ['#teach lyrics', 'WRITE, PRODUCE AND LEARN'],
      ['#teach acting', 'WRITE, PRODUCE AND LEARN'],
      ['#learn directing', 'DIRECTING: BUILD THE VISUAL ARGUMENT'],
      ['#learn acting', 'ACTING: PLAY AN ACTION, NOT AN EMOTION'],
      ['#learn music videos', 'MUSIC VIDEOS: CUT THE SONG, NOT THE FOOTAGE'],
      ['#learn podcast/vlog', 'PODCAST & VLOG: EARN THE NEXT MINUTE'],
      ['#learn business', 'MUSIC BUSINESS & LEGAL: OWN THE RIGHTS'],
      ['#learn marketing', 'MARKETING & PROMOTION: EARN THE AUDIENCE'],
      ['#learn industry', 'ENTERTAINMENT INDUSTRY: WORK THE WHOLE SYSTEM'],
      ['#learn books', 'BOOKS: WRITE, REVISE, PUBLISH'],
    ];

    for (const [command, expected] of cases) {
      const intent = await (component as any).routeMasterIntent(command);
      expect(intent?.content).toContain(expected);
    }
  });

  it('pairs craft lessons with their Academy program deep link', async () => {
    const directing = await (component as any).routeMasterIntent('#learn directing');
    expect(directing.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'open-route', data: '/image-video-lab' }),
        expect.objectContaining({
          id: 'open-route',
          label: 'Open Academy: Directing',
          data: '/academy',
          queryParams: { program: 'directing' },
        }),
      ])
    );

    const business = await (component as any).routeMasterIntent('#learn music business');
    expect(business.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'open-route', data: '/business-suite' }),
        expect.objectContaining({
          id: 'open-route',
          data: '/academy',
          queryParams: { program: 'music-business-legal' },
        }),
      ])
    );
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

    // Mimic off — the full-catalog shuffle must never be replaced silently.
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

  it('exposes a decree unfiltered only while the artist has muted profanity', async () => {
    const profile = userProfileServiceMock.profile;
    const setProfanity = (enabled: boolean) =>
      profile.update((p: any) => ({
        ...p,
        settings: {
          ...p.settings,
          ai: { ...p.settings.ai, aiProfanityEnabled: enabled },
        },
      }));
    // Mirrors AiService.sanitizePersonaText: masking belongs to the artist's
    // own mute, so an unmuted persona is never touched.
    aiServiceMock.sanitizePersonaText = jest.fn((text: string) =>
      profile().settings?.ai?.aiProfanityEnabled === false
        ? text.replace(/FUCKING/g, '*******')
        : text
    );
    jest.spyOn(component as any, 'routeMasterIntent').mockResolvedValue({
      content: 'STRATEGIC DECREE: YOUR FUCKING MIX IS MUD.',
      actions: [],
    });

    setProfanity(false);
    expect(profile().settings?.ai?.aiProfanityEnabled).toBe(false);
    component.userInput = '/decree';
    await component.sendMessage();
    // Muted: the decree is the one reply that skips the sanitizer entirely.
    expect(component.messages().at(-1)?.text).toContain(
      'YOUR FUCKING MIX IS MUD.'
    );
    expect(aiServiceMock.sanitizePersonaText).not.toHaveBeenCalled();

    // Unlocked: there is nothing to exempt, so the reply takes the shared
    // sanitizer, which is a no-op on a live vocabulary.
    (aiServiceMock.sanitizePersonaText as jest.Mock).mockClear();
    setProfanity(true);
    component.userInput = '/decree';
    await component.sendMessage();
    expect(aiServiceMock.sanitizePersonaText).toHaveBeenCalled();
    expect(component.messages().at(-1)?.text).toContain(
      'YOUR FUCKING MIX IS MUD.'
    );
  });

  it('still masks an ordinary reply while profanity is muted', async () => {
    userProfileServiceMock.profile.update((p: any) => ({
      ...p,
      settings: {
        ...p.settings,
        ai: { ...p.settings.ai, aiProfanityEnabled: false },
      },
    }));
    aiServiceMock.sanitizePersonaText = jest.fn((text: string) =>
      text.replace(/FUCKING/g, '*******')
    );
    jest.spyOn(component as any, 'routeMasterIntent').mockResolvedValue({
      content: 'YOUR FUCKING MIX IS MUD.',
      actions: [],
    });

    component.userInput = 'how is my mix';
    await component.sendMessage();

    // Only the decree gets the exemption; a plain reply is still masked.
    expect(component.messages().at(-1)?.text).toBe(
      'YOUR ******* MIX IS MUD.'
    );
    expect(aiServiceMock.sanitizePersonaText).toHaveBeenCalled();
  });

  it('ships with explicit language unlocked, so muting is an explicit choice', () => {
    // The exemption below keys off an explicit "off". If the shipped default
    // ever flipped to muted, every artist would meet a censored S.M.U.V.E.
    expect(initialProfile.settings.ai.aiProfanityEnabled).toBe(true);
  });

  it('treats an unset language preference as unlocked, not muted', async () => {
    userProfileServiceMock.profile.update((p: any) => ({
      ...p,
      settings: {
        ...p.settings,
        ai: { ...p.settings.ai, aiProfanityEnabled: undefined },
      },
    }));
    aiServiceMock.sanitizePersonaText = jest.fn((text: string) =>
      text.replace(/FUCKING/g, '*******')
    );
    jest.spyOn(component as any, 'routeMasterIntent').mockResolvedValue({
      content: 'STRATEGIC DECREE: YOUR FUCKING MIX IS MUD.',
      actions: [],
    });

    component.userInput = '/decree';
    await component.sendMessage();

    // Only an explicit "off" exempts the decree; an unset preference is the
    // shipped unlocked default, so the shared path applies.
    expect(component.messages().at(-1)?.text).toBe(
      'STRATEGIC DECREE: YOUR ******* MIX IS MUD.'
    );
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
    // The outage is reported in Prime's voice, not as a system log line, but
    // the honesty stays: nothing was looked up and nothing was executed.
    expect(component.messages().at(-1)?.text).toContain(
      'The link is severed. Local knowledge only'
    );
    expect(component.messages().at(-1)?.text).toContain('copyright.gov');
  });

  it('speaks the offline no-answer line in character, not as a help card', () => {
    const reply = (component as any).localFallback('zzzq flurble quux');

    // Prime owns the outage: local knowledge only, no invented sources.
    expect(reply).toContain('Nothing in MY local memory matches that');
    expect(reply).toContain('I do not invent answers');
    expect(reply).toContain('/music');
  });

  it('keeps an artist-selected mode out of Prime’s voice in the offline path', () => {
    userProfileServiceMock.profile.set({
      ...initialProfile,
      settings: {
        ...initialProfile.settings,
        ai: { ...initialProfile.settings.ai, commanderPersona: 'Supportive' },
      },
    });

    const reply = (component as any).localFallback('royalties');

    // The relationship opener is Prime's voice; the mentor keeps her own
    // register but still gets the artist's own filed fact.
    expect(reply).not.toContain('moments on the file');
    expect(reply).toContain('Strategic link severed. We can keep going offline');
    expect(reply).toContain('Debut tape');
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

  it('posts an interview card while S.M.U.V.E. is still learning the artist', () => {
    relationshipMock.stage.mockReturnValue('stranger');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'genre',
      ask: 'What lane are we running in?',
      label: 'Primary genre',
    });

    (component as any).syncInterviewCard();

    const card = (component as any)
      .messages()
      .find((m: any) => (m.actions ?? []).some((a: any) => a.id === 'interview-skip'));
    expect(card).toBeTruthy();
    expect(card.text).toContain('GETTING TO KNOW YOU');
    expect(card.text).toContain('What lane are we running in?');
  });

  it('files a free-chat reply as the pending interview answer', async () => {
    relationshipMock.stage.mockReturnValue('getting-to-know');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'genre',
      ask: 'What lane are we running in?',
      label: 'Primary genre',
    });
    (component as any).syncInterviewCard();
    (component as any).messages.update((m: any[]) => [
      ...m,
      { id: 'u1', role: 'user', text: 'Drill, mostly', timestamp: Date.now() },
    ]);

    const candidate = (component as any).interviewAnswerCandidate('Drill, mostly');
    expect(candidate?.question?.id).toBe('genre');
    await (component as any).fileInterviewAnswer(candidate);

    expect(relationshipMock.answerCurrentQuestion).toHaveBeenCalledWith(
      'Drill, mostly',
      expect.objectContaining({ messageId: expect.any(String) })
    );
    const note = (component as any)
      .messages()
      .find((m: any) => m.text.startsWith('Filed — Primary genre'));
    expect(note).toBeTruthy();
  });

  it('leaves questions, commands and lessons to the normal reply flow', async () => {
    relationshipMock.stage.mockReturnValue('stranger');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'genre',
      ask: 'What lane are we running in?',
      label: 'Primary genre',
    });

    for (const text of ['How do I mix 808s?', '/studio', '#teach studio', 'make it louder right now please '.repeat(10)]) {
      expect((component as any).interviewAnswerCandidate(text)).toBeNull();
    }
    expect(relationshipMock.answerCurrentQuestion).not.toHaveBeenCalled();
  });

  it('only files replies typed directly under the live card', () => {
    relationshipMock.stage.mockReturnValue('stranger');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'genre',
      ask: 'What lane are we running in?',
      label: 'Primary genre',
    });

    // The question exists but no card is on screen — conversation, not data.
    expect((component as any).interviewAnswerCandidate('Drill')).toBeNull();

    // The card is live but a reply to an older turn is not under it.
    (component as any).syncInterviewCard();
    (component as any).messages.update((m: any[]) => [
      ...m,
      { id: 'old-user', role: 'user', text: 'thanks', timestamp: Date.now() },
      { id: 'old-ai', role: 'assistant', text: 'Anytime.', timestamp: Date.now() },
    ]);
    expect((component as any).interviewAnswerCandidate('Drill')).toBeNull();

    // Typed directly under the card — this one files.
    (component as any).syncInterviewCard();
    (component as any).messages.update((m: any[]) => [
      ...m,
      { id: 'u1', role: 'user', text: 'Drill', timestamp: Date.now() },
    ]);
    const candidate = (component as any).interviewAnswerCandidate('Drill');
    expect(candidate?.question?.id).toBe('genre');
  });

  it('undoes a filed answer from its note', async () => {
    relationshipMock.stage.mockReturnValue('getting-to-know');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'genre',
      ask: 'What lane are we running in?',
      label: 'Primary genre',
    });
    (component as any).syncInterviewCard();
    (component as any).messages.update((m: any[]) => [
      ...m,
      { id: 'u1', role: 'user', text: 'Drill', timestamp: Date.now() },
    ]);
    const candidate = (component as any).interviewAnswerCandidate('Drill');
    await (component as any).fileInterviewAnswer(candidate);

    const note = (component as any)
      .messages()
      .find((m: any) => m.text.startsWith('Filed — Primary genre'));
    expect(note.actions).toEqual([
      expect.objectContaining({ id: 'interview-undo' }),
    ]);

    await (component as any).runChatAction({
      id: 'interview-undo',
      label: 'Undo',
      data: note.id,
    });

    expect(relationshipMock.undoInterviewAnswer).toHaveBeenCalledWith(note.id);
    const reverted = (component as any)
      .messages()
      .find((m: any) => m.id === note.id);
    expect(reverted.text).toContain('Undone');
    expect(reverted.actions).toEqual([]);
  });

  it('files a reply typed under the model\u2019s marked echo of the question', () => {
    relationshipMock.stage.mockReturnValue('stranger');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'genre',
      ask: 'What lane are we running in?',
      label: 'Primary genre',
    });
    // No card on screen — the model wove the question with its marker and
    // the artist answered the model's wording, not the card's.
    (component as any).messages.update((m: any[]) => [
      ...m,
      {
        id: 'ai-echo',
        role: 'assistant',
        text: 'Real talk — what lane are we running in? [iq:genre]',
        timestamp: Date.now(),
      },
      { id: 'u1', role: 'user', text: 'Drill', timestamp: Date.now() },
    ]);
    const candidate = (component as any).interviewAnswerCandidate('Drill');
    expect(candidate?.question?.id).toBe('genre');
  });

  it('rejects a reply under a stale marker from an earlier rung', () => {
    relationshipMock.stage.mockReturnValue('stranger');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'experience',
      ask: 'How long have you been at this?',
      label: 'Experience',
    });
    (component as any).messages.update((m: any[]) => [
      ...m,
      {
        id: 'ai-stale',
        role: 'assistant',
        text: 'What lane are we running in? [iq:genre]',
        timestamp: Date.now(),
      },
      { id: 'u1', role: 'user', text: 'Drill', timestamp: Date.now() },
    ]);
    expect(
      (component as any).interviewAnswerCandidate('Drill')
    ).toBeNull();
  });

  it('skips the card question and moves the interview on', async () => {
    relationshipMock.stage.mockReturnValue('stranger');
    relationshipMock.nextQuestion.mockReturnValue({
      id: 'genre',
      ask: 'What lane are we running in?',
      label: 'Primary genre',
    });
    relationshipMock.skipCurrentQuestion.mockReturnValue({ id: 'genre' });
    (component as any).syncInterviewCard();

    await (component as any).runChatAction({ id: 'interview-skip', label: 'Skip' });

    expect(relationshipMock.skipCurrentQuestion).toHaveBeenCalled();
  });

  it('speaks from the same relationship file in an offline reply', () => {
    const fixture = TestBed.createComponent(ChatbotComponent);
    const component = fixture.componentInstance as any;

    const reply = component.localFallback('royalties');

    expect(relationshipMock.voice).toHaveBeenCalled();
    // Stage framing first, then the artist's own recorded fact — the Studio
    // panel's offline path speaks exactly this way.
    expect(reply).toContain('4 moments on the file');
    expect(reply).toContain('Debut tape');
  });

  it('does not double the file when the case file already quotes the artist', () => {
    // One quote of the artist's record per answer: the callback wins, the
    // rotating note stays out, and the opener still frames the reply.
    const memory = TestBed.inject(SmuveMemoryService);
    TestBed.flushEffects();
    memory.captureTurn(
      'mixing',
      'Mix Bus',
      'I need to fix the low end',
      'Cut 180Hz and sidechain the kick.',
    );
    const fixture = TestBed.createComponent(ChatbotComponent);
    const component = fixture.componentInstance as any;

    const reply = component.localFallback('royalties');

    expect(reply).toContain('4 moments on the file');
    expect(reply).toContain('Cut 180Hz');
    expect(reply).not.toContain('Debut tape');
  });
});
