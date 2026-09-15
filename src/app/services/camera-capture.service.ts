import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';

/**
 * Lifecycle states for the camera capture pipeline. `off` is the only state
 * where no `MediaStream` is held; every other state is surfaced verbatim to the
 * UI so a failure is never mistaken for a silent no-op.
 */
export type CameraStatus =
  | 'off'
  | 'requesting'
  | 'live'
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'insecure';

export interface CameraDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

/**
 * Where the live frames come from. Both paths produce a `MediaStream` that the
 * preview, the frame grabber and the recorder treat identically.
 */
export type CaptureSource = 'camera' | 'screen';

export interface CameraFrameSettings {
  width: number;
  height: number;
  frameRate: number;
}

/** Requested capture resolution — ideal, not exact, so weak devices still bind. */
const IDEAL_WIDTH = 1280;
const IDEAL_HEIGHT = 720;

/** Container/codec preference order. WebM is what Chromium/Android WebView can mux. */
const RECORDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

/**
 * How long a freshly bound stream may go without producing a decoded frame
 * before we call it out. A bound-but-black feed is the classic "camera is not
 * working" symptom on Android, where another app holding the device yields an
 * authorised track that never delivers pixels.
 */
const FIRST_FRAME_TIMEOUT_MS = 2500;

/**
 * Transient re-attempts performed by a single `retry()`. Busy devices
 * (`NotReadableError`) recover as soon as the other app releases the camera, and
 * a dismissed permission prompt is re-issued on the next call, so a couple of
 * short retries turn the commonest "camera not working" cases into a success
 * without the operator touching anything.
 */
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 600;

/**
 * `camera` is not part of the `PermissionName` union in every TypeScript lib
 * version, so it is narrowed at the query boundary instead of cast everywhere.
 */
const CAMERA_PERMISSION_NAME = 'camera' as PermissionName;

const STATUS_LABELS: Record<CameraStatus, string> = {
  off: 'CAMERA OFF',
  requesting: 'REQUESTING ACCESS…',
  live: 'LIVE',
  denied: 'ACCESS DENIED',
  unavailable: 'NO CAMERA',
  unsupported: 'CAMERA UNSUPPORTED',
  insecure: 'NEEDS HTTPS',
};

/**
 * Real camera capture for the CinemaEngine: `getUserMedia` acquisition, device
 * enumeration/switching, an honest status + error surface, still-frame grabs
 * and `MediaRecorder` video takes.
 *
 * Platform notes this service exists to make explicit:
 *  - `getUserMedia` only exists in a secure context (HTTPS, `localhost`, or a
 *    Capacitor `https://localhost` WebView). On an insecure origin the browser
 *    removes `navigator.mediaDevices` entirely, which used to read as "no
 *    camera" instead of "wrong origin" — hence the dedicated `insecure` state.
 *  - Android needs `android.permission.CAMERA` declared in the manifest;
 *    without it the WebView denies the request before any prompt is shown.
 */
@Injectable({
  providedIn: 'root',
})
export class CameraCaptureService implements OnDestroy {
  private logger = inject(LoggingService);

  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private firstFrameTimer: ReturnType<typeof setTimeout> | null = null;
  private stopResolver: ((blob: Blob | null) => void) | null = null;
  private discardRecording = false;
  private recordingMimeType = 'video/webm';

  stream = signal<MediaStream | null>(null);
  status = signal<CameraStatus>('off');
  lastError = signal<string | null>(null);
  previewWarning = signal<string | null>(null);
  permissionState = signal<'unknown' | 'granted' | 'denied'>('unknown');
  devices = signal<CameraDevice[]>([]);
  selectedDeviceId = signal<string | null>(null);
  facingMode = signal<'user' | 'environment'>('user');
  sourceType = signal<CaptureSource>('camera');
  frameSettings = signal<CameraFrameSettings | null>(null);
  /** Viewfinder mirror — on by default, matching every phone's selfie preview. */
  mirrored = signal(true);
  isRecording = signal(false);
  recordingSeconds = signal(0);
  /** True while `retry()` is working through its attempts. */
  isRetrying = signal(false);
  /** 1-based attempt counter for the in-flight retry, `0` when idle. */
  retryAttempt = signal(0);

  /**
   * The source a retry should re-open. A cancelled screen picker reverts
   * `sourceType` back to `camera`, so the failed attempt is remembered here
   * rather than inferred from the current `sourceType`.
   */
  private lastAttemptedSource: CaptureSource = 'camera';

