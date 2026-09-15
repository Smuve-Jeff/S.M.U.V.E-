import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';

import { ImageVideoLabComponent } from './image-video-lab.component';
import { LoggingService } from '../../services/logging.service';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import {
  VideoClip,
  VideoEngineService,
} from '../../services/video-engine.service';
import { ExportService } from '../../services/export.service';
import { CameraCaptureService } from '../../services/camera-capture.service';

describe('ImageVideoLabComponent', () => {
  /** Shared 2D context stub so render assertions can inspect the draw calls. */
  let ctxStub: Record<string, jest.Mock | string | number>;
  /** Prototype media spies — jsdom implements neither play() nor pause(). */
  let pauseSpy: jest.SpyInstance;

  /** Clip factory for the render and scrub assertions. */
  const createVideoClip = (overrides: Partial<VideoClip> = {}): VideoClip => ({
    id: 'clip-v',
    name: 'take.webm',
    url: 'blob:take',
    startTime: 0,
    duration: 10,
    offset: 0,
    trackId: 't1',
    type: 'video',
    source: 'camera',
    effects: {
      upscale: false,
      bgRemoval: false,
      noiseReduction: false,
      brightness: 1,
      contrast: 1,
      filter: 'none',
      transition: 'cut',
      transitionDuration: 0,
      trimStart: 0,
      trimEnd: 0,
    },
    ...overrides,
  });

  /**
   * Collect every <video> the component creates so tests can drive a real
   * element through the decoder-dependent render paths.
   */
  const installVideoElement = (): HTMLVideoElement[] => {
    const videos: HTMLVideoElement[] = [];
    const realCreate = document.createElement.bind(document);
    jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string, options?: any) => {
        const element = realCreate(tag, options);
        if (tag === 'video') videos.push(element as HTMLVideoElement);
        return element;
      });
    return videos;
  };

  /**
   * Give an element the decoder surface the scrub logic reads, and record every
   * `currentTime` write so seeks can be asserted and counted.
   */
  const decodeVideo = (
    video: HTMLVideoElement,
    options: { currentTime?: number; duration?: number } = {}
  ) => {
    let time = options.currentTime ?? 0;
    const writes: number[] = [];
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: options.duration ?? 30,
    });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      writable: true,
      value: true,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => time,
      set: (next: number) => {
        writes.push(next);
        time = next;
      },
    });
    Object.defineProperty(video, 'videoWidth', {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(video, 'videoHeight', {
      configurable: true,
      value: 720,
    });
    return {
      writes,
      setPaused: (paused: boolean) => {
        (video as unknown as { paused: boolean }).paused = paused;
      },
    };
  };

  const createComponent = async () => {
    const videoEngine = {
      isPlaying: signal(false),
      currentTime: signal(0),
      duration: signal(7200),
      productionMode: signal<'movie' | 'stream' | 'vlog'>('movie'),
      deliveryPreset: signal({
        id: 'movie-cinema-4k',
        mode: 'movie',
        name: 'CinemaScope 4K',
        aspectRatio: '2.39:1',
        width: 4096,
        height: 1716,
        duration: 7200,
        target: 'Full-Length Film',
        description:
          'Built for long-form scenes, theatrical pacing, and soundtrack-driven storytelling.',
      }),
      tracks: signal([
        {
          id: 't1',
          name: 'Visuals',
          clips: [],
          muted: false,
          locked: false,
          type: 'visual',
        },
        {
          id: 't2',
          name: 'Overlays',
          clips: [],
          muted: false,
          locked: false,
          type: 'overlay',
        },
        {
          id: 't3',
          name: 'AI Voiceovers',
          clips: [],
          muted: false,
          locked: false,
          type: 'voiceover',
        },
        {
          id: 't4',
          name: 'Global Score',
          clips: [],
          muted: false,
          locked: false,
          type: 'score',
        },
      ]),
      safeZoneEnabled: signal(true),
      lowerThird: signal({ enabled: false, title: '', subtitle: '' }),
      countdownRemaining: signal<number | null>(null),
      countdownLabel: jest.fn().mockReturnValue(null),
      cueFired: signal(0),
      getActiveClips: jest.fn().mockReturnValue([]),
      togglePlay: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seek: jest.fn(),
      addClip: jest.fn(),
      updateClip: jest.fn(),
      getAllDeliveryPresets: jest.fn().mockReturnValue([
        {
          id: 'movie-cinema-4k',
          mode: 'movie',
          name: 'CinemaScope 4K',
          aspectRatio: '2.39:1',
          width: 4096,
          height: 1716,
          duration: 7200,
          target: 'Full-Length Film',
          description:
            'Built for long-form scenes, theatrical pacing, and soundtrack-driven storytelling.',
        },
        {
          id: 'stream-live-landscape',
          mode: 'stream',
          name: 'Live Stream Landscape',
          aspectRatio: '16:9',
          width: 1920,
          height: 1080,
          duration: 14400,
          target: 'YouTube / Twitch / Stage Broadcast',
          description:
            'Optimized for long broadcasts, overlays, chat-safe composition, and live switching.',
        },
        {
          id: 'vlog-mobile-story',
          mode: 'vlog',
          name: 'Mobile Story Cut',
          aspectRatio: '9:16',
          width: 1080,
          height: 1920,
          duration: 900,
          target: 'Reels / Stories / Clips',
          description:
            'Tuned for quick vertical edits, teaser cuts, and mobile-native updates.',
        },
      ]),
      setProductionMode: jest.fn((mode: 'movie' | 'stream' | 'vlog') => {
        const presetMap = {
          movie: {
            id: 'movie-cinema-4k',
            mode: 'movie',
            name: 'CinemaScope 4K',
            aspectRatio: '2.39:1',
            width: 4096,
            height: 1716,
            duration: 7200,
            target: 'Full-Length Film',
            description:
              'Built for long-form scenes, theatrical pacing, and soundtrack-driven storytelling.',
          },
          stream: {
            id: 'stream-live-landscape',
            mode: 'stream',
            name: 'Live Stream Landscape',
            aspectRatio: '16:9',
            width: 1920,
            height: 1080,
            duration: 14400,
            target: 'YouTube / Twitch / Stage Broadcast',
            description:
              'Optimized for long broadcasts, overlays, chat-safe composition, and live switching.',
          },
          vlog: {
            id: 'vlog-mobile-story',
            mode: 'vlog',
            name: 'Mobile Story Cut',
            aspectRatio: '9:16',
            width: 1080,
            height: 1920,
            duration: 900,
            target: 'Reels / Stories / Clips',
            description:
              'Tuned for quick vertical edits, teaser cuts, and mobile-native updates.',
          },
        } as const;

        videoEngine.productionMode.set(mode);
        videoEngine.deliveryPreset.set(presetMap[mode] as any);
        videoEngine.duration.set(presetMap[mode].duration);
      }),
      applyDeliveryPreset: jest.fn((presetId: string) => {
        if (presetId === 'vlog-mobile-story') {
          videoEngine.productionMode.set('vlog');
          videoEngine.deliveryPreset.set({
            id: 'vlog-mobile-story',
            mode: 'vlog',
            name: 'Mobile Story Cut',
            aspectRatio: '9:16',
            width: 1080,
            height: 1920,
            duration: 900,
            target: 'Reels / Stories / Clips',
            description:
              'Tuned for quick vertical edits, teaser cuts, and mobile-native updates.',
          });
          videoEngine.duration.set(900);
        }
      }),
    };

    const cameraStream = signal<MediaStream | null>(null);
    const cameraStatus = signal<'off' | 'live'>('off');
    const cameraSource = signal<'camera' | 'screen'>('camera');
    const cameraFacing = signal<'user' | 'environment'>('user');
    const cameraRecording = signal(false);
    const cameraRecordingSeconds = signal(0);
    const cameraLastError = signal<string | null>(null);
    const cameraWarning = signal<string | null>(null);
    const cameraRetrying = signal(false);
    const cameraRetryAttempt = signal(0);
    const camera = {
      stream: cameraStream,
      status: cameraStatus,
      lastError: cameraLastError,
      previewWarning: cameraWarning,
      isRetrying: cameraRetrying,
      retryAttempt: cameraRetryAttempt,
      devices: signal<
        { deviceId: string; label: string; isDefault: boolean }[]
      >([]),
      selectedDeviceId: signal<string | null>('cam-1'),
      facingMode: cameraFacing,
      sourceType: cameraSource,
      mirrored: signal(true),
      isRecording: cameraRecording,
      recordingSeconds: cameraRecordingSeconds,
      isLive: computed(
        () => cameraStatus() === 'live' && cameraStream() !== null
      ),
      isStarting: computed(() => false),
      isSupported: computed(() => true),
      canSwitchDevice: computed(() => !cameraRecording()),
      // Mirrors the service contract: a retry is offered for any failed
      // acquisition or a live feed that never painted a frame.
      canRetry: computed(
        () => !cameraRetrying() && (!!cameraLastError() || !!cameraWarning())
      ),
      screenShareSupported: computed(() => true),
      deviceName: computed(() =>
        cameraSource() === 'screen' ? 'Screen share' : 'Front Camera'
      ),
      statusLabel: computed(() => {
        if (cameraStatus() === 'live' && cameraSource() === 'screen') {
          return 'SCREEN LIVE';
        }
        const labels: Record<string, string> = {
          off: 'CAMERA OFF',
          requesting: 'REQUESTING ACCESS…',
          live: 'LIVE',
          denied: 'ACCESS DENIED',
          unavailable: 'NO CAMERA',
          unsupported: 'CAMERA UNSUPPORTED',
          insecure: 'NEEDS HTTPS',
        };
        return labels[cameraStatus()] ?? 'CAMERA OFF';
      }),
      statusDetail: computed(() => 'Front Camera · 1280×720 @ 30fps'),
      start: jest.fn(async () => {
        cameraStream.set({ id: 'mock-stream' } as unknown as MediaStream);
        cameraStatus.set('live');
        cameraSource.set('camera');
        return true;
      }),
      startScreenShare: jest.fn(async () => {
        cameraStream.set({ id: 'screen-stream' } as unknown as MediaStream);
        cameraStatus.set('live');
        cameraSource.set('screen');
        return true;
      }),
      stop: jest.fn(() => {
        cameraStream.set(null);
        cameraStatus.set('off');
        cameraSource.set('camera');
      }),
      setDevice: jest.fn(async () => true),
      switchFacing: jest.fn(async () => {
        cameraFacing.update((mode) =>
          mode === 'user' ? 'environment' : 'user'
        );
        return true;
      }),
      startRecording: jest.fn(() => {
        cameraRecording.set(true);
        return true;
      }),
      stopRecording: jest.fn(async () => {
        cameraRecording.set(false);
        return new Blob(['camera-take'], { type: 'video/webm' });
      }),
      captureFrame: jest.fn(
        () => 'data:image/jpeg;base64,camera-frame'
      ),
      markPreviewReady: jest.fn(),
      retry: jest.fn(async () => {
        cameraRetrying.set(true);
        cameraStream.set({ id: 'mock-stream' } as unknown as MediaStream);
        cameraStatus.set('live');
        cameraSource.set('camera');
        cameraLastError.set(null);
        cameraWarning.set(null);
        cameraRetrying.set(false);
        return true;
      }),
    };

    const exportService = {
      startVideoExport: jest.fn(),
      downloadBlob: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ImageVideoLabComponent],
      providers: [
        { provide: LoggingService, useValue: { error: jest.fn(), warn: jest.fn() } },
        { provide: AiService, useValue: { generateImage: jest.fn() } },
        { provide: UserContextService, useValue: {} },
        { provide: VideoEngineService, useValue: videoEngine },
        { provide: ExportService, useValue: exportService },
        { provide: CameraCaptureService, useValue: camera },
      ],
    })
      .overrideComponent(ImageVideoLabComponent, {
        set: {
          template:
            '<canvas #previewCanvas></canvas><video #cameraFeed></video>',
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ImageVideoLabComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const video = fixture.nativeElement.querySelector(
      'video'
    ) as HTMLVideoElement;

    return {
      component,
      videoEngine,
      camera,
      exportService,
      fixture,
      video,
      /** Render one preview frame on demand (the rAF loop is stubbed out). */
      renderFrame: () => {
        (
          component as unknown as { renderPreview: () => void }
        ).renderPreview();
      },
    };
  };

  /**
   * jsdom ships no media implementation at all, so a bare `pause()` reaches
   * jsdom's "not implemented" reporter and logs an error. `afterEach` restores
   * the per-test spies *before* Angular tears the fixture down, so the
   * prototype needs a durable no-op underneath them or every teardown of a
   * fixture holding a playing element prints a stack trace.
   */
  beforeAll(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: () => Promise.resolve(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  });

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:test'),
    });
    const mockGradient = { addColorStop: jest.fn() };
    ctxStub = {
      fillRect: jest.fn(),
      createLinearGradient: jest.fn(() => mockGradient),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn(() => ({ width: 10 })),
      strokeRect: jest.fn(),
      setLineDash: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      drawImage: jest.fn(),
      translate: jest.fn(),
      scale: jest.fn(),
      globalAlpha: 1,
      filter: 'none',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
    };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctxStub as unknown as CanvasRenderingContext2D
    );
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1 as unknown as number);
    // jsdom implements neither play() nor pause(); the component tolerates the
    // former, and the scrub tests assert on the latter.
    jest
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = jest
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a full-length movie blueprint by default', async () => {
    const { component } = await createComponent();

    expect(component.productionBlueprint()).toEqual(
      expect.objectContaining({
        runtimeLabel: '2h 0m',
        targetLabel: 'Full-Length Film',
        formatLabel: '2.39:1 · 4096×1716',
      })
    );
  });

  it('switches production mode and updates feedback', async () => {
    const { component, videoEngine } = await createComponent();

    component.selectProductionMode('stream');

    expect(videoEngine.setProductionMode).toHaveBeenCalledWith('stream');
    expect(component.aiFeedback()).toContain('STREAM PRODUCTION MODE ACTIVE');
    expect(component.activePreset().name).toBe('Live Stream Landscape');
  });

  it('routes uploaded images into overlays with mode-aware duration', async () => {
    const { component, videoEngine } = await createComponent();

    component.selectProductionMode('vlog');
    await component.onFileUpload({
      target: {
        files: [{ name: 'thumb.png', type: 'image/png' }],
      },
    });

    expect(videoEngine.addClip).toHaveBeenCalledWith(
      't2',
      expect.objectContaining({
        name: 'thumb.png',
        type: 'image',
        duration: 8,
        effects: expect.objectContaining({
          filter: 'cinematic',
          transition: 'fade',
          transitionDuration: 0.5,
          trimStart: 0,
          trimEnd: 0,
        }),
      })
    );
  });

  it('clicks on the timeline seek the playhead proportionally', async () => {
    const { component, videoEngine } = await createComponent();
    videoEngine.duration.set(900);

    const rect = { left: 100, width: 900, top: 0, height: 40 };
    component.seekFromTimelineEvent({
      currentTarget: { getBoundingClientRect: () => rect },
      clientX: 550,
    } as unknown as MouseEvent);

    expect(videoEngine.seek).toHaveBeenCalledWith(45);
  });

  it('clamps timeline clicks outside the lane bounds', async () => {
    const { component, videoEngine } = await createComponent();
    videoEngine.duration.set(900);

    const rect = { left: 100, width: 900, top: 0, height: 40 };
    component.seekFromTimelineEvent({
      currentTarget: { getBoundingClientRect: () => rect },
      clientX: 50,
    } as unknown as MouseEvent);
    expect(videoEngine.seek).toHaveBeenCalledWith(0);

    component.seekFromTimelineEvent({
      currentTarget: { getBoundingClientRect: () => rect },
      clientX: 5000,
    } as unknown as MouseEvent);
    expect(videoEngine.seek).toHaveBeenCalledWith(490);
  });

  it('clamps timeline zoom between 25% and 400%', async () => {
    const { component } = await createComponent();
    for (let i = 0; i < 40; i += 1) component.zoomOut();
    expect(component.zoomLevel()).toBe(0.25);
    for (let i = 0; i < 40; i += 1) component.zoomIn();
    expect(component.zoomLevel()).toBe(4);
  });

  it('applies selected enhancements to clips under the playhead', async () => {
    const { component, videoEngine } = await createComponent();
    videoEngine.currentTime.set(4);
    videoEngine.getActiveClips.mockReturnValue([
      {
        id: 'clip-1',
        name: 'scene',
        url: 'blob:scene',
        startTime: 0,
        duration: 10,
        offset: 0,
        trackId: 't1',
        type: 'video',
        effects: {
          upscale: false,
          bgRemoval: false,
          noiseReduction: false,
          brightness: 1,
          contrast: 1,
          filter: 'none',
          transition: 'cut',
          transitionDuration: 0,
          trimStart: 0,
          trimEnd: 0,
        },
      },
    ]);

    component.selectedFilter.set('mono');
    component.selectedTransition.set('dissolve');
    component.transitionDuration.set(1.2);
    component.trimAmount.set(0.4);
    component.applyEnhancementsToActiveClips();

    expect(videoEngine.updateClip).toHaveBeenCalledWith(
      'clip-1',
      expect.objectContaining({
        effects: expect.objectContaining({
          filter: 'mono',
          transition: 'dissolve',
          transitionDuration: 1.2,
          trimStart: 0.4,
          trimEnd: 0.4,
        }),
      })
    );
  });

  describe('camera uplink', () => {
    it('starts the camera, reports the live device, and releases it again', async () => {
      const { component, camera } = await createComponent();

      await component.toggleCamera();

      expect(camera.start).toHaveBeenCalledTimes(1);
      expect(camera.isLive()).toBe(true);
      expect(component.aiFeedback()).toContain('CAMERA LIVE: FRONT CAMERA');

      await component.toggleCamera();

      expect(camera.stop).toHaveBeenCalledTimes(1);
      expect(component.aiFeedback()).toContain('UPLINK CLOSED');
    });

    it('binds the live stream to the preview video sink and clears it on stop', async () => {
      const { component, camera, video } = await createComponent();
      const sync = () =>
        (
          component as unknown as { syncCameraElement: () => void }
        ).syncCameraElement();

      await component.toggleCamera();
      sync();
      expect(video.srcObject).toBe(camera.stream());

      await component.toggleCamera();
      sync();
      expect(video.srcObject).toBeNull();
    });

    it('keeps a bound capture sink rolling instead of attaching it once', async () => {
      const { component, camera, video } = await createComponent();
      const sync = () =>
        (
          component as unknown as { syncCameraElement: () => void }
        ).syncCameraElement();
      await component.toggleCamera();
      sync();
      expect(video.srcObject).toBe(camera.stream());

      // A sink holding a stream but no longer playing paints nothing at all.
      Object.defineProperty(video, 'paused', { configurable: true, value: true });
      const playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play');
      playSpy.mockClear();

      sync();

      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    it('surfaces a camera failure instead of leaving a silent no-op', async () => {
      const { component, camera } = await createComponent();
      camera.start.mockResolvedValueOnce(false);
      camera.lastError.set('Camera permission denied.');

      await component.toggleCamera();

      expect(component.aiFeedback()).toContain('CAMERA PERMISSION DENIED');
    });

    it('retries a blocked capture and reports the restored feed', async () => {
      const { component, camera } = await createComponent();
      camera.status.set('denied');
      camera.lastError.set('Camera permission denied.');

      await component.retryCamera();

      expect(camera.retry).toHaveBeenCalledTimes(1);
      expect(camera.isLive()).toBe(true);
      expect(component.aiFeedback()).toContain('CAPTURE RESTORED');
    });

    it('surfaces the setting to change when a retry is still blocked', async () => {
      const { component, camera } = await createComponent();
      camera.status.set('denied');
      camera.retry.mockResolvedValueOnce(false);
      camera.lastError.set(
        'Camera access is blocked for this site. Re-enable it from the lock/camera icon in the address bar, then retry.'
      );

      await component.retryCamera();

      // The operator gets the instruction, not a silent second failure.
      expect(component.aiFeedback()).toContain('BLOCKED FOR THIS SITE');
      expect(component.aiFeedback()).toContain('ADDRESS BAR');
    });

    it('ignores a retry while one is already in flight', async () => {
      const { component, camera } = await createComponent();
      camera.isRetrying.set(true);

      await component.retryCamera();

      expect(camera.retry).not.toHaveBeenCalled();
    });

    it('cuts a camera frame into the overlays lane with mode-aware duration', async () => {
      const { component, videoEngine, camera } = await createComponent();
      await component.toggleCamera();
      component.selectProductionMode('vlog');

      component.captureCameraFrame();

      expect(camera.captureFrame).toHaveBeenCalledWith(
        expect.any(HTMLVideoElement),
        { maxWidth: 1920 }
      );
      expect(videoEngine.addClip).toHaveBeenCalledWith(
        't2',
        expect.objectContaining({
          name: 'Camera Frame 1',
          url: 'data:image/jpeg;base64,camera-frame',
          type: 'image',
          source: 'camera',
          duration: 8,
        })
      );
      expect(component.aiFeedback()).toContain(
        'CAMERA FRAME 1 CUT INTO THE OVERLAYS LANE'
      );
    });

    it('refuses to capture a frame while the camera is off', async () => {
      const { component, videoEngine, camera } = await createComponent();

      component.captureCameraFrame();

      expect(camera.captureFrame).not.toHaveBeenCalled();
      expect(videoEngine.addClip).not.toHaveBeenCalled();
      expect(component.aiFeedback()).toContain('START THE CAMERA');
    });

    it('reports a feed that has not decoded a frame yet', async () => {
      const { component, videoEngine, camera } = await createComponent();
      await component.toggleCamera();
      camera.captureFrame.mockReturnValueOnce(null);

      component.captureCameraFrame();

      expect(videoEngine.addClip).not.toHaveBeenCalled();
      expect(component.aiFeedback()).toContain('NO CAMERA FRAME YET');
    });

    it('records a take and lands it in the visuals lane', async () => {
      const { component, videoEngine, camera } = await createComponent();
      await component.toggleCamera();
      camera.recordingSeconds.set(7);

      await component.toggleCameraTake();
      expect(camera.startRecording).toHaveBeenCalledTimes(1);
      expect(component.aiFeedback()).toContain('CAMERA TAKE ROLLING');

      await component.toggleCameraTake();

      expect(videoEngine.addClip).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({
          name: 'Camera Take 1',
          url: 'blob:test',
          type: 'video',
          source: 'camera',
          duration: 7,
        })
      );
      expect(component.aiFeedback()).toContain('RECORDED');
    });

    it('discards a take that produced no frames', async () => {
      const { component, videoEngine, camera } = await createComponent();
      await component.toggleCamera();
      camera.stopRecording.mockResolvedValueOnce(null);

      await component.toggleCameraTake();
      await component.toggleCameraTake();

      expect(videoEngine.addClip).not.toHaveBeenCalled();
      expect(component.aiFeedback()).toContain('DISCARDED');
    });

    it('reports a take that could not start', async () => {
      const { component, camera } = await createComponent();
      await component.toggleCamera();
      camera.startRecording.mockReturnValueOnce(false);
      camera.lastError.set('Camera recording could not start on this device.');

      await component.toggleCameraTake();

      expect(component.aiFeedback()).toContain('COULD NOT START');
    });

    it('refuses to switch inputs mid-take', async () => {
      const { component, camera } = await createComponent();
      await component.toggleCamera();
      await component.toggleCameraTake();

      await component.selectCameraDevice('cam-2');
      await component.switchCameraFacing();

      expect(camera.setDevice).not.toHaveBeenCalled();
      expect(camera.switchFacing).not.toHaveBeenCalled();
      expect(component.aiFeedback()).toContain('FINISH THE CURRENT CAMERA TAKE');
    });

    it('switches inputs and flips the reported sensor', async () => {
      const { component, camera } = await createComponent();
      await component.toggleCamera();

      await component.selectCameraDevice('cam-2');
      expect(camera.setDevice).toHaveBeenCalledWith('cam-2');
      expect(component.aiFeedback()).toContain('CAMERA INPUT: FRONT CAMERA');

      await component.switchCameraFacing();
      expect(camera.switchFacing).toHaveBeenCalledTimes(1);
      expect(component.aiFeedback()).toContain('REAR');
    });

    it('toggles the viewfinder mirror', async () => {
      const { component, camera } = await createComponent();
      expect(camera.mirrored()).toBe(true);

      component.toggleCameraMirror();

      expect(camera.mirrored()).toBe(false);
      expect(component.aiFeedback()).toContain('MIRROR OFF');
    });

    it('shares a screen and reports the display feed', async () => {
      const { component, camera } = await createComponent();

      await component.captureScreen();

      expect(camera.startScreenShare).toHaveBeenCalledTimes(1);
      expect(camera.sourceType()).toBe('screen');
      expect(component.aiFeedback()).toContain('SCREEN LIVE');

      await component.captureScreen();
      expect(camera.stop).toHaveBeenCalledTimes(1);
      expect(component.aiFeedback()).toContain('SCREEN SHARE STOPPED');
    });

    it('surfaces a cancelled screen share and keeps the camera running', async () => {
      const { component, camera } = await createComponent();
      camera.startScreenShare.mockResolvedValueOnce(false);
      camera.lastError.set('Screen capture was cancelled or blocked.');

      await component.captureScreen();

      expect(component.aiFeedback()).toContain('CANCELLED OR BLOCKED');
    });

    it('labels screen captures so they are never mirrored as camera media', async () => {
      const { component, videoEngine, camera } = await createComponent();
      await component.captureScreen();
      camera.captureFrame.mockReturnValueOnce('data:image/jpeg;base64,screen');
      camera.stopRecording.mockResolvedValueOnce(new Blob(['screen-take']));

      component.captureCameraFrame();
      expect(videoEngine.addClip).toHaveBeenCalledWith(
        't2',
        expect.objectContaining({ name: 'Screen Frame 1', source: 'screen' })
      );

      await component.toggleCameraTake();
      camera.recordingSeconds.set(4);
      await component.toggleCameraTake();
      expect(videoEngine.addClip).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ name: 'Camera Take 2', source: 'screen' })
      );
    });

    it('reports an honest transport badge for every capture state', async () => {
      const { component, videoEngine, camera } = await createComponent();
      expect(component.transportLabel()).toBe('Standby');
      expect(component.transportActive()).toBe(false);

      videoEngine.isPlaying.set(true);
      expect(component.transportLabel()).toBe('Playing');
      expect(component.transportActive()).toBe(true);

      await component.toggleCamera();
      expect(component.transportLabel()).toBe('Camera Live');

      camera.recordingSeconds.set(9);
      camera.isRecording.set(true);
      expect(component.transportLabel()).toBe('REC 9s');
    });
  });

  describe('preview rendering', () => {
    it('sizes the program monitor backing store from the delivery preset', async () => {
      const { component, fixture } = await createComponent();
      const canvas = fixture.nativeElement.querySelector(
        'canvas'
      ) as HTMLCanvasElement;
      // CinemaScope 4K is 2.39:1 — longest edge capped, ratio preserved.
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(803);

      component.selectProductionMode('vlog');
      fixture.detectChanges();

      // Mobile Story Cut is 9:16 — the backing store follows the preset.
      expect(canvas.width).toBe(1080);
      expect(canvas.height).toBe(1920);
    });

    it('paints the live camera feed and marks the first frame as ready', async () => {
      const { component, video, camera, renderFrame } =
        await createComponent();
      Object.defineProperty(video, 'videoWidth', {
        configurable: true,
        value: 1280,
      });
      Object.defineProperty(video, 'videoHeight', {
        configurable: true,
        value: 720,
      });
      await component.toggleCamera();
      (
        component as unknown as { syncCameraElement: () => void }
      ).syncCameraElement();
      (ctxStub.drawImage as jest.Mock).mockClear();

      renderFrame();

      expect(ctxStub.drawImage).toHaveBeenCalledWith(
        video,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
      expect(camera.markPreviewReady).toHaveBeenCalled();
    });

    it('draws a decoded clip image instead of the signal placeholder', async () => {
      const { videoEngine, renderFrame } = await createComponent();
      const fakeImage = {
        complete: true,
        naturalWidth: 640,
        naturalHeight: 360,
      };
      jest
        .spyOn(globalThis as unknown as { Image: unknown }, 'Image')
        .mockImplementation(() => fakeImage as unknown as HTMLImageElement);
      videoEngine.getActiveClips.mockReturnValue([
        {
          id: 'clip-1',
          name: 'shot.png',
          url: 'blob:shot',
          startTime: 0,
          duration: 10,
          offset: 0,
          trackId: 't1',
          type: 'image',
          source: 'upload',
          effects: {
            upscale: false,
            bgRemoval: false,
            noiseReduction: false,
            brightness: 1,
            contrast: 1,
            filter: 'none',
            transition: 'cut',
            transitionDuration: 0,
            trimStart: 0,
            trimEnd: 0,
          },
        },
      ]);
      (ctxStub.drawImage as jest.Mock).mockClear();
      (ctxStub.createLinearGradient as jest.Mock).mockClear();

      renderFrame();

      expect(ctxStub.drawImage).toHaveBeenCalledWith(
        fakeImage,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
      expect(ctxStub.createLinearGradient).not.toHaveBeenCalled();
    });

    it('scrubs a paused clip to the exact source frame', async () => {
      const { videoEngine, renderFrame } = await createComponent();
      const videos = installVideoElement();
      videoEngine.getActiveClips.mockReturnValue([
        createVideoClip({ offset: 2 }),
      ]);
      renderFrame();
      const video = decodeVideo(videos[0]);
      videoEngine.isPlaying.set(false);

      videoEngine.currentTime.set(3.5);
      renderFrame();
      expect(video.writes).toEqual([5.5]);

      // One frame of movement on the timeline must move the source by one frame.
      videoEngine.currentTime.set(3.54);
      renderFrame();
      expect(video.writes).toEqual([5.5, 5.54]);

      // Re-rendering the same instant is not a seek.
      renderFrame();
      expect(video.writes).toEqual([5.5, 5.54]);
    });

    it('parks the playhead inside the real media duration', async () => {
      const { videoEngine, renderFrame } = await createComponent();
      const videos = installVideoElement();
      videoEngine.getActiveClips.mockReturnValue([
        createVideoClip({ offset: 0, duration: 10 }),
      ]);
      renderFrame();
      const video = decodeVideo(videos[0], { duration: 4 });

      videoEngine.currentTime.set(9);
      renderFrame();

      expect(video.writes[0]).toBeCloseTo(3.999, 3);
      expect(video.writes[0]).toBeLessThan(4);
    });

    it('corrects drift only past the tolerance while playing', async () => {
      const { videoEngine, renderFrame } = await createComponent();
      const videos = installVideoElement();
      videoEngine.getActiveClips.mockReturnValue([createVideoClip()]);
      renderFrame();
      const video = videos[0];
      const handle = decodeVideo(video, { currentTime: 5.5 });
      videoEngine.currentTime.set(5.5);
      videoEngine.isPlaying.set(true);

      renderFrame();
      expect(handle.writes).toEqual([]);

      video.currentTime = 6.4; // the element ran ahead of the playhead
      handle.writes.length = 0;
      renderFrame();
      expect(handle.writes).toEqual([5.5]);
    });

    it('parks clips that are no longer under the playhead', async () => {
      const { videoEngine, renderFrame } = await createComponent();
      const videos = installVideoElement();
      videoEngine.getActiveClips.mockReturnValue([
        createVideoClip({ id: 'a', url: 'blob:a' }),
      ]);
      renderFrame();
      const parked = decodeVideo(videos[0]);
      parked.setPaused(false);
      pauseSpy.mockClear();

      videoEngine.getActiveClips.mockReturnValue([
        createVideoClip({ id: 'b', url: 'blob:b', startTime: 20 }),
      ]);
      renderFrame();

      expect(pauseSpy).toHaveBeenCalled();
    });

    it('mirrors camera clips but never a screen share', async () => {
      const { videoEngine, fixture, renderFrame } = await createComponent();
      const canvas = fixture.nativeElement.querySelector(
        'canvas'
      ) as HTMLCanvasElement;
      const videos = installVideoElement();
      videoEngine.getActiveClips.mockReturnValue([
        createVideoClip({ source: 'camera' }),
      ]);
      renderFrame();
      decodeVideo(videos[0]);
      (ctxStub.translate as jest.Mock).mockClear();
      (ctxStub.drawImage as jest.Mock).mockClear();

      renderFrame();
      expect(ctxStub.translate).toHaveBeenCalledWith(canvas.width, 0);
      expect(ctxStub.drawImage).toHaveBeenCalled();

      videoEngine.getActiveClips.mockReturnValue([
        createVideoClip({ id: 'screen', url: 'blob:screen', source: 'screen' }),
      ]);
      renderFrame();
      decodeVideo(videos[1]);
      (ctxStub.translate as jest.Mock).mockClear();
      (ctxStub.drawImage as jest.Mock).mockClear();

      renderFrame();
      expect(ctxStub.drawImage).toHaveBeenCalled();
      expect(ctxStub.translate).not.toHaveBeenCalled();
    });

    it('names a blocked permission on the program monitor', async () => {
      const { camera, renderFrame } = await createComponent();
      camera.status.set('denied');
      camera.lastError.set('Camera permission denied.');
      (ctxStub.fillText as jest.Mock).mockClear();

      renderFrame();

      // The reason has to appear where the operator is looking, not only in the
      // sidebar — a black monitor is indistinguishable from a dead camera.
      expect(ctxStub.fillText).toHaveBeenCalledWith(
        'ACCESS DENIED',
        expect.any(Number),
        expect.any(Number)
      );
      expect(ctxStub.fillText).toHaveBeenCalledWith(
        'CAMERA PERMISSION DENIED.',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('flags a live feed that never decodes a frame', async () => {
      const { component, renderFrame } = await createComponent();
      await component.toggleCamera();
      (ctxStub.fillText as jest.Mock).mockClear();

      renderFrame();

      // Authorized but frame-less is a distinct state from "permission denied".
      expect(ctxStub.fillText).toHaveBeenCalledWith(
        'LIVE FEED AUTHORIZED BUT NO FRAMES YET',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('leaves a decoding live feed unannotated', async () => {
      const { component, video, renderFrame } = await createComponent();
      Object.defineProperty(video, 'videoWidth', {
        configurable: true,
        value: 1280,
      });
      Object.defineProperty(video, 'videoHeight', {
        configurable: true,
        value: 720,
      });
      await component.toggleCamera();
      (ctxStub.fillText as jest.Mock).mockClear();

      renderFrame();

      expect(ctxStub.fillText).not.toHaveBeenCalledWith(
        'LIVE FEED AUTHORIZED BUT NO FRAMES YET',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('falls back to the signal placeholder while media is still decoding', async () => {
      const { videoEngine, renderFrame } = await createComponent();
      videoEngine.getActiveClips.mockReturnValue([
        {
          id: 'clip-2',
          name: 'take.webm',
          url: 'blob:take',
          startTime: 0,
          duration: 10,
          offset: 0,
          trackId: 't1',
          type: 'video',
          source: 'camera',
          effects: {
            upscale: false,
            bgRemoval: false,
            noiseReduction: false,
            brightness: 1,
            contrast: 1,
            filter: 'none',
            transition: 'cut',
            transitionDuration: 0,
            trimStart: 0,
            trimEnd: 0,
          },
        },
      ]);
      (ctxStub.drawImage as jest.Mock).mockClear();
      (ctxStub.createLinearGradient as jest.Mock).mockClear();

      renderFrame();

      expect(ctxStub.createLinearGradient).toHaveBeenCalled();
      expect(ctxStub.drawImage).not.toHaveBeenCalled();
    });
  });

  describe('video export', () => {
    /** Wire the export mock to a recorder the test can drive by hand. */
    const installRecorder = (exportService: {
      startVideoExport: jest.Mock;
      downloadBlob: jest.Mock;
    }) => {
      let completeExport: ((blob: Blob) => void) | null = null;
      const recorderStop = jest.fn();
      exportService.startVideoExport.mockImplementation(() => ({
        recorder: { stop: recorderStop },
        result: new Promise<Blob>((resolve) => {
          completeExport = resolve;
        }),
      }));
      return {
        recorderStop,
        complete: (blob: Blob) => completeExport?.(blob),
      };
    };

    it('records the user-selected capture window off the preview canvas', async () => {
      const { component, videoEngine, exportService } =
        await createComponent();
      const { recorderStop, complete } = installRecorder(exportService);
      jest.useFakeTimers();
      component.exportWindow.set(5);

      const run = component.exportVideo();
      await Promise.resolve();
      await Promise.resolve();

      expect(exportService.startVideoExport).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        { fps: 30, withAudio: true }
      );
      expect(videoEngine.seek).toHaveBeenCalledWith(0);
      expect(videoEngine.play).toHaveBeenCalledTimes(1);
      expect(component.isExporting()).toBe(true);

      jest.advanceTimersByTime(5000);
      expect(recorderStop).toHaveBeenCalledTimes(1);
      // Paused once to rewind to 0, then again when the window closed.
      expect(videoEngine.pause).toHaveBeenCalledTimes(2);

      complete(new Blob(['video-bytes'], { type: 'video/webm' }));
      await run;

      expect(exportService.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringContaining('smuve_movie_movie-cinema-4k_')
      );
      expect(component.exportProgress()).toBe(100);
      expect(component.isExporting()).toBe(false);
      expect(component.aiFeedback()).toContain('VIDEO EXPORT CAPTURE COMPLETE');
    });

    it('reports a no-frames export honestly and resets progress', async () => {
      const { component, exportService } = await createComponent();
      const { complete } = installRecorder(exportService);
      jest.useFakeTimers();

      const run = component.exportVideo();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(10_000);
      complete(new Blob([], { type: 'video/webm' }));
      await run;

      expect(exportService.downloadBlob).not.toHaveBeenCalled();
      expect(component.exportProgress()).toBe(0);
      expect(component.aiFeedback()).toContain('NO VIDEO FRAMES');
      expect(component.isExporting()).toBe(false);
    });

    it('surfaces an export that cannot start', async () => {
      const { component, exportService } = await createComponent();
      exportService.startVideoExport.mockRejectedValueOnce(
        new Error('Video export is not supported in this browser.')
      );

      await component.exportVideo();

      expect(component.isExporting()).toBe(false);
      expect(component.aiFeedback()).toContain('NOT SUPPORTED IN THIS BROWSER');
    });

    it('restores playback when the transport was already running', async () => {
      const { component, videoEngine, exportService } =
        await createComponent();
      const { complete } = installRecorder(exportService);
      videoEngine.isPlaying.set(true);
      jest.useFakeTimers();

      const run = component.exportVideo();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(component.exportWindow() * 1000);
      complete(new Blob(['video-bytes'], { type: 'video/webm' }));
      await run;

      // Callback started the render pass, then handed the transport back.
      expect(videoEngine.play).toHaveBeenCalledTimes(2);
      expect(videoEngine.pause).toHaveBeenCalledTimes(2);
      expect(component.isExporting()).toBe(false);
    });
  });

  describe('teardown', () => {
    it('hands the camera back when the module is closed', async () => {
      const { component, camera, fixture } = await createComponent();
      await component.toggleCamera();
      expect(camera.isLive()).toBe(true);

      fixture.destroy();

      // Releasing the stream is the only way the OS frees the camera light.
      expect(camera.stop).toHaveBeenCalled();
      expect(camera.isLive()).toBe(false);
    });

    it('stops and unloads every cached clip on close', async () => {
      const { videoEngine, fixture, renderFrame } = await createComponent();
      const videos = installVideoElement();
      videoEngine.getActiveClips.mockReturnValue([createVideoClip()]);
      renderFrame();
      const cached = decodeVideo(videos[0]);
      cached.setPaused(false);
      pauseSpy.mockClear();

      expect(() => fixture.destroy()).not.toThrow();

      expect(pauseSpy).toHaveBeenCalled();
      expect(videos[0].getAttribute('src')).toBe('');
    });

    it('survives a host whose media element cannot be paused', async () => {
      const { videoEngine, fixture, renderFrame } = await createComponent();
      const videos = installVideoElement();
      videoEngine.getActiveClips.mockReturnValue([createVideoClip()]);
      renderFrame();
      const cached = decodeVideo(videos[0]);
      cached.setPaused(false);
      pauseSpy.mockImplementation(() => {
        throw new TypeError('Illegal invocation');
      });

      // A partial media implementation must never break component teardown.
      expect(() => fixture.destroy()).not.toThrow();
    });

    it('revokes the object URLs it created for ingested files', async () => {
      const revoke = jest.spyOn(URL, 'revokeObjectURL');
      const { component, fixture } = await createComponent();
      await component.onFileUpload({
        target: { files: [{ name: 'thumb.png', type: 'image/png' }] },
      });

      fixture.destroy();

      expect(revoke).toHaveBeenCalledWith('blob:test');
    });
  });
});
