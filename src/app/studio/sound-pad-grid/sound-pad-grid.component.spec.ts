import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AudioEngineService } from "../../services/audio-engine.service";
import { HapticService } from "../../services/haptic.service";
import { InstrumentsService } from "../../services/instruments.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { SnackbarService } from "../../services/snackbar.service";
import { SoundPadGridComponent } from "./sound-pad-grid.component";

describe("SoundPadGridComponent", () => {
  const audition = jest.fn().mockResolvedValue(undefined);
  const setInstrument = jest.fn();
  const resume = jest.fn();
  const presets = [
    { id: "preset-1", name: "Kick" },
    { id: "preset-2", name: "Snare" },
  ];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [SoundPadGridComponent],
      providers: [
        {
          provide: InstrumentsService,
          useValue: { getPresets: () => presets, audition },
        },
        {
          provide: MusicManagerService,
          useValue: {
            selectedTrackId: signal("track-1"),
            setInstrument,
          },
        },
        {
          provide: AudioEngineService,
          useValue: { resume, tempo: signal(120) },
        },
        { provide: HapticService, useValue: { light: jest.fn(), medium: jest.fn() } },
        {
          provide: SnackbarService,
          useValue: { info: jest.fn(), success: jest.fn() },
        },
      ],
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("auditions the labelled voice and pins it to the selected track", () => {
    const fixture = TestBed.createComponent(SoundPadGridComponent);
    const component = fixture.componentInstance;

    expect(component.pads()).toHaveLength(16);
    component.triggerPad(0);

    expect(audition).toHaveBeenCalledWith("trap-kit-elite", 36);
    expect(setInstrument).toHaveBeenCalledWith("track-1", "trap-kit-elite");
    expect(component.pads()[0].active).toBe(true);
    jest.advanceTimersByTime(250);
    expect(component.pads()[0].active).toBe(false);
  });

  it("reassigns a pad to another preset and clears the bank", () => {
    const fixture = TestBed.createComponent(SoundPadGridComponent);
    const component = fixture.componentInstance;

    component.reassign(0, "preset-2");
    expect(component.pads()[0].presetId).toBe("preset-2");
    expect(component.pads()[0].label).toBe("SNARE");

    component.clearAll();
    expect(component.pads().every((pad) => pad.presetId === null)).toBe(true);
    expect(component.loadedCount()).toBe(0);
    expect(component.reassignIndex()).toBeNull();
  });
});
