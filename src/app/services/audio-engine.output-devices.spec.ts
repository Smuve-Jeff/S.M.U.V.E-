import { TestBed } from "@angular/core/testing";
import { AudioEngineService } from "./audio-engine.service";

describe("AudioEngineService output device tracking", () => {
  let engine: AudioEngineService;
  let enumerateDevices: jest.Mock;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AudioEngineService] });
    engine = TestBed.inject(AudioEngineService);
    enumerateDevices = jest.fn().mockResolvedValue([
      { kind: "audiooutput", deviceId: "speakers", label: "Speakers" },
    ]);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener: jest.fn(),
      },
    });
    (engine.ctx as any).setSinkId = jest.fn().mockResolvedValue(undefined);
  });

  it("returns to the system default when the chosen sink disappears", async () => {
    engine.selectedOutputDeviceId.set("usb-dac");
    engine.outputDeviceName.set("USB DAC");

    await engine.refreshOutputDevices();

    expect((engine.ctx as any).setSinkId).toHaveBeenCalledWith("");
    expect(engine.selectedOutputDeviceId()).toBe("");
    expect(engine.outputDeviceName()).toBe("System Default");
    expect(engine.externalOutputActive()).toBe(false);
  });

  it("keeps a sink that is still enumerated", async () => {
    enumerateDevices.mockResolvedValueOnce([
      { kind: "audiooutput", deviceId: "usb-dac", label: "USB DAC" },
    ]);
    engine.selectedOutputDeviceId.set("usb-dac");
    engine.outputDeviceName.set("USB DAC");

    await engine.refreshOutputDevices();

    expect(engine.selectedOutputDeviceId()).toBe("usb-dac");
    expect(engine.outputDeviceName()).toBe("USB DAC");
  });

  it("reports sink support from the active AudioContext", () => {
    expect(engine.supportsSinkId()).toBe(true);
    const original = (engine.ctx as any).setSinkId;
    delete (engine.ctx as any).setSinkId;
    expect(engine.supportsSinkId()).toBe(false);
    (engine.ctx as any).setSinkId = original;
  });

  it("applies a sink through the AudioContext and records its name", async () => {
    const ok = await engine.setOutputDevice("speakers");
    expect(ok).toBe(true);
    expect((engine.ctx as any).setSinkId).toHaveBeenCalledWith("speakers");
    expect(engine.selectedOutputDeviceId()).toBe("speakers");
    expect(engine.outputDeviceName()).toBe("Speakers");
  });

  it("falls back to the system default when a sink switch fails", async () => {
    (engine.ctx as any).setSinkId
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValueOnce(undefined);
    const ok = await engine.setOutputDevice("usb-dac");
    expect(ok).toBe(false);
    expect((engine.ctx as any).setSinkId).toHaveBeenLastCalledWith("");
    expect(engine.selectedOutputDeviceId()).toBe("");
    expect(engine.outputDeviceName()).toBe("System Default");
  });
});
