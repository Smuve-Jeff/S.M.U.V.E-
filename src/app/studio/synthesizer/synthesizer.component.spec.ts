import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { SynthesizerComponent } from "./synthesizer.component";
import { AudioEngineService } from "../../services/audio-engine.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { HapticService } from "../../services/haptic.service";
import { LoggingService } from "../../services/logging.service";

/**
 * The Synthesizer surface had no component spec, so a template or injection
 * regression could ship without any test touching it. These checks cover the
 * two behaviours that are easy to break and expensive to miss: loading a patch
 * (which must reach both the clip and the selected track) and the beginner
 * toggle's persistence.
 */
describe("SynthesizerComponent", () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const mockHaptic = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };
  const mockAudioEngine = {
    setSaturation: jest.fn(),
    setLfoParams: jest.fn(),
    triggerAttack: jest.fn(),
  };
  const selectedTrackId = signal<string | null>("track-1");
  const mockMusicManager = {
    selectedTrackId,
    updateSynthParams: jest.fn(),
  };

  beforeEach(async () => {
    localStorage.clear();
    jest.clearAllMocks();
    selectedTrackId.set("track-1");

    // jsdom has no canvas implementation; the component guards a null context,
    // but the call itself is noisy. Return a no-op 2D context instead.
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(new Proxy({}, { get: () => () => undefined }) as never);

    await TestBed.configureTestingModule({
      imports: [SynthesizerComponent],
      providers: [
        { provide: LoggingService, useValue: mockLogger },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: HapticService, useValue: mockHaptic },
      ],
    }).compileComponents();
  });

  it("creates and renders the oscillator surface", () => {
    const fixture = TestBed.createComponent(SynthesizerComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".synth-container")).not.toBeNull();
    expect(element.textContent).toContain("Neural Synth v5");
  });

  it("loads a patch into the live params, the clip and the selected track", () => {
    const fixture = TestBed.createComponent(SynthesizerComponent);
    const component = fixture.componentInstance;
    component.clip = { synthParams: {} } as never;

    component.loadPatch("bass");

    expect(component.synthParams.cutoff).toBe(800);
    expect(component.synthParams.oscillator).toBe("sawtooth");
    expect(component.clip?.synthParams).toEqual(
      expect.objectContaining({ cutoff: 800 }),
    );
    expect(mockMusicManager.updateSynthParams).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ cutoff: 800 }),
    );
  });

  it("persists the beginner toggle", () => {
    const fixture = TestBed.createComponent(SynthesizerComponent);
    const component = fixture.componentInstance;

    expect(component.isBeginner()).toBe(true);
    component.toggleBeginner();

    expect(component.isBeginner()).toBe(false);
    expect(localStorage.getItem("synth_beginner")).toBe("false");
  });
});
