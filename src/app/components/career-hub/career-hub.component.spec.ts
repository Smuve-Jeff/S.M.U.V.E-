import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CareerHubComponent } from './career-hub.component';
import { provideRouter } from '@angular/router';
import { API_KEY_TOKEN, AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { CommandCenterComponent } from '../command-center/command-center.component';

describe('CareerHubComponent', () => {
  let component: CareerHubComponent;
  let fixture: ComponentFixture<CareerHubComponent>;

  beforeEach(async () => {
    const mockAudioParam = {
      value: 0,
      setTargetAtTime: jest.fn().mockReturnThis(),
      setValueAtTime: jest.fn().mockReturnThis(),
      linearRampToValueAtTime: jest.fn().mockReturnThis(),
      exponentialRampToValueAtTime: jest.fn().mockReturnThis(),
    };

    const mockNode = {
      connect: jest.fn().mockImplementation((target) => target),
      disconnect: jest.fn().mockReturnThis(),
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
      start: jest.fn().mockReturnThis(),
      stop: jest.fn().mockReturnThis(),
      buffer: null,
      curve: null,
      oversample: 'none',
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
        return {
          ...mockNode,
          getByteFrequencyData: jest.fn(),
          getByteTimeDomainData: jest.fn(),
          fftSize: 2048,
          frequencyBinCount: 1024,
        };
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
      createWaveShaper() {
        return { ...mockNode };
      }
      createBuffer() {
        return {
          getChannelData: () => new Float32Array(100),
          numberOfChannels: 2,
          length: 100,
          sampleRate: 44100,
          duration: 1,
        };
      }
      createMediaStreamDestination() {
        return { stream: {}, connect: jest.fn() };
      }
      get destination() {
        return { connect: jest.fn(), disconnect: jest.fn() };
      }
      get currentTime() {
        return 0;
      }
      get sampleRate() {
        return 44100;
      }
      resume() {
        return Promise.resolve();
      }
      suspend() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({
          duration: 1,
          getChannelData: () => new Float32Array(100),
        });
      }
    };
    (window as any).webkitAudioContext = (window as any).AudioContext;

    await TestBed.configureTestingModule({
      imports: [
        CareerHubComponent,
        NoopAnimationsModule,
        CommandCenterComponent,
      ],
      providers: [
        provideRouter([]),
        AiService,
        UIService,
        {
          provide: API_KEY_TOKEN,
          useValue: 'TEST_KEY_LONG_ENOUGH_FOR_STRATEGIC_DECREE',
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CareerHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render command center', () => {
    const commandCenter = fixture.debugElement.query(
      By.directive(CommandCenterComponent)
    );
    expect(commandCenter).toBeTruthy();
  });
});
