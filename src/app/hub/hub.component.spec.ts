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
      createChannelSplitter() {
        return { ...mockNode };
      }
      createChannelMerger() {
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
          label: 'The Booth',
          title: 'Studio live view',
          layoutClass: 'panel-studio',
        }),
        expect.objectContaining({
          label: 'Label Desk',
          title: 'Executive command surface',
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

  it('selects and cycles the cinematic signal reel', () => {
    expect(component.activeBackdropIndex()).toBe(0);
    expect(component.activeBackdrop().label).toBe('The Booth');

    component.selectBackdrop(2);
    expect(component.activeBackdropIndex()).toBe(2);
    expect(component.activeBackdrop().label).toBe('City Pulse');

    component.cycleBackdrop(1);
    expect(component.activeBackdropIndex()).toBe(3);
    component.cycleBackdrop(1);
    expect(component.activeBackdropIndex()).toBe(0);
    component.selectBackdrop(99);
    expect(component.activeBackdropIndex()).toBe(0);
  });

  it('renders the dynamic command-center surfaces', () => {
    const nativeElement = fixture.nativeElement as HTMLElement;
    const text = nativeElement.textContent || '';

    expect(nativeElement.querySelector('.hub-command-center')).not.toBeNull();
    expect(nativeElement.querySelector('.workspace-card-produce')).not.toBeNull();
    expect(nativeElement.querySelector('.workspace-card-studio')).not.toBeNull();
    expect(nativeElement.querySelector('.workspace-card-timeline')).not.toBeNull();
    expect(nativeElement.querySelector('.workspace-card-cloud')).not.toBeNull();
    expect(nativeElement.querySelector('.recent-project-list, .empty-projects')).not.toBeNull();
    expect(text).toContain('AI PRODUCE');
    expect(text).toContain('THE BOOTH');
    expect(text).toContain('SESSION GRAPH');
    expect(text).toContain('CLOUD VAULT');
    expect(text).toContain('Signal desk');
    expect(text).toContain('Career trajectory');
    expect(nativeElement.querySelector('.now-playing-panel')).toBeNull();
    expect(nativeElement.querySelectorAll('.explore-card').length).toBe(
      component.featureSpotlights.length
    );
  });
});
