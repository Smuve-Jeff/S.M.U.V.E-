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
      getDisplayMedia: jest.Mock;
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
      getDisplayMedia:
        overrides.getDisplayMedia ??
        jest.fn(async () => makeStream({ deviceId: 'display-1' }).stream),
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

  it('blames a missing capture implementation instead of a missing camera', async () => {
    // `NotSupportedError` is what a host with no capture implementation returns
    // (in-app WebViews, stripped-down or headless builds). Reporting it as
    // "NO CAMERA" sent operators looking for hardware that was never the issue.
    const noImpl = Object.assign(new Error('nope'), {
      name: 'NotSupportedError',
    });
    installMediaDevices({
      getUserMedia: jest.fn(async () => Promise.reject(noImpl)),
    });
    const service = createService();

    await expect(service.start()).resolves.toBe(false);

    expect(service.status()).toBe('nocapture');
    expect(service.status()).not.toBe('unavailable');
    expect(service.statusLabel()).toBe('CAPTURE UNSUPPORTED');
    expect(service.lastError()).toContain('no video capture implementation');
    expect(service.lastError()).not.toContain('NotSupportedError');
    // Asking again cannot conjure an implementation that is not there.
    expect(service.canRetry()).toBe(false);
  });

  it('waits for the camera prompt, in camera language, for a camera request', async () => {
    installMediaDevices({ getUserMedia: jest.fn(() => new Promise(() => {})) });
    const service = createService();

    void service.start();

    expect(service.status()).toBe('requesting');
    expect(service.statusDetail()).toContain('camera permission prompt');
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

  describe('camera angles', () => {
    it('names the sensors the inputs report and marks the active one', async () => {
      const service = createService();
      await Promise.resolve();

      expect(service.angles()).toEqual([
        {
          id: 'cam-1',
          label: 'Front',
          facing: 'user',
          deviceId: 'cam-1',
          isActive: true,
        },
        {
          id: 'cam-2',
          label: 'Rear',
          facing: 'environment',
          deviceId: 'cam-2',
          isActive: false,
        },
      ]);
      expect(service.activeAngleLabel()).toBe('Front');
    });

    it('keeps both sensors selectable while the inputs are still unnamed', async () => {
      installMediaDevices({
        enumerateDevices: jest.fn(async () => [
          { kind: 'videoinput', deviceId: 'cam-1', label: '' },
        ]),
      });
      const service = createService();
      await Promise.resolve();

      expect(service.angles()).toEqual([
        {
          id: 'user',
          label: 'Front',
          facing: 'user',
          deviceId: null,
          isActive: true,
        },
        {
          id: 'environment',
          label: 'Rear',
          facing: 'environment',
          deviceId: null,
          isActive: false,
        },
      ]);
    });

    it('lists every input when a panel has more cameras than sensors', async () => {
      installMediaDevices({
        enumerateDevices: jest.fn(async () => [
          { kind: 'videoinput', deviceId: 'cam-1', label: 'Integrated Webcam' },
          { kind: 'videoinput', deviceId: 'cam-2', label: 'USB Capture' },
          { kind: 'videoinput', deviceId: 'cam-3', label: 'HDMI In' },
        ]),
      });
      const service = createService();
      await Promise.resolve();

      expect(service.angles().map((angle) => angle.label)).toEqual([
        'Integrated Webcam',
        'USB Capture',
        'HDMI In',
      ]);
      expect(service.angles()[0].isActive).toBe(true);
    });

    it('opens a device-backed angle directly', async () => {
      const mediaDevices = installMediaDevices({ getUserMedia: autoStream() });
      const service = createService();
      await service.start('cam-1');
      const rear = service.angles().find((angle) => angle.id === 'cam-2')!;

      await expect(service.selectAngle(rear)).resolves.toBe(true);

      expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
        audio: false,
        video: expect.objectContaining({
          deviceId: { exact: 'cam-2' },
        }),
      });
    });

    it('flips the sensor for a logical angle and pins nothing', async () => {
      const mediaDevices = installMediaDevices({
        enumerateDevices: jest.fn(async () => [
          { kind: 'videoinput', deviceId: 'cam-1', label: '' },
        ]),
        getUserMedia: autoStream(),
      });
      const service = createService();
      await service.start();
      const rear = service.angles().find((angle) => angle.id === 'environment')!;

      await expect(service.selectAngle(rear)).resolves.toBe(true);

      expect(service.facingMode()).toBe('environment');
      expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith({
        audio: false,
        video: expect.objectContaining({ facingMode: 'environment' }),
      });
    });

    it('hands the previous angle back when the requested one cannot open', async () => {
      const mediaDevices = installMediaDevices({
        enumerateDevices: jest.fn(async () => [
          { kind: 'videoinput', deviceId: 'cam-1', label: '' },
        ]),
      });
      mediaDevices.getUserMedia
        .mockResolvedValueOnce(makeStream({ facingMode: 'user' }).stream)
        .mockRejectedValueOnce(
          Object.assign(new Error('no rear sensor'), {
            name: 'OverconstrainedError',
          })
        )
        .mockResolvedValueOnce(makeStream({ facingMode: 'user' }).stream);
      const service = createService();
      await service.start();
      const rear = service.angles().find((angle) => angle.id === 'environment')!;

      await expect(service.selectAngle(rear)).resolves.toBe(false);

      // A refused flip must not cost the operator the feed they had.
      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(3);
      expect(service.isLive()).toBe(true);
      expect(service.facingMode()).toBe('user');
      expect(service.lastError()).toBeNull();
    });

    it('refuses an angle change while a take is rolling', async () => {
      installMediaDevices({ getUserMedia: autoStream() });
      (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
        FakeMediaRecorder;
      const service = createService();
      await service.start();
      expect(service.startRecording()).toBe(true);

      const rear = service.angles().find((angle) => angle.id === 'environment')!;

      await expect(service.selectAngle(rear)).resolves.toBe(false);
      expect(service.facingMode()).toBe('user');
    });

    it('records the chosen angle before the camera is opened', async () => {
      const service = createService();
      await Promise.resolve();
      const rear = service.angles().find((angle) => angle.id === 'cam-2')!;

      await expect(service.selectAngle(rear)).resolves.toBe(true);

      expect(service.selectedDeviceId()).toBe('cam-2');
      expect(service.isLive()).toBe(false);
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
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.98);
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

  describe('screen capture', () => {
    it('adopts a display stream and flags it as a screen share', async () => {
      const mediaDevices = installMediaDevices();
      const service = createService();

      await expect(service.startScreenShare()).resolves.toBe(true);

      expect(mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
      expect(service.sourceType()).toBe('screen');
      expect(service.status()).toBe('live');
      expect(service.statusLabel()).toBe('SCREEN LIVE');
      expect(service.deviceName()).toBe('Screen share');
    });

    it('keeps a live camera when the screen picker is cancelled', async () => {
      const camera = makeStream();
      const cancelled = Object.assign(new Error('cancelled'), {
        name: 'NotAllowedError',
      });
      const mediaDevices = installMediaDevices({
        getUserMedia: jest.fn(async () => camera.stream),
        getDisplayMedia: jest.fn(async () => Promise.reject(cancelled)),
      });
      const service = createService();
      await service.start();

      await expect(service.startScreenShare()).resolves.toBe(false);

      // Acquiring before releasing is what protects the running camera here.
      expect(camera.track.stop).not.toHaveBeenCalled();
      expect(service.isLive()).toBe(true);
      expect(service.sourceType()).toBe('camera');
      expect(service.statusLabel()).not.toBe('SCREEN LIVE');
      expect(service.lastError()).toContain('cancelled or blocked');
      expect(mediaDevices.getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('reports a browser without getDisplayMedia separately from the camera', async () => {
      const mediaDevices = installMediaDevices();
      Reflect.deleteProperty(
        mediaDevices as unknown as Record<string, unknown>,
        'getDisplayMedia'
      );
      const service = createService();

      expect(service.screenShareSupported()).toBe(false);
      expect(service.isSupported()).toBe(true);

      await expect(service.startScreenShare()).resolves.toBe(false);
      expect(service.status()).toBe('unsupported');
      expect(service.lastError()).toContain('getDisplayMedia');
    });

    it('never asks the operator for a camera prompt while sharing a screen', async () => {
      // The picker is open and has not answered yet. Telling the operator to
      // expect a camera prompt described a prompt that was never coming, which
      // is indistinguishable from a camera that refuses to start.
      installMediaDevices({
        getDisplayMedia: jest.fn(() => new Promise(() => {})),
      });
      const service = createService();

      void service.startScreenShare();

      expect(service.status()).toBe('requesting');
      expect(service.statusDetail()).toContain('screen or window');
      expect(service.statusDetail()).not.toContain('camera');
    });

    it('reports a host with no screen capture as unsupported, not as no screen', async () => {
      const noImpl = Object.assign(new Error('nope'), {
        name: 'NotSupportedError',
      });
      installMediaDevices({
        getDisplayMedia: jest.fn(async () => Promise.reject(noImpl)),
      });
      const service = createService();

      await expect(service.startScreenShare()).resolves.toBe(false);

      // No picker can ever appear, so pointing at "no screen available" would
      // be advice the operator cannot act on.
      expect(service.status()).toBe('nocapture');
      expect(service.statusLabel()).toBe('CAPTURE UNSUPPORTED');
      expect(service.lastError()).toContain('cannot share a screen');
      expect(service.canRetry()).toBe(false);
    });

    it('returns to the camera source when the user stops sharing', async () => {
      const display = makeStream({ deviceId: 'display-1' });
      installMediaDevices({ getDisplayMedia: jest.fn(async () => display.stream) });
      const service = createService();
      await service.startScreenShare();

      const endedHandler = display.track.addEventListener.mock.calls.find(
        (call) => call[0] === 'ended'
      )?.[1] as (() => void) | undefined;
      endedHandler?.();

      expect(service.status()).toBe('off');
      expect(service.sourceType()).toBe('camera');
      expect(service.lastError()).toContain('Screen share ended');
    });

    it('does not re-enumerate cameras for a screen share', async () => {
      const mediaDevices = installMediaDevices();
      const service = createService();
      await Promise.resolve();
      const before = mediaDevices.enumerateDevices.mock.calls.length;

      await service.startScreenShare();

      expect(mediaDevices.enumerateDevices.mock.calls.length).toBe(before);
    });

    it('records a screen share like any other stream', async () => {
      (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
        FakeMediaRecorder;
      const service = createService();
      await service.startScreenShare();

      expect(service.startRecording()).toBe(true);
      const blob = await service.stopRecording();

      expect(blob?.size).toBeGreaterThan(0);
      expect(service.isRecording()).toBe(false);
    });
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

  describe('retry after a blocked capture', () => {
    /**
     * The browser's own permission view. `prompt` can still raise a dialog,
     * `denied` cannot — that difference is what stops a retry from becoming a
     * button that silently does nothing.
     */
    const installPermissions = (
      state: 'granted' | 'denied' | 'prompt' | 'unsupported'
    ) => {
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value:
          state === 'unsupported'
            ? undefined
            : { query: jest.fn(async () => ({ state })) },
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(
        navigator as unknown as Record<string, unknown>,
        'permissions'
      );
    });

    it('re-attempts a dismissed prompt until the device opens', async () => {
      jest.useFakeTimers();
      const denial = Object.assign(new Error('nope'), {
        name: 'NotAllowedError',
      });
      const mediaDevices = installMediaDevices({
        getUserMedia: jest
          .fn()
          .mockRejectedValueOnce(denial)
          .mockImplementation(autoStream()),
      });
      installPermissions('prompt');
      const service = createService();

      const pending = service.retry();
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toBe(true);
      expect(service.isLive()).toBe(true);
      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    });

    it('retries a device held by another app until it is released', async () => {
      jest.useFakeTimers();
      const busy = Object.assign(new Error('busy'), {
        name: 'NotReadableError',
      });
      const mediaDevices = installMediaDevices({
        getUserMedia: jest
          .fn()
          .mockRejectedValueOnce(busy)
          .mockImplementation(autoStream()),
      });
      installPermissions('granted');
      const service = createService();

      const pending = service.retry();
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toBe(true);
      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
      expect(service.status()).toBe('live');
    });

    it('stops on a sticky denial and names the setting to change', async () => {
      const denial = Object.assign(new Error('nope'), {
        name: 'NotAllowedError',
      });
      const mediaDevices = installMediaDevices({
        getUserMedia: jest.fn(async () => Promise.reject(denial)),
      });
      installPermissions('denied');
      const service = createService();

      await expect(service.retry()).resolves.toBe(false);

      // Another request can never raise a prompt, so it is not attempted.
      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
      expect(service.lastError()).toContain('address bar');
      expect(service.permissionState()).toBe('denied');
      expect(service.isRetrying()).toBe(false);
    });

    it('gives up after the configured attempts when the device never opens', async () => {
      jest.useFakeTimers();
      const busy = Object.assign(new Error('busy'), {
        name: 'NotReadableError',
      });
      const mediaDevices = installMediaDevices({
        getUserMedia: jest.fn(async () => Promise.reject(busy)),
      });
      // No Permissions API — a retry stays worthwhile, so it runs the full set.
      installPermissions('unsupported');
      const service = createService();

      const pending = service.retry();
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toBe(false);
      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(3);
      expect(service.status()).toBe('unavailable');
      expect(service.retryAttempt()).toBe(0);
    });

    it('re-opens the screen picker when that was the blocked source', async () => {
      jest.useFakeTimers();
      const cancelled = Object.assign(new Error('cancel'), {
        name: 'AbortError',
      });
      const mediaDevices = installMediaDevices({
        getUserMedia: jest.fn(async () => makeStream().stream),
        getDisplayMedia: jest
          .fn()
          .mockRejectedValueOnce(cancelled)
          .mockImplementation(async () => makeStream({ deviceId: 'display-1' }).stream),
      });
      installPermissions('prompt');
      const service = createService();
      await service.start();
      await expect(service.startScreenShare()).resolves.toBe(false);

      const pending = service.retry();
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toBe(true);
      expect(mediaDevices.getDisplayMedia).toHaveBeenCalledTimes(2);
      expect(service.sourceType()).toBe('screen');
    });

    it('does not disturb a feed that is already live and healthy', async () => {
      const mediaDevices = installMediaDevices({ getUserMedia: autoStream() });
      installPermissions('granted');
      const service = createService();
      await service.start();
      const callsBefore = mediaDevices.getUserMedia.mock.calls.length;

      await expect(service.retry()).resolves.toBe(true);

      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(callsBefore);
    });

    it('offers a retry only where asking again can help', async () => {
      installMediaDevices({
        getUserMedia: jest.fn(async () =>
          Promise.reject(
            Object.assign(new Error('nope'), { name: 'NotAllowedError' })
          )
        ),
      });
      const service = createService();

      // Idle: there is nothing to repair yet.
      expect(service.canRetry()).toBe(false);

      await service.start();
      expect(service.status()).toBe('denied');
      expect(service.canRetry()).toBe(true);

      // None of these can be fixed by asking the browser again.
      service.status.set('insecure');
      expect(service.canRetry()).toBe(false);
      service.status.set('unsupported');
      expect(service.canRetry()).toBe(false);
      service.status.set('nocapture');
      expect(service.canRetry()).toBe(false);
    });
  });

  describe('capture refused by the embedding frame', () => {
    const installPolicy = (allowsFeature: jest.Mock) => {
      Object.defineProperty(document, 'permissionsPolicy', {
        configurable: true,
        value: { allowsFeature },
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(
        document as unknown as Record<string, unknown>,
        'permissionsPolicy'
      );
    });

    it('refuses a camera the frame never granted, without prompting', async () => {
      const mediaDevices = installMediaDevices();
      installPolicy(jest.fn((feature: string) => feature !== 'camera'));
      const service = createService();

      await expect(service.start()).resolves.toBe(false);

      // The browser refuses the feature before any prompt could appear, so
      // reaching the device would be a wasted (and confusing) request.
      expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
      expect(service.status()).toBe('embedded');
      expect(service.statusLabel()).toBe('EMBED BLOCKS CAPTURE');
      expect(service.lastError()).toContain('own browser tab');
      expect(service.permissionState()).not.toBe('denied');

      // A retry cannot change the frame's policy either.
      expect(service.canRetry()).toBe(false);
      await expect(service.retry()).resolves.toBe(false);
      expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('refuses screen sharing while still allowing the camera', async () => {
      const mediaDevices = installMediaDevices({
        getUserMedia: jest.fn(async () => makeStream().stream),
      });
      installPolicy(jest.fn((feature: string) => feature !== 'display-capture'));
      const service = createService();

      // The two features are independent: a frame may allow the viewfinder and
      // still refuse screen sharing.
      await expect(service.start()).resolves.toBe(true);
      await expect(service.startScreenShare()).resolves.toBe(false);

      expect(mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
      expect(service.isLive()).toBe(true);
      expect(service.lastError()).toContain('own browser tab');
    });

    it('blames the frame, not a site setting, when the denial is a policy refusal', async () => {
      installMediaDevices({
        getUserMedia: jest.fn(async () =>
          Promise.reject(
            Object.assign(new Error('nope'), { name: 'NotAllowedError' })
          )
        ),
      });
      // Allowed at the pre-flight check, refused by the time the browser
      // answers — the policy is evaluated per request, not per page load.
      installPolicy(
        jest
          .fn()
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(false)
      );
      const service = createService();

      await expect(service.start()).resolves.toBe(false);

      // A user denial and a policy refusal raise the same DOMException, but only
      // one of them can be fixed from the site's permission settings.
      expect(service.status()).toBe('embedded');
      expect(service.lastError()).toContain('own browser tab');
      expect(service.lastError()).not.toContain('address bar');
    });

    it('names the screen, not the camera, when a frame refuses display capture', async () => {
      installPolicy(jest.fn((feature: string) => feature !== 'display-capture'));
      const service = createService();

      await expect(service.startScreenShare()).resolves.toBe(false);

      // `camera` and `display-capture` are separate features, so the screen copy
      // must stand on its own instead of falling back to the camera wording.
      expect(service.status()).toBe('embedded');
      expect(service.statusDetail()).toContain('share a screen');
      expect(service.statusDetail()).not.toContain('camera');
      expect(service.lastError()).toContain('share the screen');
    });

    it('keeps prompting normally when the browser cannot report a policy', async () => {
      const mediaDevices = installMediaDevices({
        getUserMedia: jest.fn(async () =>
          Promise.reject(
            Object.assign(new Error('nope'), { name: 'NotAllowedError' })
          )
        ),
      });
      const service = createService();

      await expect(service.start()).resolves.toBe(false);

      // No policy API on this host means no false "embedded" verdict.
      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
      expect(service.status()).toBe('denied');
      expect(service.lastError()).toContain('Camera permission denied');
    });
  });

  describe('high-quality capture', () => {
    /** A track that reports an arbitrary granted geometry. */
    const streamWith = (
      settings: Record<string, number>,
      capabilities?: Record<string, { max: number }>
    ) => {
      const track = {
        stop: jest.fn(),
        addEventListener: jest.fn(),
        getSettings: jest.fn(() => settings),
        getCapabilities: capabilities
          ? jest.fn(() => capabilities)
          : undefined,
      };
      const stream = {
        getTracks: () => [track],
        getVideoTracks: () => [track],
      };
      return { stream: stream as unknown as MediaStream, track };
    };

    afterEach(() => {
      Reflect.deleteProperty(
        globalThis as unknown as Record<string, unknown>,
        'ImageCapture'
      );
      Reflect.deleteProperty(
        HTMLCanvasElement.prototype as unknown as Record<string, unknown>,
        'toBlob'
      );
    });

    it('asks for the pinned resolution once a quality is chosen', async () => {
      const mediaDevices = installMediaDevices();
      const service = createService();

      await service.setQuality('2160p');
      await service.start();

      const constraints = mediaDevices.getUserMedia.mock
        .calls[0][0] as MediaStreamConstraints;
      // A 25% shortfall is accepted so a device that cannot hit 4K still binds.
      expect(constraints.video).toEqual(
        expect.objectContaining({
          width: { ideal: 3840, min: 2880 },
          height: { ideal: 2160, min: 1620 },
        })
      );
    });

    it('retargets a live track in place instead of reopening the device', async () => {
      const { stream, track } = makeStream();
      const applyConstraints = jest.fn(async () => undefined);
      (track as unknown as { applyConstraints: jest.Mock }).applyConstraints =
        applyConstraints;
      const mediaDevices = installMediaDevices({
        getUserMedia: jest.fn(async () => stream),
      });
      const service = createService();
      await service.start();
      const callsBefore = mediaDevices.getUserMedia.mock.calls.length;

      await expect(service.setQuality('1080p')).resolves.toBe(true);

      expect(applyConstraints).toHaveBeenCalledWith({
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      });
      // Reopening would flash the viewfinder black and hand the device back.
      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(callsBefore);
      expect(service.quality()).toBe('1080p');
    });

    it('reopens the device when the host cannot retarget in place', async () => {
      const mediaDevices = installMediaDevices({ getUserMedia: autoStream() });
      const service = createService();
      await service.start();
      const callsBefore = mediaDevices.getUserMedia.mock.calls.length;

      await expect(service.setQuality('720p')).resolves.toBe(true);

      expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(callsBefore + 1);
      expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            width: { ideal: 1280, min: 960 },
          }),
        })
      );
    });

    it('sizes the recorder bitrate to the granted geometry', async () => {
      const { stream } = makeStream();
      installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
      const service = createService();

      expect(service.qualityLabel()).toBe('CAPTURE STANDBY');
      await service.start();

      // 720p30 computes ~3.3 Mbps, which is clamped up to the 6 Mbps floor.
      expect(service.qualityLabel()).toBe('1280×720 @ 30fps · 6 Mbps');
    });

    it('lets the bitrate grow with a larger frame', async () => {
      const { stream } = streamWith({
        width: 3840,
        height: 2160,
        frameRate: 30,
      });
      installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
      const service = createService();

      await service.start();

      expect(service.qualityLabel()).toBe('3840×2160 @ 30fps · 30 Mbps');
    });

    it('reports the highest resolution the device advertises', async () => {
      const { stream } = streamWith(
        { width: 1920, height: 1080, frameRate: 30 },
        { width: { max: 3840 }, height: { max: 2160 }, frameRate: { max: 60 } }
      );
      installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
      const service = createService();

      expect(service.maxResolutionLabel()).toBe('Detecting…');

      await service.start();

      expect(service.maxResolutionLabel()).toBe('Up to 3840×2160 @ 60fps');
    });

    it('takes the still off the sensor with ImageCapture when it is there', async () => {
      const { stream } = makeStream();
      installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
      const takePhoto = jest.fn(
        async () => new Blob(['sensor'], { type: 'image/jpeg' })
      );
      (
        globalThis as unknown as { ImageCapture: unknown }
      ).ImageCapture = jest.fn(() => ({ takePhoto }));
      const service = createService();
      await service.start();

      const photo = await service.capturePhoto();

      expect(takePhoto).toHaveBeenCalledTimes(1);
      expect(photo).toEqual({
        blob: expect.any(Blob),
        width: 1280,
        height: 720,
        mimeType: 'image/jpeg',
        source: 'image-capture',
      });
    });

    it('falls back to a canvas grab when no sensor still is available', async () => {
      const { stream } = makeStream();
      installMediaDevices({ getUserMedia: jest.fn(async () => stream) });
      const service = createService();
      await service.start();

      const video = document.createElement('video');
      Object.defineProperty(video, 'videoWidth', {
        configurable: true,
        value: 1280,
      });
      Object.defineProperty(video, 'videoHeight', {
        configurable: true,
        value: 720,
      });
      const drawImage = jest.fn();
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        value: (callback: BlobCallback) =>
          callback(new Blob(['canvas'], { type: 'image/jpeg' })),
      });

      const photo = await service.capturePhoto(video, { maxWidth: 640 });

      expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
      expect(photo).toEqual({
        blob: expect.any(Blob),
        width: 640,
        height: 360,
        mimeType: 'image/jpeg',
        source: 'canvas',
      });
    });

    it('returns nothing for a still when the feed has not decoded a frame', async () => {
      const service = createService();
      await service.start();

      const video = document.createElement('video');

      await expect(service.capturePhoto(video)).resolves.toBeNull();
    });
  });
});
