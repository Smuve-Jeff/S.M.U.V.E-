import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import {
  MIDI_CLOCK_PPQN,
  MidiClockSyncService,
  MidiClockTracker,
} from "./midi-clock-sync.service";

const INTERVAL_FOR = (bpm: number) => 60000 / (bpm * MIDI_CLOCK_PPQN);

describe("MidiClockTracker", () => {
  it("locks only after enough pulses and then reports the tempo", () => {
    const tracker = new MidiClockTracker();
    const interval = INTERVAL_FOR(128);
    let estimate: number | null = null;

    for (let i = 0; i < MidiClockTracker.LOCK_PULSES - 1; i++) {
      estimate = tracker.pulse(i * interval);
    }
    expect(estimate).toBeNull();
    expect(tracker.isLocked()).toBe(false);

    estimate = tracker.pulse((MidiClockTracker.LOCK_PULSES - 1) * interval);
    expect(tracker.isLocked()).toBe(true);
    expect(estimate).toBeCloseTo(128, 1);
  });

  it("drops the window when the clock stalls", () => {
    const tracker = new MidiClockTracker();
    const interval = INTERVAL_FOR(120);
    for (let i = 0; i < 12; i++) tracker.pulse(i * interval);
    expect(tracker.isLocked()).toBe(true);

    expect(tracker.pulse(2000)).toBeNull();
    expect(tracker.isLocked()).toBe(false);
  });

  it("ignores non-monotonic timestamps", () => {
    const tracker = new MidiClockTracker();
    tracker.pulse(0);
    expect(tracker.pulse(0)).toBeNull();
  });
});

describe("MidiClockSyncService", () => {
  let service: MidiClockSyncService;
  let engine: {
    tempo: ReturnType<typeof signal<number>>;
    start: jest.Mock;
    stop: jest.Mock;
  };
  let input: { onmidimessage: ((event: { data: Uint8Array }) => void) | null };
  let requestMidi: jest.Mock;

  const send = (status: number) => input.onmidimessage?.({ data: new Uint8Array([status]) });

  beforeEach(() => {
    engine = { tempo: signal(124), start: jest.fn(), stop: jest.fn() };
    input = { onmidimessage: null };
    requestMidi = jest.fn().mockResolvedValue({
      inputs: new Map([["hw-1", input]]),
      outputs: new Map(),
      onstatechange: null,
    });
    Object.defineProperty(navigator, "requestMIDIAccess", {
      value: requestMidi,
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [{ provide: AudioEngineService, useValue: engine }],
    });
    service = TestBed.inject(MidiClockSyncService);
  });

  afterEach(() => {
    service.disable();
    delete (navigator as any).requestMIDIAccess;
  });

  it("reports an unsupported browser instead of pretending to sync", async () => {
    delete (navigator as any).requestMIDIAccess;
    await service.enable();

    expect(service.enabled()).toBe(false);
    expect(service.status()).toBe("unsupported");
    expect(service.statusLabel()).toBe("NO WEB MIDI");
  });

  it("locks to an incoming clock and follows its tempo", async () => {
    await service.enable();
    expect(service.enabled()).toBe(true);
    expect(service.status()).toBe("waiting");

    const interval = INTERVAL_FOR(132);
    let now = 0;
    jest.spyOn(performance, "now").mockImplementation(() => now);
    for (let i = 0; i < 20; i++) {
      now = i * interval;
      send(0xf8);
    }

    expect(service.status()).toBe("locked");
    expect(service.bpm()).toBeCloseTo(132, 0);
    expect(engine.tempo()).toBeCloseTo(132, 0);
  });

  it("drives transport start and stop from clock messages", async () => {
    await service.enable();

    send(0xfa);
    expect(engine.start).toHaveBeenCalled();
    send(0xfb);
    expect(engine.start).toHaveBeenCalledTimes(2);
    send(0xfc);
    expect(engine.stop).toHaveBeenCalled();
  });

  it("restores the studio tempo when sync is switched off", async () => {
    await service.enable();
    const interval = INTERVAL_FOR(90);
    let now = 0;
    jest.spyOn(performance, "now").mockImplementation(() => now);
    for (let i = 0; i < 20; i++) {
      now = i * interval;
      send(0xf8);
    }
    expect(engine.tempo()).not.toBe(124);

    service.disable();
    expect(engine.tempo()).toBe(124);
    expect(service.enabled()).toBe(false);
    expect(service.status()).toBe("off");
  });
});
