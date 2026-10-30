import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { MasteringSuiteComponent } from "./mastering-suite.component";
import { AudioEngineService } from "../../services/audio-engine.service";
import { ExportService } from "../../services/export.service";
import { AiService } from "../../services/ai.service";
import { UIService } from "../../services/ui.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";
import { AiMixAssistantService } from "../effects/ai-mix-assistant.service";
import { PluginStoreService } from "../../services/plugin-store.service";
import { MusicManagerService } from "../../services/music-manager.service";

/** BS.1770-style stats `ExportService.analyzeBuffer` returns. */
const refStats = {
  peakDb: -0.2,
  truePeakDb: -0.1,
  rmsDb: -16,
  lufs: -14,
  lra: 6.5,
  correlation: 1,
  durationSec: 180,
  sampleCount: 180 * 44100,
};

function fakeFile(name = "ref.wav"): File {
  return {
    name,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File;
}

function fakeInputEvent(file: File): Event {
  const input: any = { files: [file], value: "C:\\fake\\ref.wav" };
  return { target: input } as unknown as Event;
}

describe("MasteringSuite reference A/B", () => {
  let component: MasteringSuiteComponent;
  let engineMock: any;
  let analyzeBuffer: jest.Mock;
  let snack: any;
  let haptic: any;

  beforeEach(() => {
    engineMock = {
      ctx: {
        decodeAudioData: jest
          .fn()
          .mockResolvedValue({ duration: 180 } as unknown as AudioBuffer),
      },
      outputLufs: signal(-12),
      outputTruePeak: signal(-1),
      outputLra: signal(4),
      outputCorrelation: signal(1),
      auditionPlaying: signal(false),
      auditionProgress: signal(0),
      auditionDuration: signal(0),
      playAudition: jest.fn(),
      stopAudition: jest.fn(),
      setMasterMakeupDb: jest.fn(),
      getMasterMakeupDb: jest.fn(() => 0),
      setMasteringTargets: jest.fn(),
      getMasteringTargets: jest.fn(() => ({ lufs: -14, truePeak: -1 })),
    };
    analyzeBuffer = jest.fn().mockReturnValue(refStats);
    snack = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
    haptic = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };

    TestBed.configureTestingModule({
      imports: [MasteringSuiteComponent],
      providers: [
        { provide: AudioEngineService, useValue: engineMock },
        {
          provide: ExportService,
          useValue: { analyzeBuffer },
        },
        { provide: AiService, useValue: {} },
        { provide: UIService, useValue: {} },
        { provide: HapticService, useValue: haptic },
        { provide: SnackbarService, useValue: snack },
        { provide: AiMixAssistantService, useValue: {} },
        { provide: PluginStoreService, useValue: {} },
        { provide: MusicManagerService, useValue: {} },
      ],
    });
    component = TestBed.createComponent(MasteringSuiteComponent).componentInstance;
  });

  it("decodes and measures a picked reference with the shared meter", async () => {
    await component.onReferenceChosen(fakeInputEvent(fakeFile()));

    expect(component.isReferenceLoaded()).toBe(true);
    expect(component.referenceName()).toBe("ref.wav");
    expect(component.referenceStats()).toEqual({
      peakDb: -0.2,
      truePeakDb: -0.1,
      rmsDb: -16,
      lufs: -14,
      lra: 6.5,
      durationSec: 180,
    });
    expect(analyzeBuffer).toHaveBeenCalledTimes(1);
    expect(snack.success).toHaveBeenCalled();
    expect(component.referenceBusy()).toBe(false);
  });

  it("clears stale state and reports when decoding fails", async () => {
    engineMock.ctx.decodeAudioData.mockRejectedValueOnce(
      new Error("Not a wave file"),
    );
    await component.onReferenceChosen(fakeInputEvent(fakeFile("broken.mp3")));

    expect(component.isReferenceLoaded()).toBe(false);
    expect(component.referenceName()).toBeNull();
    expect(snack.error).toHaveBeenCalledWith("Reference import failed · not a wave file");
    expect(component.referenceBusy()).toBe(false);
  });

  it("reports the loudness delta from the same meter that grades the master", async () => {
    expect(component.referenceDeltaDb()).toBeNull(); // no reference yet

    await component.onReferenceChosen(fakeInputEvent(fakeFile()));

    // Reference −14 LUFS, master measured −12 → the master is 2 dB too loud.
    expect(component.referenceDeltaDb()).toBe(-2);
    engineMock.outputLufs.set(-17);
    expect(component.referenceDeltaDb()).toBe(3);
  });

  it("matches loudness through the master makeup stage and clears it on reset", async () => {
    await component.onReferenceChosen(fakeInputEvent(fakeFile()));

    // Master −12, reference −14 → apply −2 dB.
    component.matchReferenceLoudness();
    expect(engineMock.setMasterMakeupDb).toHaveBeenCalledWith(-2);

    component.clearReference();
    expect(engineMock.setMasterMakeupDb).toHaveBeenLastCalledWith(0);
    expect(component.isReferenceLoaded()).toBe(false);
    expect(component.referenceName()).toBeNull();
  });

  it("refuses to match against an unmeasured master", async () => {
    engineMock.outputLufs.set(-70); // meter has not rolled yet
    await component.onReferenceChosen(fakeInputEvent(fakeFile()));

    component.matchReferenceLoudness();
    expect(engineMock.setMasterMakeupDb).not.toHaveBeenCalled();
    expect(snack.info).toHaveBeenCalledWith(expect.stringContaining("Roll the transport"));
  });

  it("A/B auditions the reference through the existing audition path", async () => {
    await component.onReferenceChosen(fakeInputEvent(fakeFile()));
    component.toggleReferenceAudition();
    expect(engineMock.playAudition).toHaveBeenCalledTimes(1);
    expect(engineMock.playAudition.mock.calls[0][0]).toBeTruthy();

    engineMock.auditionPlaying.set(true);
    component.toggleReferenceAudition();
    expect(engineMock.stopAudition).toHaveBeenCalledTimes(1);
  });

  describe("delivery targets", () => {
    it("options cover the platforms that bill masters against LUFS", () => {
      expect(
        component.deliveryTargets.map((t) => [t.id, t.targetLufs, t.ceilingDbtp]),
      ).toEqual([
        ["spotify", -14, -1],
        ["apple", -16, -1],
        ["youtube", -14, -1],
        ["podcast", -16, -1.5],
        ["club", -9, -0.3],
      ]);
    });

    it("conforms the target, the ceiling, and highlights the chip", () => {
      component.applyDeliveryTarget("apple");

      expect(component.targetLufs()).toBe(-16);
      expect(component.safeCeiling()).toBe(-1);
      expect(engineMock.setMasteringTargets).toHaveBeenCalledWith({
        lufs: -16,
        truePeak: -1,
      });
      expect(component.activeDeliveryTargetId()).toBe("apple");
      // platform spec beats a genre preset
      expect(component.activePresetId()).toBeNull();
    });

    it("applies the measured shortfall as makeup once a render exists", () => {
      component.renderedLufs.set(-11.4);
      component.applyDeliveryTarget("spotify"); // −14 target

      expect(engineMock.setMasterMakeupDb).toHaveBeenCalledWith(-2.6);
      expect(snack.success).toHaveBeenCalledWith(
        expect.stringContaining("makeup -2.6 dB"),
      );
    });

    it("asks for a render instead of guessing when nothing is measured", () => {
      component.applyDeliveryTarget("club");
      expect(engineMock.setMasterMakeupDb).not.toHaveBeenCalled();
      expect(snack.success).toHaveBeenCalledWith(
        expect.stringContaining("render to measure the delta"),
      );
    });

    it("ignores unknown ids silently (defence against stale bindings)", () => {
      component.applyDeliveryTarget("napster");
      expect(engineMock.setMasteringTargets).not.toHaveBeenCalled();
      expect(component.activeDeliveryTargetId()).toBeNull();
    });
  });

  describe("mastering presets", () => {
    const bandGains = () => component.bands().map((b) => b.gain);
    const preset = (id: string) =>
      component.presets.find((p) => p.id === id)!;

    it("applies a preset as an absolute shape over the pre-preset EQ", () => {
      component.applyPreset(preset("streaming"));

      // Initial bands: -1.2 / -0.5 / 0 / +0.8 / +1.5 dB.
      expect(bandGains()).toEqual([-1.8, -0.8, 0, 1.2, 2.1]);
      expect(component.targetLufs()).toBe(-14);
      expect(component.safeCeiling()).toBe(-1);
      expect(component.activePresetId()).toBe("streaming");
    });

    it("is idempotent when the same preset is tapped again", () => {
      component.applyPreset(preset("streaming"));
      const once = bandGains();

      component.applyPreset(preset("streaming"));

      expect(bandGains()).toEqual(once);
    });

    it("switches presets without stacking the previous shape", () => {
      component.applyPreset(preset("streaming"));
      component.applyPreset(preset("club"));

      // Club deltas over the same anchor, not over the streaming result.
      expect(bandGains()).toEqual([-0.2, -0.5, -0.4, 1.6, 2.7]);
      expect(component.activePresetId()).toBe("club");
    });

    it("resets the EQ to the pre-preset anchor", () => {
      component.applyPreset(preset("club"));
      expect(component.presetEqActive()).toBe(true);

      component.resetPresetEq();

      expect(bandGains()).toEqual([-1.2, -0.5, 0, 0.8, 1.5]);
      expect(component.activePresetId()).toBeNull();
      expect(component.presetEqActive()).toBe(false);
      expect(snack.info).toHaveBeenCalledWith(
        "Mastering EQ reset to its pre-preset shape",
      );
    });

    it("does nothing when no preset has shaped the EQ", () => {
      component.resetPresetEq();

      expect(bandGains()).toEqual([-1.2, -0.5, 0, 0.8, 1.5]);
      expect(snack.info).not.toHaveBeenCalled();
    });
  });
});
