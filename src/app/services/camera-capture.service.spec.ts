import { TestBed } from '@angular/core/testing';

import { CameraCaptureService } from './camera-capture.service';
import { LoggingService } from './logging.service';

/** MediaRecorder stub mirroring the browser's dataavailable→stop ordering. */
class FakeMediaRecorder {
  static isTypeSupported = jest.fn(
    (type: string) => type === 'video/webm;codecs=vp8,opus'
  );

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(
    public stream: unknown,
    public options?: unknown
  ) {}

  start = jest.fn(() => {
    this.state = 'recording';
  });

  // The real MediaRecorder flushes its final chunk asynchronously — the fake
  // has to do the same or discard-on-stop races become untestable.
  stop = jest.fn(() => {
    queueMicrotask(() => {
      this.state = 'inactive';
      this.ondataavailable?.({
        data: new Blob(['recorded-bytes'], { type: 'video/webm' }),
      });
      this.onstop?.();
    });
  });
}

describe('CameraCaptureService', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const makeStream = (
    settings: Partial<{ deviceId: string; facingMode: string }> = {}
  ) => {
    const track = {
      stop: jest.fn(),
      addEventListener: jest.fn(),
      getSettings: jest.fn(() => ({
        width: 1280,
        height: 720,
        frameRate: 30,
        deviceId: settings.deviceId ?? 'cam-1',
        facingMode: settings.facingMode ?? 'user',
      })),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    };
    return { stream: stream as unknown as MediaStream, track, raw: stream };
  };

  /**
   * `getUserMedia` stand-in that reports the settings it was actually asked for,
   * the way a real capture device does.
   */
  const autoStream = () =>
    jest.fn(async (constraints: MediaStreamConstraints) => {
      const video = (constraints.video ?? {}) as MediaTrackConstraints;
      return makeStream({
        deviceId:
          (video.deviceId as { exact?: string } | undefined)?.exact ?? 'cam-1',
        facingMode: typeof video.facingMode === 'string' ? video.facingMode : 'user',
      }).stream;
    });

  const installMediaDevices = (
    overrides: Partial<{
      getUserMedia: jest.Mock;
      enumerateDevices: jest.Mock;
    }> = {}
  ) => {
    const mediaDevices = {
      getUserMedia:
        overrides.getUserMedia ??
        jest.fn(async () => makeStream().stream),
      enumerateDevices:
        overrides.enumerateDevices ??
        jest.fn(async () => [
          { kind: 'videoinput', deviceId: 'cam-1', label: 'Front Camera' },
          { kind: 'videoinput', deviceId: 'cam-2', label: 'Rear Camera' },
          { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
        ]),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    });
    return mediaDevices;
  };

  const createService = () => {
    TestBed.configureTestingModule({
      providers: [
        CameraCaptureService,
        { provide: LoggingService, useValue: logger },
      ],
    });
    return TestBed.inject(CameraCaptureService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    installMediaDevices();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'mediaDevices');
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'MediaRecorder');
    jest.useRealTimers();
  });

  it('starts idle and explains the idle state', () => {
    const service = createService();

    expect(service.status()).toBe('off');
    expect(service.isLive()).toBe(false);
    expect(service.statusLabel()).toBe('CAMERA OFF');
    expect(service.statusDetail()).toContain('Camera idle');
  });

  it('enumerates only video inputs and auto-selects the first camera', async () => {
    const service = createService();
    await Promise.resolve();

    expect(service.devices()).toEqual([
      { deviceId: 'cam-1', label: 'Front Camera', isDefault: true },
      { deviceId: 'cam-2', label: 'Rear Camera', isDefault: false },
    ]);
    expect(service.selectedDeviceId()).toBe('cam-1');
  });

  it('reselection follows the surviving camera when the selected one disappears', async () => {
    const mediaDevices = installMediaDevices();
    const service = createService();
    await Promise.resolve();

    mediaDevices.enumerateDevices.mockResolvedValueOnce([
      { kind: 'videoinput', deviceId: 'cam-2', label: 'Rear Camera' },
    ]);
    await service.refreshDevices();
    expect(service.selectedDeviceId()).toBe('cam-2');

    mediaDevices.enumerateDevices.mockResolvedValueOnce([]);
    await service.refreshDevices();
    expect(service.selectedDeviceId()).toBeNull();
    expect(service.devices()).toEqual([]);
  });

  it('acquires a video-only stream and reports real frame settings', async () => {
    const mediaDevices = installMediaDevices();
    const { stream } = makeStream();
    mediaDevices.getUserMedia.mockResolvedValue(stream);
    const service = createService();

    await expect(service.start('cam-2')).resolves.toBe(true);

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: expect.objectContaining({ deviceId: { exact: 'cam-2' } }),
    });
    expect(service.isLive()).toBe(true);
    expect(service.permissionState()).toBe('granted');
    expect(service.frameSettings()).toEqual({
      width: 1280,
      height: 720,
      frameRate: 30,
    });
    expect(service.statusDetail()).toContain('Front Camera');
  });

  it('releases the previous stream before opening a new device', async () => {
    const first = makeStream();
    const mediaDevices = installMediaDevices({ getUserMedia: autoStream() });
    mediaDevices.getUserMedia.mockResolvedValueOnce(first.stream);
    const service = createService();

    await service.start('cam-1');
    await service.setDevice('cam-2');

    expect(first.track.stop).toHaveBeenCalledTimes(1);
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: expect.objectContaining({ deviceId: { exact: 'cam-2' } }),
    });
    // The browser reports which device it actually opened — trust that, not the request.
    expect(service.selectedDeviceId()).toBe('cam-2');
  });

  it('reports a denied permission with an actionable message', async () => {
    const denial = Object.assign(new Error('nope'), { name: 'NotAllowedError' });
    installMediaDevices({ getUserMedia: jest.fn(async () => Promise.reject(denial)) });
    const service = createService();

    await expect(service.start()).resolves.toBe(false);

    expect(service.status()).toBe('denied');
    expect(service.statusLabel()).toBe('ACCESS DENIED');
    expect(service.lastError()).toContain('Camera permission denied');
    expect(service.permissionState()).toBe('denied');
  });

  it('reports a camera held by another app as unavailable, not denied', async () => {
    const busy = Object.assign(new Error('busy'), { name: 'NotReadableError' });
    installMediaDevices({ getUserMedia: jest.fn(async () => Promise.reject(busy)) });
    const service = createService();

    await expect(service.start()).resolves.toBe(false);

    expect(service.status()).toBe('unavailable');
    expect(service.lastError()).toContain('already in use');
    expect(service.permissionState()).not.toBe('denied');
  });

  it('flags an insecure origin separately from an unsupported browser', async () => {
    Reflect.deleteProperty(
      navigator as unknown as Record<string, unknown>,
      'mediaDevices'
    );
    const insecure = Object.getOwnPropertyDescriptor(
      window,
      'isSecureContext'
    );
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });

    const service = createService();
    await expect(service.start()).resolves.toBe(false);
    expect(service.status()).toBe('insecure');
    expect(service.statusDetail()).toContain('HTTPS');

    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    await expect(service.start()).resolves.toBe(false);
    expect(service.status()).toBe('unsupported');

    if (insecure) {
      Object.defineProperty(window, 'isSecureContext', insecure);
    }
  });

  it('stops every track and returns to the off state', async () => {
    const { stream, track } = makeStream();
    installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
    const service = createService();

    await service.start();
    expect(service.isLive()).toBe(true);

    service.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(service.isLive()).toBe(false);
    expect(service.stream()).toBeNull();
    expect(service.frameSettings()).toBeNull();
  });

  it('toggles between live and off', async () => {
    const service = createService();

    await expect(service.toggle()).resolves.toBe(true);
    expect(service.isLive()).toBe(true);

    await expect(service.toggle()).resolves.toBe(false);
    expect(service.isLive()).toBe(false);
  });

  it('drops back to off when the system releases the track', async () => {
    const { stream, track } = makeStream();
    installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
    const service = createService();

    await service.start();
    const endedHandler = track.addEventListener.mock.calls.find(
      (call) => call[0] === 'ended'
    )?.[1] as (() => void) | undefined;
    expect(endedHandler).toBeDefined();

    endedHandler?.();

    expect(service.status()).toBe('off');
    expect(service.lastError()).toContain('released by the system');
  });

  it('refuses to switch inputs while a take is rolling', async () => {
    const mediaDevices = installMediaDevices();
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      FakeMediaRecorder;
    const service = createService();
    await service.start();
    const callsBefore = mediaDevices.getUserMedia.mock.calls.length;

    expect(service.startRecording()).toBe(true);
    await expect(service.setDevice('cam-2')).resolves.toBe(false);
    await expect(service.switchFacing()).resolves.toBe(false);
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(callsBefore);
  });

  it('flips the sensor and reacquires a fresh stream', async () => {
    const mediaDevices = installMediaDevices({ getUserMedia: autoStream() });
    const service = createService();
    await service.start('cam-1');

    await expect(service.switchFacing()).resolves.toBe(true);

    expect(service.facingMode()).toBe('environment');
    expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: expect.objectContaining({ facingMode: 'environment' }),
    });
  });

  it('records a take with the supported container and reports elapsed seconds', async () => {
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      FakeMediaRecorder;
    const service = createService();
    await service.start();

    // queueMicrotask stays real so the recorder's async flush can settle.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    expect(service.startRecording()).toBe(true);
    expect(service.isRecording()).toBe(true);

    jest.advanceTimersByTime(3000);
    expect(service.recordingSeconds()).toBe(3);

    const blob = await service.stopRecording();
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('video/webm;codecs=vp8,opus');
    expect(blob?.size).toBeGreaterThan(0);
    expect(service.isRecording()).toBe(false);
    expect(service.recordingSeconds()).toBe(3);
  });

  it('reports a missing MediaRecorder instead of pretending to record', async () => {
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'MediaRecorder');
    const service = createService();
    await service.start();

    expect(service.startRecording()).toBe(false);
    expect(service.isRecording()).toBe(false);
    expect(service.lastError()).toContain('MediaRecorder');
  });

  it('discards an in-flight take when the camera stops', async () => {
    const { stream, track } = makeStream();
    installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
      FakeMediaRecorder;
    const service = createService();
    await service.start();
    service.startRecording();

    const pending = service.stopRecording();
    service.stop();

    await expect(pending).resolves.toBeNull();
    expect(service.isRecording()).toBe(false);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('warns when a live stream never produces frames, then clears on first paint', async () => {
    const service = createService();
    jest.useFakeTimers();
    await service.start();

    expect(service.previewWarning()).toBeNull();
    jest.advanceTimersByTime(2500);
    expect(service.previewWarning()).toContain('no video frames');

    service.markPreviewReady();
    expect(service.previewWarning()).toBeNull();
  });

  it('never warns about frames once the preview has painted', async () => {
    const service = createService();
    jest.useFakeTimers();
    await service.start();
    service.markPreviewReady();

    jest.advanceTimersByTime(5000);
    expect(service.previewWarning()).toBeNull();
  });

  it('captures a frame only once the feed has decoded pixels', async () => {
    const service = createService();
    const video = document.createElement('video');

    expect(service.captureFrame(video)).toBeNull();

    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
    const toDataURL = jest.fn(() => 'data:image/jpeg;base64,frame');
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation(toDataURL);

    expect(service.captureFrame(video, { maxWidth: 640 })).toBe(
      'data:image/jpeg;base64,frame'
    );
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.92);
  });

  it('scales a captured frame down to the requested max width', async () => {
    const service = createService();
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 4000 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 2000 });
    const drawImage = jest.fn();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,scaled');

    const data = service.captureFrame(video, { maxWidth: 1000 });

    expect(data).toBe('data:image/jpeg;base64,scaled');
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1000, 500);
  });

  it('releases the device and detaches listeners on destroy', async () => {
    const { stream, track } = makeStream();
    const mediaDevices = installMediaDevices({
      getUserMedia: jest.fn(async () => stream),
    });
    const service = createService();
    await service.start();

    service.ngOnDestroy();

    expect(track.stop).toHaveBeenCalled();
    expect(mediaDevices.removeEventListener).toHaveBeenCalledWith(
      'devicechange',
      expect.any(Function)
    );
  });
});
