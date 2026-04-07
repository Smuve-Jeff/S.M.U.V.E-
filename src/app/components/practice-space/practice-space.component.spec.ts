import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PracticeSpaceComponent } from './practice-space.component';
import { provideRouter } from '@angular/router';
import { API_KEY_TOKEN } from '../../services/ai.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('PracticeSpaceComponent', () => {
  let component: PracticeSpaceComponent;
  let fixture: ComponentFixture<PracticeSpaceComponent>;

  beforeEach(async () => {
    const mockNode = {
      connect: jest.fn().mockReturnThis(),
      disconnect: jest.fn(),
      gain: {
        value: 0,
        setTargetAtTime: jest.fn(),
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn(),
      },
      frequency: { value: 0, setTargetAtTime: jest.fn() },
      threshold: { value: 0, setTargetAtTime: jest.fn() },
      ratio: { value: 0, setTargetAtTime: jest.fn() },
      attack: { value: 0, setTargetAtTime: jest.fn() },
      release: { value: 0, setTargetAtTime: jest.fn() },
      pan: { value: 0, setTargetAtTime: jest.fn() },
      Q: { value: 0, setTargetAtTime: jest.fn() },
      curve: null,
      oversample: 'none',
      start: jest.fn(),
      stop: jest.fn(),
    };

    (window as any).AudioContext = class {
      state = 'running';
      resume = jest.fn().mockResolvedValue(undefined);
      close = jest.fn().mockResolvedValue(undefined);
      createGain() {
        return { ...mockNode };
      }
      createOscillator() {
        return { ...mockNode, type: 'sine' };
      }
      createDynamicsCompressor() {
        return { ...mockNode };
      }
      createWaveShaper() {
        return { ...mockNode };
      }
      createAnalyser() {
        return {
          ...mockNode,
          fftSize: 0,
          frequencyBinCount: 10,
          getByteFrequencyData: jest.fn(),
        };
      }
      createConvolver() {
        return { ...mockNode };
      }
      createDelay() {
        return { ...mockNode };
      }
      createBiquadFilter() {
        return { ...mockNode };
      }
      createStereoPanner() {
        return { ...mockNode };
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(100) };
      }
      get destination() {
        return {};
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
      imports: [PracticeSpaceComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        {
          provide: API_KEY_TOKEN,
          useValue: 'TEST_KEY_LONG_ENOUGH_FOR_STRATEGIC_DECREE',
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PracticeSpaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Clean up any intervals/timeouts
    if (component.metronomeActive()) {
      component.toggleMetronome();
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle metronome', () => {
    expect(component.metronomeActive()).toBe(false);
    component.toggleMetronome();
    expect(component.metronomeActive()).toBe(true);
    component.toggleMetronome();
    expect(component.metronomeActive()).toBe(false);
  });

  it('should toggle metronome audio', () => {
    expect(component.metronomeAudioEnabled()).toBe(true);
    component.toggleMetronomeAudio();
    expect(component.metronomeAudioEnabled()).toBe(false);
    component.toggleMetronomeAudio();
    expect(component.metronomeAudioEnabled()).toBe(true);
  });

  it('should update BPM', () => {
    const event = { target: { value: '140' } } as any;
    component.updateBpm(event);
    expect(component.metronomeBpm()).toBe(140);
  });

  it('should clamp BPM to valid range', () => {
    // Test lower bound
    const lowEvent = { target: { value: '30' } } as any;
    component.updateBpm(lowEvent);
    expect(component.metronomeBpm()).toBe(120); // Should remain unchanged (30 is below 40)

    // Test upper bound
    const highEvent = { target: { value: '250' } } as any;
    component.updateBpm(highEvent);
    expect(component.metronomeBpm()).toBe(120); // Should remain unchanged (250 is above 240)
  });
});
