import { TestBed } from '@angular/core/testing';
import { MicrophoneService } from '../microphone.service';
import { AudioEngineService } from '../audio-engine.service';
import { LoggingService } from '../logging.service';

const loggerMock = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

function setMediaDevices(value: any) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
}

function inputDevice(deviceId: string, label = ''): any {
  return { kind: 'audioinput', deviceId, label };
}

/** Swap in a recording-capable MediaRecorder and always restore the polyfill. */
function withMediaRecorder<T>(run: (Recorder: jest.Mock) => T): T {
  const Original = (globalThis as any).MediaRecorder;
  const Recorder: jest.Mock = jest.fn().mockImplementation(() => ({
    state: 'inactive',
    mimeType: 'audio/webm;codecs=opus',
    start: jest.fn(),
    stop: jest.fn(),
  }));
  (Recorder as any).isTypeSupported = jest.fn(() => true);
  (globalThis as any).MediaRecorder = Recorder;
  try {
    return run(Recorder);
  } finally {
    (globalThis as any).MediaRecorder = Original;
  }
}

describe('MicrophoneService', () => {
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => setMediaDevices(originalMediaDevices));

  describe('device classification', () => {
    let service: MicrophoneService;

    beforeEach(() => {
      setMediaDevices(undefined);
      TestBed.configureTestingModule({
        providers: [
          MicrophoneService,
          { provide: LoggingService, useValue: loggerMock },
          { provide: AudioEngineService, useValue: { ctx: {} } },
        ],
      });
      service = TestBed.inject(MicrophoneService);
    });

    it('classifies rich interface capabilities for default phantom-powered devices', () => {
      const device = service.describeDevice({
        deviceId: 'default',
        label: 'Default Focusrite Scarlett 48V Headphones MIDI',
      } as MediaDeviceInfo);

      expect(device.type).toBe('interface');
      expect(device.isDefault).toBe(true);
      expect(device.capabilities).toEqual(
        expect.arrayContaining([
          'default',
          'phantom-power',
          'headphone-monitoring',
          'midi-ready',
          'stereo',
          'usb-interface',
        ])
      );
    });

    it('detects speakerphone inputs separately from standard microphones', () => {
      const device = service.describeDevice({
        deviceId: 'communications',
        label: 'USB Speakerphone Mic',
      } as MediaDeviceInfo);

      expect(device.type).toBe('speakerphone');
      expect(device.capabilities).toEqual(
        expect.arrayContaining(['default', 'speakerphone'])
      );
    });
  });

  describe('device enumeration', () => {
    let service: MicrophoneService;
    let addEventListener: jest.Mock;

    function boot(enumerateDevices: jest.Mock): MicrophoneService {
      addEventListener = jest.fn();
      setMediaDevices({
        enumerateDevices,
        addEventListener,
        removeEventListener: jest.fn(),
        getUserMedia: jest.fn(),
      });
      TestBed.configureTestingModule({
        providers: [
          MicrophoneService,
          { provide: LoggingService, useValue: loggerMock },
          { provide: AudioEngineService, useValue: { ctx: {} } },
        ],
      });
      return TestBed.inject(MicrophoneService);
    }

    it('lists audio inputs without prompting for permission on load', async () => {
      const enumerateDevices = jest
        .fn()
        .mockResolvedValue([
          inputDevice('default'),
          { kind: 'audiooutput', deviceId: 'speaker', label: '' },
        ]);
      service = boot(enumerateDevices);

      await service.updateAvailableDevices();

      expect(service.availableDevices().length).toBe(1);
      expect(service.selectedDeviceId()).toBe('default');
      expect(enumerateDevices).toHaveBeenCalled();
    });

    it('registers a devicechange listener so hot-plugged mics appear', () => {
      service = boot(jest.fn().mockResolvedValue([]));

      expect(addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
    });

    it('keeps the selected input while it is still connected', async () => {
      service = boot(
        jest.fn().mockResolvedValue([inputDevice('a'), inputDevice('b')])
      );

      await service.updateAvailableDevices();
      service.selectedDeviceId.set('b');
      await service.updateAvailableDevices();

      expect(service.selectedDeviceId()).toBe('b');
    });

    it('falls back to the first input when the selection disappears', async () => {
      service = boot(
        jest.fn().mockResolvedValue([inputDevice('a'), inputDevice('b')])
      );

      await service.updateAvailableDevices();
      service.selectedDeviceId.set('unplugged');
      await service.updateAvailableDevices();

      expect(service.selectedDeviceId()).toBe('a');
    });

    it('records a denied permission instead of failing silently', async () => {
      const denied = Object.assign(new Error('denied'), {
        name: 'NotAllowedError',
      });
      service = boot(jest.fn().mockRejectedValue(denied));

      await service.updateAvailableDevices();

      expect(service.permissionState()).toBe('denied');
      expect(service.lastError()).toContain('permission');
    });
  });

  describe('processed capture', () => {
    let service: MicrophoneService;
    let processedStream: any;
    let ctx: any;

    beforeEach(() => {
      setMediaDevices(undefined);
      processedStream = new (globalThis as any).MediaStream();
      ctx = {
        createMediaStreamDestination: jest.fn(() => ({
          stream: processedStream,
          disconnect: jest.fn(),
        })),
      };
      TestBed.configureTestingModule({
        providers: [
          MicrophoneService,
          { provide: LoggingService, useValue: loggerMock },
          { provide: AudioEngineService, useValue: { ctx } },
        ],
      });
      service = TestBed.inject(MicrophoneService);
      service.isInitialized.set(true);
    });

    afterEach(() => service.ngOnDestroy());

    function processedNode() {
      return { context: ctx, connect: jest.fn(), disconnect: jest.fn() } as any;
    }

    it('taps the finished vocal chain so takes capture the mastered signal', () => {
      const node = processedNode();

      expect(service.attachProcessedCapture(node)).toBe(true);
      expect(service.usingProcessedCapture()).toBe(true);
      expect(service.capturePathLabel()).toBe('Processed vocal chain');
      expect(node.connect).toHaveBeenCalledTimes(1);
    });

    it('does not double-tap the same chain when attached twice', () => {
      const node = processedNode();

      service.attachProcessedCapture(node);
      service.attachProcessedCapture(node);

      expect(node.connect).toHaveBeenCalledTimes(1);
    });

    it('rejects a processed chain from another AudioContext', () => {
      const foreign = {
        context: {},
        connect: jest.fn(),
        disconnect: jest.fn(),
      } as any;

      expect(service.attachProcessedCapture(foreign)).toBe(false);
      expect(service.usingProcessedCapture()).toBe(false);
      expect(foreign.connect).not.toHaveBeenCalled();
    });

    it('records the processed stream and resets the take timer', () => {
      service.recordingTime.set(12.5);
      service.attachProcessedCapture(processedNode());
      (service as any).mediaStream = new (globalThis as any).MediaStream();

      withMediaRecorder((Recorder) => {
        service.startRecording();

        expect(Recorder).toHaveBeenCalledWith(
          processedStream,
          expect.objectContaining({ mimeType: 'audio/webm;codecs=opus' })
        );
      });

      expect(service.recordingTime()).toBe(0);
      expect(service.isRecording()).toBe(true);
    });

    it('records the raw input when no processed chain is attached', () => {
      const raw = new (globalThis as any).MediaStream();
      (service as any).mediaStream = raw;

      withMediaRecorder((Recorder) => {
        service.startRecording();

        expect(Recorder).toHaveBeenCalledWith(raw, expect.anything());
      });
    });

    it('drops the processed tap on stop so the raw input resumes', () => {
      service.attachProcessedCapture(processedNode());

      service.stop();

      expect(service.usingProcessedCapture()).toBe(false);
      expect(service.capturePathLabel()).toBe('Raw microphone input');
    });

    it('refuses to switch inputs mid-take and reports why', async () => {
      service.isRecording.set(true);

      expect(service.canSwitchDevice()).toBe(false);
      await expect(service.setInputDevice('usb-mic')).resolves.toBe(false);
      expect(service.lastError()).toBe(
        'Stop the take before switching microphones'
      );
    });
  });
});
