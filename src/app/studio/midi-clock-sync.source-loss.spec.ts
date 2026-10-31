import { TestBed } from "@angular/core/testing";
import { MidiClockSyncService } from "./midi-clock-sync.service";
import { AudioEngineService } from "../services/audio-engine.service";

describe("MidiClockSyncService source loss", () => {
  let service: MidiClockSyncService;
  let tempoSet: jest.Mock;

  beforeEach(() => {
    tempoSet = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AudioEngineService, useValue: { tempo: { set: tempoSet } } },
      ],
    });
    service = TestBed.inject(MidiClockSyncService);
  });

  it("stops reporting a lock when the clock source disappears", () => {
    service.enabled.set(true);
    service.status.set("locked");
    service.bpm.set(128);
    (service as any).tempoBeforeSync = 120;
    // Device change leaves no inputs attached.
    (service as any).access = { inputs: new Map() };

    (service as any).attachInputs();

    expect(service.status()).toBe("waiting");
    expect(service.bpm()).toBeNull();
    // The artist's own tempo comes back instead of a dead clock's.
    expect(tempoSet).toHaveBeenCalledWith(120);
  });

  it("reports off rather than waiting when sync was never enabled", () => {
    service.status.set("locked");
    service.bpm.set(90);

    (service as any).handleSourceLost();

    expect(service.status()).toBe("off");
    expect(service.bpm()).toBeNull();
  });
});
