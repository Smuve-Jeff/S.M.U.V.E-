import { TestBed } from "@angular/core/testing";

import { LoggingService } from "../../services/logging.service";
import { TunerLiveService } from "./tuner-live.service";

class MockAnalyser {
  fftSize = 2048;
  getFloatTimeDomainData(buffer: Float32Array): void {
    for (let index = 0; index < buffer.length; index++) {
      buffer[index] = 0.4 * Math.sin((2 * Math.PI * 440 * index) / 48000);
    }
  }
}

const mockSource = { connect: jest.fn(), disconnect: jest.fn() };

class MockAudioContext {
  state = "running";
  sampleRate = 48000;
  resume = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);
  createAnalyser(): MockAnalyser {
    return new MockAnalyser();
  }
  createMediaStreamSource(): typeof mockSource {
    return mockSource;
  }
}

describe("TunerLiveService", () => {
  let service: TunerLiveService;
  let getUserMedia: jest.Mock;
  const stopTrack = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    (window as any).AudioContext = MockAudioContext;

    getUserMedia = jest.fn().mockResolvedValue({
      getAudioTracks: () => [{ label: "USB Interface" }],
      getTracks: () => [{ stop: stopTrack }],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    TestBed.configureTestingModule({
      providers: [
        TunerLiveService,
        { provide: LoggingService, useValue: { error: jest.fn() } },
      ],
    });
    service = TestBed.inject(TunerLiveService);
  });

  afterEach(() => {
    service.stop();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("opens the shared input and names the note it hears", async () => {
    await service.start();

    expect(service.listening()).toBe(true);
    expect(service.deviceLabel()).toBe("USB Interface");

    jest.advanceTimersByTime(50);

    const reading = service.reading()!;
    expect(reading.note).toBe("A");
    expect(reading.octave).toBe(4);
    expect(Math.abs(reading.cents)).toBeLessThan(6);
  });

  it("says the microphone was blocked instead of listening silently", async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );

    await service.start();

    expect(service.listening()).toBe(false);
    expect(service.error()).toContain("blocked");
  });

  it("releases the input on stop", async () => {
    await service.start();
    jest.advanceTimersByTime(50);
    expect(service.reading()).not.toBeNull();

    service.stop();

    expect(service.listening()).toBe(false);
    expect(service.reading()).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });
});
