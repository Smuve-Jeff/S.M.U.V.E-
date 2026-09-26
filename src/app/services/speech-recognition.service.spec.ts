import { TestBed } from '@angular/core/testing';
import { LoggingService } from './logging.service';
import { SpeechRecognitionService } from './speech-recognition.service';

describe('SpeechRecognitionService', () => {
  let originalSpeechRecognition: PropertyDescriptor | undefined;
  let originalWebkitSpeechRecognition: PropertyDescriptor | undefined;
  let loggingServiceMock: { error: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    originalSpeechRecognition = Object.getOwnPropertyDescriptor(
      window,
      'SpeechRecognition'
    );
    originalWebkitSpeechRecognition = Object.getOwnPropertyDescriptor(
      window,
      'webkitSpeechRecognition'
    );
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    loggingServiceMock = { error: jest.fn(), warn: jest.fn() };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (originalSpeechRecognition) {
      Object.defineProperty(window, 'SpeechRecognition', originalSpeechRecognition);
    } else {
      delete (window as any).SpeechRecognition;
    }
    if (originalWebkitSpeechRecognition) {
      Object.defineProperty(
        window,
        'webkitSpeechRecognition',
        originalWebkitSpeechRecognition
      );
    } else {
      delete (window as any).webkitSpeechRecognition;
    }
  });

  function createService(): SpeechRecognitionService {
    TestBed.configureTestingModule({
      providers: [
        SpeechRecognitionService,
        { provide: LoggingService, useValue: loggingServiceMock },
      ],
    });
    return TestBed.inject(SpeechRecognitionService);
  }

  it('gracefully reports unsupported browsers without starting capture', () => {
    const service = createService();

    expect(service.isSupported()).toBe(false);
    service.startListening(jest.fn());
    expect(service.isListening()).toBe(false);
  });

  it('captures a trimmed transcript and can stop a later listening session', () => {
    const recognition: any = {
      continuous: true,
      interimResults: true,
      start: jest.fn(),
      stop: jest.fn(),
      onresult: null,
      onend: null,
      onerror: null,
    };
    const constructor = jest.fn(() => recognition);
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: constructor,
    });
    const service = createService();
    const onResult = jest.fn();

    expect(service.isSupported()).toBe(true);
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(false);

    service.startListening(onResult);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(service.isListening()).toBe(true);

    recognition.onresult({
      results: [{ 0: { transcript: '  open the studio  ' } }],
    });
    expect(onResult).toHaveBeenCalledWith('open the studio');
    expect(service.isListening()).toBe(false);

    service.startListening(onResult);
    service.stopListening();
    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(service.isListening()).toBe(false);
  });
});