  /** True while a `getUserMedia` request is in flight. */
  isStarting = computed(() => this.status() === 'requesting');
  /** True only when a live stream is held — the single source of truth for the UI. */
  isLive = computed(() => this.status() === 'live' && this.stream() !== null);
  /** Inputs may only be swapped between takes — never mid-capture. */
  canSwitchDevice = computed(() => !this.isRecording());
  /**
   * Whether a failed capture is worth re-attempting. An insecure origin and a
   * browser without `getUserMedia` cannot be fixed by asking again, so those two
   * states deliberately expose no retry affordance.
   */
  canRetry = computed(() => {
    if (this.isStarting() || this.isRetrying()) return false;
    if (this.status() === 'unsupported' || this.status() === 'insecure') {
      return false;
    }
    // Either the acquisition failed, or it succeeded and never painted a frame.
    return !!this.lastError() || !!this.previewWarning();
  });
  /** Browsers in a secure context expose `mediaDevices`; everything else cannot capture. */
  isSupported = computed(() =>
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  );
  /** Screen/window capture is a separate capability from camera capture. */
  screenShareSupported = computed(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
  deviceName = computed(() => {
    if (this.sourceType() === 'screen') return 'Screen share';
    const id = this.selectedDeviceId();
    const device = this.devices().find((d) => d.deviceId === id);
    return device?.label || 'Default camera';
  });
  statusLabel = computed(() => {
    if (this.status() === 'live' && this.sourceType() === 'screen') {
      return 'SCREEN LIVE';
    }
    return STATUS_LABELS[this.status()];
  });
  /** Operator-facing hint that explains the current state in one sentence. */
  statusDetail = computed(() => {
    const state = this.status();
    if (state === 'live') {
      const settings = this.frameSettings();
      return settings
        ? `${this.deviceName()} · ${settings.width}×${settings.height} @ ${Math.round(settings.frameRate)}fps`
        : this.deviceName();
    }
    if (state === 'requesting') return 'Waiting for the camera permission prompt.';
    if (state === 'denied')
      return 'Camera access was blocked. Allow camera access for this site, then start again.';
    if (state === 'unavailable')
      return 'No usable camera was found, or another app is holding the device.';
    if (state === 'insecure')
      return 'Camera capture requires HTTPS or localhost. This origin is not secure.';
    if (state === 'unsupported')
      return 'This browser does not expose camera capture (getUserMedia).';
    return 'Camera idle. Start the camera to open a live capture feed.';
  });

  private readonly onDeviceChange = () => {
    void this.refreshDevices();
  };

  constructor() {
    // Hot-plugged cameras (USB capture cards, DroidCam, virtual cams) must show
    // up without a reload — same contract as the mic service.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener?.('devicechange', this.onDeviceChange);
      void this.refreshDevices();
    }
  }

  /**
   * Enumerate video inputs. Labels are only populated once permission has been
   * granted, so callers pass `true` after a successful open.
   */
  async refreshDevices(expectLabels = false): Promise<CameraDevice[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      this.devices.set([]);
      return [];
    }

