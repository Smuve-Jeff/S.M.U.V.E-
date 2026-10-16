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
    delete (window as any).isSecureContext;
    delete (window as any).Capacitor;
    delete (document as any).permissionsPolicy;
    delete (document as any).featurePolicy;
    delete (navigator as any).permissions;
    delete (navigator as any).mediaDevices;
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

  /** Install a deterministic recognition engine and return its instance. */
  function installRecognition(): any {
    const recognition: any = {
      continuous: true,
      interimResults: true,
      lang: '',
      maxAlternatives: 0,
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
      onresult: null,
      onend: null,
      onerror: null,
    };
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: jest.fn(() => recognition),
    });
    return recognition;
  }

  /** Let the service's own promise chains settle (no fake timers here). */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  it('follows the device language instead of assuming en-US', () => {
    const recognition = installRecognition();
    createService();

    expect(recognition.lang).toBe(navigator.language);
    expect(recognition.maxAlternatives).toBe(1);
  });

  it('reports an insecure context as its own capability and refuses to capture', () => {
    const recognition = installRecognition();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    const service = createService();
    const onError = jest.fn();

    // The API exists, so the mic stays pressable — but capture is impossible
    // and the reason must be explainable.
    expect(service.isSupported()).toBe(true);
    expect(service.capability()).toBe('insecure-context');
    expect(service.canListen()).toBe(false);
    expect(service.capabilityMessage()).toContain('https');

    service.startListening(jest.fn(), onError);
    expect(recognition.start).not.toHaveBeenCalled();
    expect(service.isListening()).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'insecure-context' })
    );
  });

  it('treats a Permissions-Policy microphone denial as its own capability', () => {
    installRecognition();
    Object.defineProperty(document, 'permissionsPolicy', {
      configurable: true,
      value: { allowsFeature: () => false },
    });
    const service = createService();

    expect(service.capability()).toBe('policy-blocked');
    expect(service.canListen()).toBe(false);
    expect(service.capabilityMessage()).toContain(
      'not allowed to use the microphone'
    );
  });

  it('distinguishes the packaged app shell from a browser without speech', () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    const service = createService();

    expect(service.isSupported()).toBe(false);
    expect(service.capability()).toBe('native-shell');
    expect(service.capabilityMessage()).toContain('mobile app shell');
  });

  it('turns a blocked microphone into a retry that asks the platform again', async () => {
    const recognition = installRecognition();
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: jest.fn().mockResolvedValue({ state: 'denied' }) },
    });
    const getUserMedia = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
      );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const service = createService();
    const onError = jest.fn();

    await service.refreshPermissionState();
    expect(service.capability()).toBe('permission-denied');
    expect(service.isBlocked()).toBe(true);
    // Retrying is allowed on purpose: that is how access gets re-granted.
    expect(service.canListen()).toBe(true);

    service.startListening(jest.fn(), onError);
    await flush();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(recognition.start).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'permission-denied' })
    );
    expect(service.capabilityMessage()).toContain('Microphone access is blocked');
  });

  it('starts dictation once the microphone is granted again', async () => {
    const recognition = installRecognition();
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: jest.fn().mockResolvedValue({ state: 'denied' }) },
    });
    const stopTrack = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
      },
    });
    const service = createService();
    const onResult = jest.fn();

    await service.refreshPermissionState();
    expect(service.capability()).toBe('permission-denied');

    service.startListening(onResult);
    await flush();

    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalled();
    expect(service.capability()).toBe('ready');
    expect(service.isListening()).toBe(true);

    recognition.onresult({ results: [{ 0: { transcript: 'bounce the mix' } }] });
    expect(onResult).toHaveBeenCalledWith('bounce the mix');
  });

  it('maps engine failures onto actionable messages', () => {
    const recognition = installRecognition();
    const service = createService();
    const onError = jest.fn();

    service.startListening(jest.fn(), onError);
    recognition.onerror({ error: 'audio-capture' });
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'audio-capture',
        message: expect.stringContaining('No microphone'),
      })
    );
    expect(service.capability()).toBe('no-microphone');

    service.startListening(jest.fn(), onError);
    recognition.onerror({ error: 'network' });
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'network',
        message: expect.stringContaining('network'),
      })
    );

    service.startListening(jest.fn(), onError);
    recognition.onerror({ error: 'not-allowed' });
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'not-allowed',
        message: expect.stringContaining('Microphone access is blocked'),
      })
    );
    expect(service.capability()).toBe('permission-denied');
    expect(service.isListening()).toBe(false);
  });

  it('does not report a deliberate abort as a failure', () => {
    const recognition = installRecognition();
    const service = createService();
    const onError = jest.fn();

    service.startListening(jest.fn(), onError);
    recognition.onerror({ error: 'aborted' });

    expect(onError).not.toHaveBeenCalled();
    expect(service.lastError()).toBeNull();
  });

  it('reports silence instead of ending without a word', () => {
    const recognition = installRecognition();
    const service = createService();
    const onError = jest.fn();
    const onResult = jest.fn();

    service.startListening(onResult, onError);
    recognition.onend();

    expect(onResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'no-speech',
        message: expect.stringContaining('Nothing was heard'),
      })
    );
    expect(service.isListening()).toBe(false);

    // A captured transcript must not be followed by a spurious silence error.
    onError.mockClear();
    service.startListening(onResult, onError);
    recognition.onresult({ results: [{ 0: { transcript: 'louder hook' } }] });
    recognition.onend();
    expect(onError).not.toHaveBeenCalled();
  });

  it('aborts a capture without delivering a partial transcript', () => {
    const recognition = installRecognition();
    const service = createService();

    service.startListening(jest.fn());
    expect(service.isListening()).toBe(true);

    service.abort();

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(service.isListening()).toBe(false);
  });

  it('falls back to stop() when the engine cannot abort', () => {
    const recognition = installRecognition();
    delete recognition.abort;
    const service = createService();

    service.startListening(jest.fn());
    service.abort();

    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(service.isListening()).toBe(false);
  });

  it('reports a start failure instead of leaving the mic stuck listening', () => {
    const recognition = installRecognition();
    recognition.start = jest.fn(() => {
      throw new Error('engine busy');
    });
    const service = createService();
    const onError = jest.fn();

    service.startListening(jest.fn(), onError);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'start-failed' })
    );
    expect(service.isListening()).toBe(false);
  });
});
