import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ImageVideoLabComponent } from './image-video-lab.component';
import { LoggingService } from '../../services/logging.service';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import { VideoEngineService } from '../../services/video-engine.service';
import { ExportService } from '../../services/export.service';

describe('ImageVideoLabComponent', () => {
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
      getActiveClips: jest.fn().mockReturnValue([]),
      togglePlay: jest.fn(),
      addClip: jest.fn(),
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

    await TestBed.configureTestingModule({
      imports: [ImageVideoLabComponent],
      providers: [
        { provide: LoggingService, useValue: { error: jest.fn() } },
        { provide: AiService, useValue: { generateImage: jest.fn() } },
        { provide: UserContextService, useValue: {} },
        { provide: VideoEngineService, useValue: videoEngine },
        {
          provide: ExportService,
          useValue: {
            startVideoExport: jest.fn(),
            downloadBlob: jest.fn(),
          },
        },
      ],
    })
      .overrideComponent(ImageVideoLabComponent, {
        set: { template: '<canvas #previewCanvas></canvas>' },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ImageVideoLabComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return { component, videoEngine };
  };

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:test'),
    });
    const mockGradient = { addColorStop: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          fillRect: jest.fn(),
          createLinearGradient: jest.fn(() => mockGradient),
          beginPath: jest.fn(),
          moveTo: jest.fn(),
          lineTo: jest.fn(),
          stroke: jest.fn(),
          fillText: jest.fn(),
          strokeRect: jest.fn(),
          setLineDash: jest.fn(),
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          font: '',
          textAlign: 'left',
        }) as unknown as CanvasRenderingContext2D
    );
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1 as unknown as number);
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
      })
    );
  });
});
