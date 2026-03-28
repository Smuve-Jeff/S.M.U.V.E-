import { TestBed } from '@angular/core/testing';
import { SpeechSynthesisService } from './speech-synthesis.service';

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

    service.speak('Hello');

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(mockUtterances[0].voice).toEqual({
      name: 'Microsoft David',
      lang: 'en-US',
    });
    expect(mockUtterances[0].pitch).toBe(0.7);
    expect(mockUtterances[0].rate).toBe(0.82);
  });

  it('should replace S.M.U.V.E 4.2 with Smooth', () => {
    service.speak('Welcome to S.M.U.V.E 4.2');

    expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith(
      'Welcome to Smooth'
    );
  });

  it('should cancel previous speech when speaking new text', () => {
    service.speak('Hello');
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });

  it('should avoid reusing the same voice when alternatives exist', () => {
    mockSpeechSynthesis.getVoices.mockReturnValue([
      { name: 'Voice A', lang: 'en-US' },
      { name: 'Voice B', lang: 'en-US' },
    ]);
    randomSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    service.speak('First');
    service.speak('Second');

    expect(mockUtterances[0].voice).toEqual({
      name: 'Voice A',
      lang: 'en-US',
    });
    expect(mockUtterances[1].voice).toEqual({
      name: 'Voice B',
      lang: 'en-US',
    });
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