    try {
      const found = await navigator.mediaDevices.enumerateDevices();
      const cameraList = found.filter((d) => d.kind === 'videoinput');
      const mapped: CameraDevice[] = cameraList.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${index + 1}`,
        isDefault: d.deviceId === 'default' || index === 0,
      }));
      this.devices.set(mapped);

      // Never keep a stale selection (unplugged camera) around — reselect the
      // first available input instead of failing on the next start().
      const selected = this.selectedDeviceId();
      const stillPresent = !!selected && mapped.some((d) => d.deviceId === selected);
      if (!stillPresent) {
        this.selectedDeviceId.set(mapped.length > 0 ? mapped[0].deviceId : null);
      }
      if (expectLabels && mapped.every((d) => !d.label)) {
        this.logger.warn('Camera labels unavailable — permission has not been granted yet.');
      }
      return mapped;
    } catch (error) {
      this.logger.warn('Camera enumeration failed', error);
      this.devices.set([]);
      return [];
    }
  }

  /**
   * Acquire a camera stream. Always releases any previously held stream first —
   * Android will not hand out a second camera track while one is open.
   */
  async start(deviceId?: string): Promise<boolean> {
    this.lastAttemptedSource = 'camera';

    if (!this.isSupported()) {
      this.status.set(this.resolveUnsupportedState());
      this.lastError.set(this.statusDetail());
      return false;
    }

    const targetDevice = deviceId ?? this.selectedDeviceId() ?? undefined;
    if (deviceId) this.selectedDeviceId.set(deviceId);

    this.releaseStream();
    this.status.set('requesting');
    this.lastError.set(null);
    this.previewWarning.set(null);

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        width: { ideal: IDEAL_WIDTH },
        height: { ideal: IDEAL_HEIGHT },
        ...(targetDevice && targetDevice !== 'default'
          ? { deviceId: { exact: targetDevice } }
          : { facingMode: this.facingMode() }),
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.adoptStream(stream);
      return true;
    } catch (error) {
      this.handleAcquireError(error);
      return false;
    }
  }

  /** Release the camera. Any in-flight take is discarded rather than half-flushed. */
  stop(): void {
    if (this.isRecording()) {
      this.discardRecording = true;
      this.finishRecording();
    }
    this.releaseStream();
    this.status.set('off');
    this.sourceType.set('camera');
    this.frameSettings.set(null);
    this.previewWarning.set(null);
  }

  async toggle(): Promise<boolean> {
    if (this.isLive()) {
      this.stop();
      return false;
    }
    return this.start();
  }

  /**
   * Re-attempt the capture that failed.
   *
   * A blocked camera is usually recoverable without a reload: the operator
   * dismissed the prompt, closed the app that was holding the device, or flipped
   * the site permission back on a moment ago. Re-issuing the request is the only
   * way to find that out, so this re-runs the last attempted source a few times
   * for the transient failures and bails out early once the browser reports a
   * *sticky* denial — in that state no prompt will ever appear again, so another
   * attempt is just a button that does nothing, and the honest answer is to say
   * exactly which setting has to change.
   */
  async retry(): Promise<boolean> {
    if (this.isRetrying()) return false;

    // Nothing to repair: a live, frame-producing, error-free feed.
    if (this.isLive() && !this.lastError() && !this.previewWarning()) return true;

    const source = this.lastAttemptedSource;
    this.isRetrying.set(true);
    this.retryAttempt.set(0);

    try {
      for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
        this.retryAttempt.set(attempt);

        const started =
          source === 'screen'
            ? await this.startScreenShare()
            : await this.start();
        if (started) {
          this.retryAttempt.set(0);
          return true;
        }

        // A permission the browser already marked "denied" is sticky: the page
        // can request it forever and never see a prompt.
        if ((await this.queryPermissionState()) === 'denied') {
          this.permissionState.set('denied');
          this.lastError.set(
            source === 'screen'
              ? 'Screen sharing is blocked for this site. Re-enable screen capture in your browser site settings, then retry.'
              : 'Camera access is blocked for this site. Re-enable it from the lock/camera icon in the address bar (or the app permissions screen), then retry.'
          );
          return false;
        }

        // A busy device or a just-dismissed prompt clears within a second or two.
        if (attempt < RETRY_ATTEMPTS) {
          await this.wait(RETRY_BACKOFF_MS * attempt);
        }
      }

      return false;
    } finally {
      this.isRetrying.set(false);
      this.retryAttempt.set(0);
    }
  }

  /**
   * The browser's own view of the camera permission. `prompt` means a retry can
   * still surface a real prompt; `denied` means only a settings change will help.
   * Browsers without the Permissions API (or without a `camera` descriptor)
   * report `unknown`, and a retry stays worthwhile.
   */
  async queryPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    try {
      const permissions = navigator?.permissions;
      if (!permissions?.query) return 'unknown';
      const status = await permissions.query({ name: CAMERA_PERMISSION_NAME });
      return status.state as 'granted' | 'denied' | 'prompt';
    } catch {
      return 'unknown';
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Share a screen or window through `getDisplayMedia`.
   *
   * Unlike a camera switch, the request is made *before* releasing anything: a
   * cancelled picker must not tear down a live camera stream.
   */
  async startScreenShare(): Promise<boolean> {
    this.lastAttemptedSource = 'screen';

    if (!this.screenShareSupported()) {
      this.status.set(this.resolveUnsupportedState());
      this.lastError.set(
        'Screen capture is not supported in this browser (getDisplayMedia missing).'
      );
      return false;
    }

    this.status.set('requesting');
    this.lastError.set(null);
    this.previewWarning.set(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        // Tab/system audio when the platform offers it; harmless otherwise.
        audio: true,
      });
    } catch (error) {
      this.handleAcquireError(error, 'screen');
      return false;
    }

    this.releaseStream();
    this.adoptStream(stream, 'screen');
    return true;
  }

  /**
   * Switch capture device. Returns false when a take is in flight so the UI can
   * keep the control disabled instead of silently dropping the recording.
   */
  async setDevice(deviceId: string): Promise<boolean> {
    if (!this.canSwitchDevice()) return false;
    this.selectedDeviceId.set(deviceId);
    if (!this.isLive()) return true;
    return this.start(deviceId);
  }

  /** Flip between front and rear sensors (mobile). */
  async switchFacing(): Promise<boolean> {
    if (!this.canSwitchDevice()) return false;
    const next = this.facingMode() === 'user' ? 'environment' : 'user';
    this.facingMode.set(next);
    if (!this.isLive()) return true;
    // A facing-mode change needs a fresh stream; drop the pinned device id so
    // the new constraint is actually honoured.
    this.selectedDeviceId.set(null);
    return this.start();
  }

  /** Begin a video take. Returns false when capture cannot start. */
  startRecording(): boolean {
    if (!this.mediaStream || !this.isLive() || this.isRecording()) return false;
    if (typeof MediaRecorder === 'undefined') {
      this.lastError.set('Video recording is not supported in this browser (MediaRecorder missing).');
      return false;
    }

    this.recordingMimeType = this.resolveRecorderMimeType();
    const options: MediaRecorderOptions = { videoBitsPerSecond: 6_000_000 };
    if (this.recordingMimeType) options.mimeType = this.recordingMimeType;

    try {
      const recorder =
        this.recordingMimeType && typeof MediaRecorder.isTypeSupported === 'function'
          ? new MediaRecorder(this.mediaStream, options)
          : new MediaRecorder(this.mediaStream);
      this.chunks = [];
      this.discardRecording = false;
      this.mediaRecorder = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onerror = (event: Event) => {
        this.logger.error('Camera MediaRecorder failed', event);
        this.lastError.set('Camera recording failed. The take was discarded.');
        this.discardRecording = true;
        this.finishRecording();
      };
      recorder.onstop = () => this.finishRecording();
      recorder.start(250);
      this.isRecording.set(true);
      this.recordingSeconds.set(0);
      this.recordingTimer = setInterval(() => {
        this.recordingSeconds.update((s) => s + 1);
      }, 1000);
      return true;
    } catch (error) {
      this.logger.error('Failed to start camera MediaRecorder', error);
      this.lastError.set('Camera recording could not start on this device.');
      this.mediaRecorder = null;
      return false;
    }
  }

  /** Stop the take and resolve the recorded blob (null when nothing usable landed). */
  stopRecording(): Promise<Blob | null> {
    const recorder = this.mediaRecorder;
    if (!recorder || !this.isRecording()) return Promise.resolve(null);
    if (recorder.state === 'inactive') return Promise.resolve(null);

    const result = new Promise<Blob | null>((resolve) => {
      this.stopResolver = resolve;
    });
    recorder.stop();
    return result;
  }

  /**
   * Grab the current frame as a JPEG data URL. Returns null when the feed has
   * not decoded a frame yet, so the caller can report honestly instead of
   * adding a blank clip to the timeline.
   */
  captureFrame(
    video: HTMLVideoElement | null | undefined,
    options: { maxWidth?: number; quality?: number } = {}
  ): string | null {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const maxWidth = options.maxWidth ?? IDEAL_WIDTH;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', options.quality ?? 0.92);
    } catch (error) {
      this.logger.warn('Camera frame capture failed', error);
      return null;
    }
  }

  /**
   * Called by the preview once a frame has actually been painted, which cancels
   * the "authorised but black" watchdog.
   */
  markPreviewReady(): void {
    if (this.firstFrameTimer) {
      clearTimeout(this.firstFrameTimer);
      this.firstFrameTimer = null;
    }
    if (this.previewWarning()) this.previewWarning.set(null);
  }

  private adoptStream(
    stream: MediaStream,
    source: CaptureSource = 'camera'
  ): void {
    this.mediaStream = stream;
    this.stream.set(stream);
    this.sourceType.set(source);
    this.status.set('live');
    this.permissionState.set('granted');
    this.lastError.set(null);

    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    this.frameSettings.set({
      width: Number(settings.width) || IDEAL_WIDTH,
      height: Number(settings.height) || IDEAL_HEIGHT,
      frameRate: Number(settings.frameRate) || 30,
    });
    if (settings.deviceId) this.selectedDeviceId.set(settings.deviceId);
    if (settings.facingMode === 'environment' || settings.facingMode === 'user') {
      this.facingMode.set(settings.facingMode);
    }

    // The OS can revoke or steal the device at any time (call, another app,
    // screen lock). Mirror that into the status instead of showing a frozen
    // frame that looks like a hung app.
    track?.addEventListener?.('ended', () => {
      const wasScreenShare = source === 'screen';
      this.logger.warn(
        wasScreenShare
          ? 'Screen share track ended.'
          : 'Camera track ended by the system.'
      );
      this.status.set('off');
      this.sourceType.set('camera');
      this.stream.set(null);
      this.frameSettings.set(null);
      this.lastError.set(
        wasScreenShare
          ? 'Screen share ended. Press Share Screen to start a new capture.'
          : 'Camera stopped. The device was released by the system.'
      );
    });

    this.armFirstFrameWatchdog();
    if (source === 'camera') void this.refreshDevices(true);
  }

  private armFirstFrameWatchdog(): void {
    if (this.firstFrameTimer) clearTimeout(this.firstFrameTimer);
    this.firstFrameTimer = setTimeout(() => {
      this.firstFrameTimer = null;
      if (!this.isLive()) return;
      this.previewWarning.set(
        'Stream authorised but no video frames yet — another app may be using the camera.'
      );
    }, FIRST_FRAME_TIMEOUT_MS);
  }

  private releaseStream(): void {
    if (this.firstFrameTimer) {
      clearTimeout(this.firstFrameTimer);
      this.firstFrameTimer = null;
    }
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.stream.set(null);
  }

  private finishRecording(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    this.isRecording.set(false);
    this.mediaRecorder = null;

    const resolver = this.stopResolver;
    this.stopResolver = null;
    if (!resolver) return;

    if (this.discardRecording || this.chunks.length === 0) {
      this.chunks = [];
      this.discardRecording = false;
      resolver(null);
      return;
    }
    const blob = new Blob(this.chunks, {
      type: this.recordingMimeType || 'video/webm',
    });
    this.chunks = [];
    resolver(blob.size > 0 ? blob : null);
  }

  private resolveRecorderMimeType(): string {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return 'video/webm';
    }
    return (
      RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ??
      'video/webm'
    );
  }

  private resolveUnsupportedState(): CameraStatus {
    // An insecure origin removes `navigator.mediaDevices` outright, which is a
    // very different problem from a browser that cannot capture at all.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      return 'insecure';
    }
    return 'unsupported';
  }

  private handleAcquireError(
    error: unknown,
    source: CaptureSource = 'camera'
  ): void {
    const name = (error as { name?: string })?.name ?? 'UnknownError';
    this.permissionState.set(
      name === 'NotAllowedError' ? 'denied' : this.permissionState()
    );

    if (source === 'screen') {
      // Cancelling the picker throws the same DOMException as a denial. A live
      // camera is deliberately left running, so the status reverts to live
      // rather than claiming an idle camera that still holds the device.
      this.status.set(this.mediaStream ? 'live' : 'off');
      if (name === 'NotAllowedError' || name === 'AbortError') {
        this.lastError.set(
          'Screen capture was cancelled or blocked. Choose a screen or window to start sharing.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this.lastError.set('No screen or window was available to share.');
      } else {
        this.lastError.set(`Screen capture could not start (${name}).`);
      }
      this.logger.error('Screen capture failed', error);
      return;
    }

    if (name === 'NotAllowedError' || name === 'SecurityError') {
      this.status.set('denied');
      this.lastError.set(
        'Camera permission denied. Allow camera access for this app, then start the camera again.'
      );
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      this.status.set('unavailable');
      this.lastError.set('No camera matched the request on this device.');
    } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      this.status.set('unavailable');
      this.lastError.set(
        'The camera is already in use by another app. Close it and start the camera again.'
      );
    } else {
      this.status.set('unavailable');
      this.lastError.set(`Camera could not start (${name}).`);
    }

    this.logger.error('Camera acquisition failed', error);
    this.releaseStream();
  }

  ngOnDestroy(): void {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener?.('devicechange', this.onDeviceChange);
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.discardRecording = true;
      this.mediaRecorder.stop();
    }
    if (this.recordingTimer) clearInterval(this.recordingTimer);
    this.releaseStream();
  }
}
