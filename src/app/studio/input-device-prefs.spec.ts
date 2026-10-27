import {
  preferredConnectedInputDeviceId,
  readPreferredInputDeviceId,
  readStoredInputDeviceId,
  rememberPreferredInputDevice,
  resolveInputDeviceId,
} from "./input-device-prefs";

/**
 * A remembered input is a preference, not a reference: choosing a device that
 * has since been unplugged must fall back to the system default rather than
 * constrain `getUserMedia` to something that is not there (which rejects as
 * `OverconstrainedError` and reads as "no microphone found").
 */
describe("input device preference", () => {
  const originalMediaDevices = navigator.mediaDevices;

  function setAudioInputs(ids: string[]): void {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: {
        enumerateDevices: jest.fn().mockResolvedValue(
          ids.map((deviceId) => ({ kind: "audioinput", deviceId })),
        ),
      },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    setAudioInputs(["mic-a", "mic-b"]);
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: originalMediaDevices,
    });
    localStorage.clear();
  });

  it("ignores empty and non-string records", () => {
    expect(readStoredInputDeviceId(null)).toBeNull();
    expect(readStoredInputDeviceId(undefined)).toBeNull();
    expect(readStoredInputDeviceId("")).toBeNull();
    expect(readStoredInputDeviceId("   ")).toBeNull();
    expect(readStoredInputDeviceId("  mic-a  ")).toBe("mic-a");
  });

  it("selects a remembered device only while it is connected", () => {
    expect(resolveInputDeviceId("mic-b", ["mic-a", "mic-b"])).toBe("mic-b");
    expect(resolveInputDeviceId("mic-b", ["mic-a"])).toBeNull();
    expect(resolveInputDeviceId("mic-b", [])).toBeNull();
    expect(resolveInputDeviceId(null, ["mic-a"])).toBeNull();
  });

  it("remembers a pick and clears it for the system default", () => {
    expect(readPreferredInputDeviceId()).toBeNull();

    rememberPreferredInputDevice("mic-b");
    expect(readPreferredInputDeviceId()).toBe("mic-b");
    expect(localStorage.getItem("smuve_studio_input_device")).toBe("mic-b");

    rememberPreferredInputDevice(null);
    expect(readPreferredInputDeviceId()).toBeNull();
  });

  it("resolves the remembered input for every capture path", async () => {
    rememberPreferredInputDevice("mic-b");
    await expect(preferredConnectedInputDeviceId()).resolves.toBe("mic-b");

    // Unplugged since the choice was made: the call must not pin it.
    setAudioInputs(["mic-a"]);
    await expect(preferredConnectedInputDeviceId()).resolves.toBeNull();
  });

  it("falls back to the default when nothing is remembered", async () => {
    await expect(preferredConnectedInputDeviceId()).resolves.toBeNull();
  });

  it("survives locked storage and a browser that cannot enumerate", async () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage is locked");
      });

    expect(readPreferredInputDeviceId()).toBeNull();
    await expect(preferredConnectedInputDeviceId()).resolves.toBeNull();
    getItem.mockRestore();

    rememberPreferredInputDevice("mic-b");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    await expect(preferredConnectedInputDeviceId()).resolves.toBeNull();
  });
});
