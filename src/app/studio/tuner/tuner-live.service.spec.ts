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
  let enumerateDevices: jest.Mock;
  const stopTrack = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    (window as any).AudioContext = MockAudioContext;

    getUserMedia = jest.fn().mockResolvedValue({
      getAudioTracks: () => [{ label: "USB Interface" }],
      getTracks: () => [{ stop: stopTrack }],
    });
    enumerateDevices = jest.fn().mockResolvedValue([
      { kind: "audioinput", label: "USB Interface" },
      { kind: "audiooutput", label: "Studio Monitors" },
    ]);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
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

  it("verifies the device without opening the microphone", async () => {
    const verification = await service.verifyDevice();

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(verification.supported).toBe(true);
    expect(verification.audioInputCount).toBe(1);
    expect(verification.audioInputLabels).toEqual(["USB Interface"]);
    expect(verification.listening).toBe(false);
    expect(verification.trackState).toBe("idle");
    expect(verification.reading).toBeNull();
  });

  it("reports a live stream, level and reading while listening", async () => {
    getUserMedia.mockResolvedValue({
      getAudioTracks: () => [
        { label: "USB Interface", readyState: "live", muted: false, addEventListener: jest.fn() },
      ],
      getTracks: () => [{ stop: stopTrack }],
    });
    await service.start();
    jest.advanceTimersByTime(50);

    const verification = await service.verifyDevice();

    expect(verification.listening).toBe(true);
    expect(verification.trackState).toBe("live");
    expect(verification.deviceLabel).toBe("USB Interface");
    expect(verification.level).toBeGreaterThan(0);
    expect(verification.reading?.note).toBe("A");
  });

  it("reports no inputs instead of inventing one", async () => {
    enumerateDevices.mockResolvedValue([]);

    const verification = await service.verifyDevice();

    expect(verification.audioInputCount).toBe(0);
    expect(verification.audioInputLabels).toEqual([]);
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
