import { TestBed } from '@angular/core/testing';
import { SpeechSynthesisService } from './speech-synthesis.service';

describe('SpeechSynthesisService', () => {
  let service: SpeechSynthesisService;
  let mockSpeechSynthesis: any;
  let mockUtterance: any;

  beforeEach(() => {
    mockSpeechSynthesis = {
      speak: jest.fn(),
      cancel: jest.fn(),
      getVoices: jest.fn().mockReturnValue([{ name: 'Google English', lang: 'en-US' }]),
    };

    mockUtterance = {};
    (global as any).SpeechSynthesisUtterance = jest.fn().mockImplementation(() => mockUtterance);

    // In JSDOM/Jest, window might already exist, so we need to be careful
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(SpeechSynthesisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should speak with normal pitch and rate', () => {
    service.speak('Hello');

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(mockUtterance.pitch).toBe(1.0);
    expect(mockUtterance.rate).toBe(1.0);
  });

  it('should replace S.M.U.V.E with Smooth', () => {
    service.speak('Welcome to S.M.U.V.E');

    expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith('Welcome to Smooth');
  });

  it('should cancel previous speech when speaking new text', () => {
    service.speak('Hello');
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });
});
