import { TestBed } from '@angular/core/testing';
import { VideoEngineService } from '../video-engine.service';
import { AudioEngineService } from '../audio-engine.service';

describe('VideoEngineService', () => {
  let service: VideoEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        VideoEngineService,
        { provide: AudioEngineService, useValue: {} },
      ],
    });

    service = TestBed.inject(VideoEngineService);
  });

  it('starts in movie mode with the long-form preset', () => {
    expect(service.productionMode()).toBe('movie');
    expect(service.deliveryPreset().id).toBe('movie-cinema-4k');
    expect(service.duration()).toBe(7200);
  });

  it('switches the full workflow when production mode changes', () => {
    service.setProductionMode('stream');

    expect(service.productionMode()).toBe('stream');
    expect(service.deliveryPreset().id).toBe('stream-live-landscape');
    expect(service.duration()).toBe(14400);
  });

  it('applies an explicit delivery preset across mode and duration', () => {
    service.applyDeliveryPreset('vlog-mobile-story');

    expect(service.productionMode()).toBe('vlog');
    expect(service.deliveryPreset().name).toBe('Mobile Story Cut');
    expect(service.duration()).toBe(900);
  });

  it('respects trim start/end when resolving active clips', () => {
    service.addClip('t1', {
      name: 'trimmed',
      url: 'blob:trimmed',
      startTime: 5,
      duration: 10,
      offset: 0,
      type: 'video',
      effects: {
        upscale: false,
        bgRemoval: false,
        noiseReduction: false,
        brightness: 1,
        contrast: 1,
        filter: 'cinematic',
        transition: 'fade',
        transitionDuration: 0.5,
        trimStart: 2,
        trimEnd: 2,
      },
    });

    expect(service.getActiveClips(6)).toHaveLength(0);
    expect(service.getActiveClips(7.2)).toHaveLength(1);
    expect(service.getActiveClips(13.5)).toHaveLength(0);
  });
});
