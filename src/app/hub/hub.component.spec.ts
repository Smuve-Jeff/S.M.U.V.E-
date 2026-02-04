import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HubComponent } from './hub.component';
import { provideRouter } from '@angular/router';
import { API_KEY_TOKEN } from '../services/ai.service';

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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
