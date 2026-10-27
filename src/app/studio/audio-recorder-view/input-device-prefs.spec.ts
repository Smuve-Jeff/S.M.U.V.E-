import {
  readStoredInputDeviceId,
  resolveInputDeviceId,
} from "./input-device-prefs";

/**
 * A remembered input is a preference, not a reference: choosing a device that
 * has since been unplugged must fall back to the system default rather than
 * constrain `getUserMedia` to something that is not there (which rejects as
 * `OverconstrainedError` and reads as "no microphone found").
 */
describe("input device preference", () => {
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
});
