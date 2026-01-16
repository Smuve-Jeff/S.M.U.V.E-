import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { UIService } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';

// Mock AudioContext
const mockAudioContext = jest.fn(() => ({
  createGain: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    gain: { value: 0, setTargetAtTime: jest.fn() },
  })),
  createAnalyser: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
  })),
  createDynamicsCompressor: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    threshold: { value: 0, setTargetAtTime: jest.fn() },
    ratio: { value: 0, setTargetAtTime: jest.fn() },
    attack: { value: 0, setTargetAtTime: jest.fn() },
    release: { value: 0, setTargetAtTime: jest.fn() },
    knee: { value: 0, setTargetAtTime: jest.fn() },
  })),
  createDelay: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    delayTime: { value: 0, setTargetAtTime: jest.fn() },
  })),
  createBiquadFilter: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    type: 'lowpass',
    frequency: { value: 0, setTargetAtTime: jest.fn() },
    Q: { value: 0, setTargetAtTime: jest.fn() },
    gain: { value: 0, setTargetAtTime: jest.fn() },
  })),
  createConvolver: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    buffer: null,
  })),
  createBuffer: jest.fn(() => ({
    getChannelData: jest.fn(() => new Float32Array(4096)),
  })),
  createStereoPanner: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    pan: { value: 0, setTargetAtTime: jest.fn() },
  })),
  createMediaStreamDestination: jest.fn(() => ({
    stream: new MediaStream(),
    connect: jest.fn().mockReturnThis(),
  })),
  createBufferSource: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    start: jest.fn(),
    stop: jest.fn(),
    buffer: null,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    playbackRate: { value: 1, setTargetAtTime: jest.fn() },
    onended: null,
  })),
  createOscillator: jest.fn(() => ({
    connect: jest.fn().mockReturnThis(),
    frequency: { value: 0 },
    type: 'sawtooth',
    start: jest.fn(),
    stop: jest.fn(),
  })),
  destination: {},
  currentTime: 0,
  sampleRate: 44100,
}));

(global as any).AudioContext = mockAudioContext;
(global as any).webkitAudioContext = mockAudioContext;

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let uiService: UIService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, ChatbotComponent, RouterTestingModule],
      providers: [UIService],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    uiService = TestBed.inject(UIService);
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle the chatbot', () => {
    jest.spyOn(uiService, 'toggleChatbot').mockImplementation();
    component.toggleChatbot();
    expect(uiService.toggleChatbot).toHaveBeenCalled();
  });
});
