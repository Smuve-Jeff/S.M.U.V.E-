import { TestBed } from '@angular/core/testing';
import { MicrophoneService } from '../microphone.service';
import { LoggingService } from '../logging.service';

describe('MicrophoneService', () => {
  let service: MicrophoneService;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });

    TestBed.configureTestingModule({
      providers: [
        MicrophoneService,
        {
          provide: LoggingService,
          useValue: {
            error: jest.fn(),
            info: jest.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(MicrophoneService);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it('classifies rich interface capabilities for default phantom-powered devices', () => {
    const device = service.describeDevice({
      deviceId: 'default',
      label: 'Default Focusrite Scarlett 48V Headphones MIDI',
    } as MediaDeviceInfo);

    expect(device.type).toBe('interface');
    expect(device.isDefault).toBe(true);
    expect(device.capabilities).toEqual(
      expect.arrayContaining([
        'default',
        'phantom-power',
        'headphone-monitoring',
        'midi-ready',
        'stereo',
        'usb-interface',
      ])
    );
  });

  it('detects speakerphone inputs separately from standard microphones', () => {
    const device = service.describeDevice({
      deviceId: 'communications',
      label: 'USB Speakerphone Mic',
    } as MediaDeviceInfo);

    expect(device.type).toBe('speakerphone');
    expect(device.capabilities).toEqual(
      expect.arrayContaining(['default', 'speakerphone'])
    );
  });
});
