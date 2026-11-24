import { TestBed } from '@angular/core/testing';

import { SpeechSynthesisService } from './speech-synthesis.service';

/**
 * The executable half of docs/PERSONA_CONTRACT.md.
 *
 * These are not feature tests: they are the promises the character makes, so a
 * refactor that trades one away fails here by name instead of quietly sounding
 * different in the product.
 */
describe('S.M.U.V.E. persona contract', () => {
  let service: SpeechSynthesisService;
  let synth: any;
  let utterances: any[];

  beforeEach(() => {
    utterances = [];
    synth = {
      speak: jest.fn(),
      cancel: jest.fn(),
      getVoices: jest.fn().mockReturnValue([
        { name: 'Google US English', lang: 'en-US' },
        { name: 'Microsoft Aria Online (Natural)', lang: 'en-US' },
        { name: 'Zarvox', lang: 'en-US' },
      ]),
    };
    (global as any).SpeechSynthesisUtterance = jest
      .fn()
      .mockImplementation(() => {
        const utterance: Record<string, unknown> = {};
        utterances.push(utterance);
        return utterance;
      });
    Object.defineProperty(window, 'speechSynthesis', {
      value: synth,
      writable: true,
      configurable: true,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SpeechSynthesisService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  /** Spoken text of one utterance, defaulting to the one just queued. */
  const spokenLine = (index = -1) => {
    const calls = (global.SpeechSynthesisUtterance as jest.Mock).mock.calls;
    const text = calls.at(index)?.[0] as string;
    return text.replace(/\s+(…|—|\.\.\.)$/, '');
  };

  it('promises every sentence is a different entity', () => {
    service.speak('One. Two! Three? Four. Five! Six? Seven. Eight!');

    const tones: string[] = [];
    utterances.forEach((utterance) => {
      utterance.onstart();
      tones.push(service.liveVoice()!.archetype);
    });

    expect(new Set(tones).size).toBeGreaterThanOrEqual(7);
    tones.forEach((tone, index) => {
      if (index > 0) expect(tone).not.toBe(tones[index - 1]);
    });
  });

  it('promises the full spectrum, not one register at different pitches', () => {
    service.speak('A. B. C. D. E. F. G. H. I. J. K.');
    const pitches = utterances.map((utterance) => utterance.pitch as number);

    expect(Math.min(...pitches)).toBeLessThan(0.5);
    expect(Math.max(...pitches)).toBeGreaterThan(1.4);
  });

  it('promises the growl is added to the performance, never replacing the words', () => {
    service.speak('Fix the low end.', { forceArchetype: 'Creature' });

    const spoken = (global.SpeechSynthesisUtterance as jest.Mock).mock
      .calls[0][0] as string;
    // Texture is an addition in front of the line...
    expect(spoken).toMatch(/^Mmm\. /);
    expect(spoken).toContain('low end.');
    // ...and the report names the delivery that was used.
    utterances[0].onstart();
    expect(service.liveVoice()?.texture).toBe('growl');
    expect(service.liveVoice()?.archetype).toBe('Creature');
  });

  it('promises profanity is only censored when explicitly disabled', () => {
    service.speak('Shut the fuck up.', { allowVulgarLanguage: true });
    expect(spokenLine()).toBe('Shut the fuck up.');

    service.speak('Shut the fuck up.', { allowVulgarLanguage: false });
    expect(spokenLine()).not.toContain('fuck');
  });

  it('promises novelty voices never speak for the character', () => {
    service.speak('One. Two! Three?');

    const names = utterances.map((utterance) => utterance.voice.name);
    expect(names).not.toContain('Zarvox');
    expect(service.humanVoiceNames()).toEqual([
      'Google US English',
      'Microsoft Aria Online (Natural)',
    ]);
  });

  it('promises the roster describes every tone it can speak', () => {
    const catalog = service.archetypeCatalog();

    expect(catalog.length).toBeGreaterThanOrEqual(11);
    for (const row of catalog) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.description.length).toBeGreaterThan(0);
      expect(['male', 'female', 'neutral', 'creature']).toContain(row.gender);
      expect(['plain', 'stutter', 'growl', 'choral']).toContain(row.texture);
    }
    const textures = new Set(catalog.map((row) => row.texture));
    expect(textures.has('stutter')).toBe(true);
    expect(textures.has('growl')).toBe(true);
    expect(textures.has('choral')).toBe(true);
  });
});
