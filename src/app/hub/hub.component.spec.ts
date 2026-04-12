import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HubComponent } from './hub.component';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { API_KEY_TOKEN } from '../services/ai.service';
import { OnboardingService } from '../services/onboarding.service';

describe('HubComponent', () => {
  let component: HubComponent;
  let fixture: ComponentFixture<HubComponent>;

  beforeEach(async () => {
    // Mock AudioContext
    const mockAudioParam = {
      value: 0,
      setTargetAtTime: function () {
        return this;
      },
      setValueAtTime: function () {
        return this;
      },
      linearRampToValueAtTime: function () {
        return this;
      },
      exponentialRampToValueAtTime: function () {
        return this;
      },
    };

    const mockNode = {
      connect: function (target: any) {
        return target;
      },
      disconnect: function () {
        return this;
      },
      gain: mockAudioParam,
      frequency: mockAudioParam,
      Q: mockAudioParam,
      threshold: mockAudioParam,
      knee: mockAudioParam,
      ratio: mockAudioParam,
      attack: mockAudioParam,
      release: mockAudioParam,
      pan: mockAudioParam,
      delayTime: mockAudioParam,
      playbackRate: mockAudioParam,
      start: function () {
        return this;
      },
      stop: function () {
        return this;
      },
      buffer: null,
    };

    (window as any).AudioContext = class {
      createGain() {
        return { ...mockNode };
      }
      createOscillator() {
        return { ...mockNode };
      }
      createDynamicsCompressor() {
        return { ...mockNode };
      }
      createWaveShaper() {
        return { ...mockNode, curve: null, oversample: 'none' };
      }
      createDelay() {
        return { ...mockNode };
      }
      createBiquadFilter() {
        return { ...mockNode };
      }
      createAnalyser() {
        return { ...mockNode, getByteFrequencyData: () => {} };
      }
      createConvolver() {
        return { ...mockNode };
      }
      createStereoPanner() {
        return { ...mockNode };
      }
      createBufferSource() {
        return { ...mockNode };
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(100) };
      }
      get destination() {
        return { connect: () => {}, disconnect: () => {} };
      }
      get currentTime() {
        return 0;
      }
      get state() {
        return 'running';
      }
      get sampleRate() {
        return 44100;
      }
    };
    (window as any).webkitAudioContext = (window as any).AudioContext;

    await TestBed.configureTestingModule({
      imports: [HubComponent],
      providers: [
        provideRouter([]),
        {
          provide: API_KEY_TOKEN,
          useValue: 'MOCK_API_KEY_LONG_ENOUGH_FOR_TESTING',
        },
        {
          provide: OnboardingService,
          useValue: {
            shouldShow: signal(false),
            progress: signal(0),
            steps: signal([]),
            nextStep: signal(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('surfaces major platform areas on the landing page', () => {
    expect(component.featureSpotlights.map((feature) => feature.route)).toEqual(
      expect.arrayContaining([
        'studio',
        'piano-roll',
        'vocal-suite',
        'image-video-lab',
        'strategy',
        'tha-spot',
      ])
    );
    expect(component.workflowStages.map((stage) => stage.route)).toEqual([
      'profile',
      'studio',
      'image-video-lab',
      'release-pipeline',
    ]);
    expect(component.homeBackdropMedia).toHaveLength(4);
    expect(component.homeBackdropMedia.map((panel) => panel.src)).toEqual(
      expect.arrayContaining([
        'assets/hub/home-backdrop-studio.png',
        'assets/hub/home-backdrop-command.png',
        'assets/hub/home-backdrop-intel.png',
        'assets/hub/home-backdrop-cinema.png',
      ])
    );
    expect(component.homeBackdropMedia).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Production Suite',
          title: 'Studio performance view',
          layoutClass: 'panel-studio',
        }),
        expect.objectContaining({
          label: 'Executive Layout',
          title: 'Command surface overview',
          layoutClass: 'panel-command',
        }),
      ])
    );
  });

  it('navigates to spotlight routes from the landing page', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = jest
      .spyOn(router, 'navigate')
      .mockResolvedValue(true as never);

    component.navigateToFeature('release-pipeline');

    expect(navigateSpy).toHaveBeenCalledWith(['/release-pipeline']);
  });

  it('renders major quick actions as bento modules', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;

    // Check for bento items
    expect(
      nativeElement.querySelectorAll('.bento-item').length
    ).toBeGreaterThanOrEqual(7);

    // Check for specialized modules by looking for unique text or material icons
    const text = nativeElement.textContent || '';
    expect(text).toContain('Executive Intelligence Brief');
    expect(text).toContain('Active Production');
    expect(text).toContain('Career Path');
    expect(text).toContain('Tha Spot');
    expect(text).toContain('CinemaEngine');

    // Check for upload button (pill-action)
    expect(nativeElement.querySelector('.pill-action')).not.toBeNull();
    expect(nativeElement.querySelectorAll('.media-panel').length).toBe(
      component.homeBackdropMedia.length
    );
  });
});
