import { TestBed } from '@angular/core/testing';
import { SpeechSynthesisService } from './speech-synthesis.service';
import { UserProfileService } from './user-profile.service';

describe('SpeechSynthesisService', () => {
  let service: SpeechSynthesisService;
  let mockSpeechSynthesis: any;
  let mockUtterances: any[];
  let randomSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    mockSpeechSynthesis = {
      speak: jest.fn(),
      cancel: jest.fn(),
      getVoices: jest.fn().mockReturnValue([
        { name: 'Google English', lang: 'en-US' },
        { name: 'Microsoft David', lang: 'en-US' },
        { name: 'Microsoft Zira', lang: 'en-US' },
      ]),
    };

    mockUtterances = [];
    (global as any).SpeechSynthesisUtterance = jest
      .fn()
      .mockImplementation(() => {
        const utterance = {};
        mockUtterances.push(utterance);
        return utterance;
      });

    // In JSDOM/Jest, window might already exist, so we need to be careful
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true,
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(SpeechSynthesisService);
    randomSpy = jest.spyOn(Math, 'random');
  });

  afterEach(() => {
    jest.clearAllMocks();
    randomSpy.mockRestore();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should apply a randomized voice profile when speaking', () => {
    randomSpy.mockReturnValue(0);

    service.speak('Hello', { conversationId: 'conv-1' });

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(mockUtterances[0].voice).toBeTruthy();
    expect(mockUtterances[0].voice).toHaveProperty('name');
    expect(mockUtterances[0].voice).toHaveProperty('lang');
    expect(typeof mockUtterances[0].pitch).toBe('number');
    expect(typeof mockUtterances[0].rate).toBe('number');
  });

  it('should replace S.M.U.V.E 2.0 with Smooth', () => {
    service.speak('S.M.U.V.E 2.0 INITIALIZED. ROOM DOMINANCE COMMENCING.');

    expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith(
      'Welcome to Smooth'
    );
  });

  it('should cancel previous speech when speaking new text', () => {
    service.speak('Hello', { conversationId: 'conv-1' });
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });

  it('should speak each sentence as its own utterance', () => {
    randomSpy.mockReturnValue(0);

    service.speak('One. Two! Three?');

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(3);
    expect(mockUtterances).toHaveLength(3);
    mockUtterances.forEach((u) => {
      expect(typeof u.pitch).toBe('number');
      expect(typeof u.rate).toBe('number');
    });
  });

  it('should sweep pitch from deep male bass to high female soprano', () => {
    randomSpy.mockReturnValue(0);
    service.speak('Low bass sentence.');

    randomSpy.mockReturnValue(0.99);
    service.speak('High soprano sentence.');

    expect(mockUtterances[0].pitch).toBeLessThan(0.5);
    expect(mockUtterances[1].pitch).toBeGreaterThan(1.5);
  });

  it('should shift to a different voice on every sentence', () => {
    mockSpeechSynthesis.getVoices.mockReturnValue([
      { name: 'Microsoft David', lang: 'en-US' },
      { name: 'Microsoft Zira', lang: 'en-US' },
    ]);
    randomSpy.mockReturnValue(0.99);

    service.speak('Low bass. High soprano!');

    expect(mockUtterances).toHaveLength(2);
    expect(mockUtterances[0].voice.name).not.toBe(
      mockUtterances[1].voice.name
    );
  });

  it('should not lock a voice per conversation — shape-shifts on the next message', () => {
    mockSpeechSynthesis.getVoices.mockReturnValue([
      { name: 'Voice A', lang: 'en-US' },
      { name: 'Voice B', lang: 'en-US' },
    ]);
    randomSpy.mockReturnValue(0);

    service.speak('First', { conversationId: 'conv-stable' });
    service.speak('Second', { conversationId: 'conv-stable' });

    expect(mockUtterances[0].voice).toEqual({ name: 'Voice A', lang: 'en-US' });
    expect(mockUtterances[1].voice).toEqual({ name: 'Voice B', lang: 'en-US' });
  });

  it('should speak as a single stable voice when shape-shift is disabled', () => {
    randomSpy.mockReturnValue(0);

    service.speak('Stable mode. Two sentences here!', { shapeShift: false });

    // Whole text collapses into ONE utterance with a single voice profile.
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(mockUtterances).toHaveLength(1);
    expect(typeof mockUtterances[0].pitch).toBe('number');
    expect(typeof mockUtterances[0].rate).toBe('number');
  });

  it('should expose a live voice readout while speaking', () => {
    randomSpy.mockReturnValue(0);

    service.speak('Hello there.');

    expect(service.liveVoice()).toBeNull();
    mockUtterances[0].onstart();
    expect(service.liveVoice()).toMatchObject({
      archetype: 'Ominous Protocol',
      band: 'low',
      voiceName: 'Microsoft David',
    });
    expect(typeof service.liveVoice()?.pitch).toBe('number');
    mockUtterances[0].onend();
    expect(service.liveVoice()).toBeNull();
    expect(service.isSpeaking()).toBe(false);
  });

  it('should default to the Ominous Protocol persona unless an archetype is forced', () => {
    randomSpy.mockReturnValue(0);

    service.speak('Test sentence.');
    mockUtterances[0].onstart();
    expect(service.liveVoice()?.archetype).toBe('Ominous Protocol');

    service.speak('Forced deep bass.', { forceArchetype: 'Deep Bass (Male)' });
    mockUtterances[1].onstart();
    expect(service.liveVoice()?.archetype).toBe('Deep Bass (Male)');
  });

  it('should never repeat the same pitch band on consecutive sentences', () => {
    randomSpy.mockReturnValue(0.99);

    service.speak('One. Two! Three?');

    const readouts: string[] = [];
    mockUtterances.forEach((u) => {
      u.onstart();
      readouts.push(service.liveVoice()!.band);
    });
    expect(readouts).toHaveLength(3);
    readouts.forEach((band, i) => {
      if (i > 0) expect(band).not.toBe(readouts[i - 1]);
    });
  });

  it('should censor profanity when allowVulgarLanguage is false', () => {
    randomSpy.mockReturnValue(0);

    service.speak('Shut the fuck up, bitch.', { allowVulgarLanguage: false });

    expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith(
      'Shut the **** up, *****.'
    );
  });

  it('should honor the user profile profanity preference', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserProfileService,
          useValue: {
            profile: () => ({
              settings: { ai: { aiProfanityEnabled: false } },
            }),
          },
        },
      ],
    });
    service = TestBed.inject(SpeechSynthesisService);
    randomSpy.mockReturnValue(0);

    service.speak('You damn piece of crap.');

    expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith(
      'You **** piece of ****.'
    );
  });

  it('should continue speaking when explicit voice assignment is rejected', () => {
    const failingUtterance: Record<string, unknown> = {};
    Object.defineProperty(failingUtterance, 'voice', {
      configurable: true,
      set: () => {
        throw new TypeError('Unsupported voice object');
      },
    });
    (global as any).SpeechSynthesisUtterance = jest
      .fn()
      .mockImplementation(() => failingUtterance);

    expect(() => service.speak('Fallback voice')).not.toThrow();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect((failingUtterance as any).pitch).toBeDefined();
    expect((failingUtterance as any).rate).toBeDefined();
  });
});
