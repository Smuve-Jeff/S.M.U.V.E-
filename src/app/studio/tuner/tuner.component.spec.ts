import { TestBed } from "@angular/core/testing";

import { TunerComponent } from "./tuner.component";

/**
 * The tuner is mostly a loop around `detectPitch`, so these tests pin the loop
 * rather than re-testing the DSP: a 440 Hz frame must read A4, silence must not
 * invent a note, and a blocked microphone must say so instead of showing an
 * empty meter forever.
 */

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

describe("TunerComponent", () => {
  let component: TunerComponent;
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

    const fixture = TestBed.configureTestingModule({
      imports: [TunerComponent],
    }).createComponent(TunerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("names the note it hears and eases the needle to centre", async () => {
    await component.start();

    expect(component.listening()).toBe(true);
    expect(component.deviceLabel()).toBe("USB Interface");
    expect(component.reading()).toBeNull();

    jest.advanceTimersByTime(50);

    const reading = component.reading()!;
    expect(reading.note).toBe("A");
    expect(reading.octave).toBe(4);
    expect(Math.abs(reading.cents)).toBeLessThan(6);
    expect(reading.frequency).toBeGreaterThan(430);
    expect(reading.frequency).toBeLessThan(450);
    expect(component.needle()).toBeGreaterThan(40);
    expect(component.needle()).toBeLessThan(60);
  });

  it("releases the input and clears the readout on stop", async () => {
    await component.start();
    jest.advanceTimersByTime(50);
    expect(component.reading()).not.toBeNull();

    component.stop();

    expect(component.listening()).toBe(false);
    expect(component.reading()).toBeNull();
    expect(component.level()).toBe(0);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("says the microphone was blocked instead of listening to nothing", async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );

    await component.start();

    expect(component.listening()).toBe(false);
    expect(component.error()).toContain("blocked");
    expect(component.reading()).toBeNull();
  });

  it("reports that the input is opening instead of looking idle", async () => {
    getUserMedia.mockReturnValue(new Promise(() => undefined));

    void component.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.starting()).toBe(true);
    expect(component.listening()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it("falls back to the default input when the remembered one is gone", async () => {
    localStorage.setItem("smuve_studio_input_device", "unplugged");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: jest
          .fn()
          .mockResolvedValue([{ kind: "audioinput", deviceId: "other" }]),
      },
    });

    await component.start();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(
      (getUserMedia.mock.calls[0][0] as MediaStreamConstraints).audio,
    ).toMatchObject({ deviceId: undefined });
  });

  it("toggles between listening and idle", async () => {
    await component.toggle();
    expect(component.listening()).toBe(true);

    await component.toggle();
    expect(component.listening()).toBe(false);
  });
});
