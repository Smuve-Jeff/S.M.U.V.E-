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

  /**
   * The utterance text with the trailing breath gesture removed — i.e. the line
   * the artist actually gets read back. The gesture is the separate per-sentence
   * delivery layer asserted in 'signature persona and delivery texture'.
   */
  const transcriptOf = (index = 0) =>
    (
      (global.SpeechSynthesisUtterance as jest.Mock).mock.calls[index][0] as string
    ).replace(/\s+(…|—|\.\.\.)$/, '');

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

    expect(transcriptOf(0)).toBe('Welcome to Smooth');
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

  it('should give every sentence a different vocal tone from the full spectrum', () => {
    service.speak('One. Two! Three? Four… Five. Six! Seven? Eight.');

    const tones: string[] = [];
    mockUtterances.forEach((u) => {
      u.onstart();
      tones.push(service.liveVoice()!.archetype);
    });

    expect(tones).toHaveLength(8);
    tones.forEach((tone, i) => {
      if (i > 0) expect(tone).not.toBe(tones[i - 1]);
    });
    // Eight sentences must reach well beyond the bass/tenor families.
    expect(new Set(tones).size).toBeGreaterThanOrEqual(7);
  });

  it('should use every vocal tone before repeating any tone', () => {
    randomSpy.mockReturnValue(0.42);
    const sentences = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`);

    service.speak(sentences.join(' '));

    const tones: string[] = [];
    mockUtterances.forEach((u) => {
      u.onstart();
      tones.push(service.liveVoice()!.archetype);
    });

    // 11 distinct tones exist in the table; the deck must surface all of them
    // inside two cycles of a 30-sentence message, and the first pass must be
    // repeat-free — that is the "every tone before any repeat" guarantee.
    expect(new Set(tones).size).toBe(11);
    expect(tones.slice(0, 11).length).toBe(new Set(tones.slice(0, 11)).size);
    expect(tones).toEqual(
      expect.arrayContaining(['Deep Bass (Male)', 'Soprano Elite (Female)'])
    );
  });

  it('should walk the whole pitch range inside one message', () => {
    // A deterministic cycle keeps the run reproducible while still moving the
    // band picker through every branch.
    const cycle = [
      0, 0.9, 0.4, 0.7, 0.1, 0.6, 0.95, 0.2, 0.8, 0.35, 0.55, 0.05, 0.65,
      0.85, 0.15, 0.45,
    ];
    let cursor = 0;
    randomSpy.mockImplementation(() => cycle[cursor++ % cycle.length]);

    service.speak(
      'Alpha. Beta! Gamma? Delta. Epsilon! Zeta? Eta. Theta! Iota. Kappa. Lambda! Mu?'
    );

    const pitches = mockUtterances.map((u) => u.pitch);
    const bands: string[] = [];
    mockUtterances.forEach((u) => {
      u.onstart();
      bands.push(service.liveVoice()!.band);
    });

    expect(mockUtterances.length).toBeGreaterThanOrEqual(12);
    expect(Math.min(...pitches)).toBeLessThan(0.5);
    expect(Math.max(...pitches)).toBeGreaterThan(1.4);
    expect(new Set(bands)).toEqual(new Set(['low', 'mid', 'high']));
    bands.forEach((band, i) => {
      if (i > 0) expect(band).not.toBe(bands[i - 1]);
    });
  });

  it('should keep forcing one archetype when a caller pins the register (mimic mode)', () => {
    service.speak('Pinned one. Pinned two! Pinned three?', {
      forceArchetype: 'Alto Dominance (Female)',
    });

    mockUtterances.forEach((u) => {
      u.onstart();
      expect(service.liveVoice()?.archetype).toBe('Alto Dominance (Female)');
    });
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

    expect(transcriptOf(0)).toBe('Shut the **** up, *****.');
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

    expect(transcriptOf(0)).toBe('You **** piece of ****.');
  });

  it('should expose conversational prosody for long and urgent sentences', () => {
    randomSpy.mockReturnValue(0);

    service.speak(
      'This is a deliberately long production note that should be delivered with measured pacing so the native browser voice remains intelligible and human sounding.'
    );
    mockUtterances[0].onstart();
    expect(service.liveVoice()?.prosody).toBe('measured');

    service.speak('Move now!');
    mockUtterances[1].onstart();
    expect(service.liveVoice()?.prosody).toBe('urgent');
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

  it('pins the utterance language to the chosen voice', () => {
    mockSpeechSynthesis.getVoices.mockReturnValue([
      { name: 'Microsoft David', lang: 'en-GB' },
    ]);
    randomSpy.mockReturnValue(0);

    service.speak('Language check.');

    expect(mockUtterances[0].lang).toBe('en-GB');
  });

  it('reports ready once the engine has published voices', () => {
    expect(service.outputCapability()).toBe('ready');
  });

  /**
   * Chromium and the Android WebView answer an empty voice list until the
   * `voiceschanged` event. Speaking in that window assigns no voice at all,
   * which those engines can render as silence — the reply that worked on
   * desktop and produced nothing in the packaged app.
   */
  describe('when the engine has not published its voices yet', () => {
    const createServiceWithLaggingVoices = () => {
      const listeners: Record<string, () => void> = {};
      mockSpeechSynthesis.getVoices.mockReturnValue([]);
      mockSpeechSynthesis.addEventListener = jest.fn(
        (type: string, callback: () => void) => {
          listeners[type] = callback;
        }
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const lagging = TestBed.inject(SpeechSynthesisService);
      return {
        lagging,
        publishVoices: () => {
          mockSpeechSynthesis.getVoices.mockReturnValue([
            { name: 'Microsoft David', lang: 'en-US', default: true },
          ]);
          listeners['voiceschanged']?.();
          return Promise.resolve();
        },
        flush: () => new Promise((resolve) => setTimeout(resolve, 0)),
      };
    };

    it('reports that it is still warming up instead of claiming it will speak', () => {
      const { lagging } = createServiceWithLaggingVoices();

      expect(lagging.outputCapability()).toBe('loading');
    });

    it('waits for the voice list, then speaks with a real voice', async () => {
      const { lagging, publishVoices, flush } =
        createServiceWithLaggingVoices();

      lagging.speak('Hold the line.');
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();

      await publishVoices();
      await flush();

      expect(lagging.outputCapability()).toBe('ready');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
      expect(mockUtterances[0].voice).toMatchObject({ name: 'Microsoft David' });
    });

    it('never speaks a reply that a newer one superseded', async () => {
      const { lagging, publishVoices, flush } =
        createServiceWithLaggingVoices();

      lagging.speak('First reply.');
      lagging.speak('Second reply.');

      await publishVoices();
      await flush();

      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    });

    it('reports no voices once the bounded wait expires', () => {
      jest.useFakeTimers();
      try {
        const { lagging } = createServiceWithLaggingVoices();

        expect(lagging.outputCapability()).toBe('loading');
        jest.advanceTimersByTime(1500);

        expect(lagging.outputCapability()).toBe('no-voices');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  /**
   * The identity contract: the signature persona reasserts itself on every
   * reply, every sentence still changes voice, and the non-human personas get a
   * delivery of their own instead of being the same reader one octave apart.
   */
  describe('signature persona and delivery texture', () => {
    const spokenTexts = () =>
      (global.SpeechSynthesisUtterance as jest.Mock).mock.calls.map(
        (call) => call[0] as string
      );

    it('opens every reply in the signature persona', () => {
      randomSpy.mockReturnValue(0.5);

      service.speak('First reply. A second sentence follows.');
      service.speak('Another reply. Its second sentence too.');

      mockUtterances[0].onstart();
      expect(service.liveVoice()?.archetype).toBe('Ominous Protocol');
      mockUtterances[2].onstart();
      expect(service.liveVoice()?.archetype).toBe('Ominous Protocol');
    });

    it('still never repeats the previous tone when a reply opens', () => {
      randomSpy.mockReturnValue(0.5);

      service.speak('One sentence reply.');
      service.speak('Next reply opener.');

      mockUtterances[0].onstart();
      const anchor = service.liveVoice()?.archetype;
      mockUtterances[1].onstart();
      const next = service.liveVoice()?.archetype;

      expect(anchor).toBe('Ominous Protocol');
      expect(next).not.toBe(anchor);
    });

    it('gives the non-human personas a delivery texture of their own', () => {
      randomSpy.mockReturnValue(0);

      service.speak('Fix the low end.', { forceArchetype: 'Creature' });
      service.speak('Fix the low end.', {
        forceArchetype: 'Childlike Glitch',
      });
      service.speak('Fix the low end.', { forceArchetype: 'Choir (Layered)' });

      const [growl, stutter, choral] = spokenTexts();
      expect(growl).toMatch(/^Mmm\. /);
      expect(stutter).toMatch(/^Fi-Fix the low end\./);
      expect(choral).toMatch(/^Aaah\. .*one voice\./);

      mockUtterances[0].onstart();
      expect(service.liveVoice()?.texture).toBe('growl');
      mockUtterances[1].onstart();
      expect(service.liveVoice()?.texture).toBe('stutter');
      mockUtterances[2].onstart();
      expect(service.liveVoice()?.texture).toBe('choral');
    });

    it('keeps the archetype texture on the stable audition path', () => {
      randomSpy.mockReturnValue(0);

      service.speak('Fix the low end.', {
        shapeShift: false,
        forceArchetype: 'Creature',
      });

      // The Voice Lab auditions one tone; the tone's own delivery still applies
      // (reporting `plain` here made the lab misdescribe what it played).
      expect(spokenTexts()[0]).toMatch(/^Mmm\. /);
      mockUtterances[0].onstart();
      expect(service.liveVoice()?.band).toBe('stable');
      expect(service.liveVoice()?.texture).toBe('growl');
    });

    it('lists every tone with the delivery texture it speaks in', () => {
      const catalog = service.archetypeCatalog();

      expect(catalog).toHaveLength(11);
      expect(catalog.find((t) => t.name === 'Creature')?.texture).toBe('growl');
      expect(catalog.find((t) => t.name === 'Childlike Glitch')?.texture).toBe(
        'stutter'
      );
      expect(catalog.find((t) => t.name === 'Choir (Layered)')?.texture).toBe(
        'choral'
      );
      expect(catalog.find((t) => t.name === 'Ominous Protocol')?.texture).toBe(
        'plain'
      );
      expect(service.getArchetypeNames()).toHaveLength(11);
      expect(service.availableVoiceNames()).toEqual([
        'Google English',
        'Microsoft David',
        'Microsoft Zira',
      ]);
    });

    it('keeps human personas plain and never breathes the same way twice', () => {
      randomSpy.mockReturnValue(0);

      service.speak('Fix the low end.', {
        forceArchetype: 'Baritone Authority (Male)',
      });
      service.speak('Fix the low end.', {
        forceArchetype: 'Baritone Authority (Male)',
      });

      const [first, second] = spokenTexts();
      expect(first.startsWith('Fix the low end.')).toBe(true);
      expect(first).not.toBe(second);

      mockUtterances[1].onstart();
      expect(service.liveVoice()?.texture).toBe('plain');
    });
  });

  /**
   * The Voice Lab contract. `setArchetype` used to only seed the archetype
   * history, which the spectrum deck ignored on the next draw — the pin now
   * really holds the register for exactly one reply.
   */
  describe('Voice Lab pinning', () => {
    it('holds a pinned archetype for one reply, then releases it', () => {
      randomSpy.mockReturnValue(0.5);

      service.setArchetype('Creature');
      expect(service.pinnedArchetypeName()).toBe('Creature');

      service.speak('First reply.');
      expect(service.pinnedArchetypeName()).toBeNull();

      mockUtterances[0].onstart();
      expect(service.liveVoice()?.archetype).toBe('Creature');
      expect(service.liveVoice()?.texture).toBe('growl');

      service.speak('Second reply.');
      mockUtterances[1].onstart();
      expect(service.liveVoice()?.archetype).not.toBe('Creature');
    });

    it('lets an explicit per-call archetype outrank a pin', () => {
      randomSpy.mockReturnValue(0.5);

      service.setArchetype('Creature');
      service.speak('Forced.', { forceArchetype: 'Soprano Elite (Female)' });

      mockUtterances[0].onstart();
      expect(service.liveVoice()?.archetype).toBe('Soprano Elite (Female)');
      // The pin was not the archetype that spoke, so it survives for its reply.
      expect(service.pinnedArchetypeName()).toBe('Creature');
    });

    it('releases a pin on demand without speaking', () => {
      service.setArchetype('Creature');

      service.clearArchetypePin();

      expect(service.pinnedArchetypeName()).toBeNull();
    });
  });
});
