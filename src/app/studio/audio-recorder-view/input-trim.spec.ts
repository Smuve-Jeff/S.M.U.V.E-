import {
  INPUT_TRIM_BY_DEVICE_KEY,
  INPUT_TRIM_MAX_DB,
  INPUT_TRIM_MIN_DB,
  clampInputTrimDb,
  inputTrimGain,
  readInputTrimDbForDevice,
  readStoredInputTrimForDevice,
  rememberInputTrimDbForDevice,
} from "./input-trim";

describe("input trim", () => {
  it("clamps and rounds to the supported range", () => {
    expect(clampInputTrimDb(99)).toBe(INPUT_TRIM_MAX_DB);
    expect(clampInputTrimDb(-99)).toBe(INPUT_TRIM_MIN_DB);
    expect(clampInputTrimDb(12.6)).toBe(13);
    expect(clampInputTrimDb(Number.NaN)).toBe(0);
  });

  it("turns decibels into the linear gain the capture graph needs", () => {
    expect(inputTrimGain(0)).toBeCloseTo(1, 6);
    expect(inputTrimGain(6)).toBeCloseTo(1.995, 3);
    expect(inputTrimGain(-6)).toBeCloseTo(0.501, 3);
    expect(inputTrimGain(99)).toBeCloseTo(inputTrimGain(INPUT_TRIM_MAX_DB), 6);
  });
});

describe("input trim persistence", () => {
  beforeEach(() => localStorage.clear());

  it("remembers a separate trim for each input device", () => {
    expect(readInputTrimDbForDevice("mic-a")).toBe(0);

    rememberInputTrimDbForDevice("mic-a", 9);
    rememberInputTrimDbForDevice("mic-b", -3);

    expect(readInputTrimDbForDevice("mic-a")).toBe(9);
    expect(readInputTrimDbForDevice("mic-b")).toBe(-3);
    expect(readInputTrimDbForDevice("mic-c")).toBe(0);
  });

  it("stores a trim for the system default and clears it at 0 dB", () => {
    rememberInputTrimDbForDevice(null, -5);
    expect(readInputTrimDbForDevice(null)).toBe(-5);

    rememberInputTrimDbForDevice("mic-a", 0);
    expect(readInputTrimDbForDevice("mic-a")).toBe(0);
    expect(localStorage.getItem(INPUT_TRIM_BY_DEVICE_KEY)).toContain(
      "__default__",
    );

    rememberInputTrimDbForDevice(null, 0);
    expect(localStorage.getItem(INPUT_TRIM_BY_DEVICE_KEY)).toBeNull();
  });

  it("drops corrupt records and clamps stored out-of-range values", () => {
    expect(readStoredInputTrimForDevice("{not json", "mic-a")).toBe(0);
    expect(
      readStoredInputTrimForDevice(
        '{"mic-a":999,"mic-b":"loud","mic-c":-7}',
        "mic-a",
      ),
    ).toBe(INPUT_TRIM_MAX_DB);
    expect(
      readStoredInputTrimForDevice(
        '{"mic-a":999,"mic-b":"loud","mic-c":-7}',
        "mic-b",
      ),
    ).toBe(0);
    expect(
      readStoredInputTrimForDevice(
        '{"mic-a":999,"mic-b":"loud","mic-c":-7}',
        "mic-c",
      ),
    ).toBe(-7);
  });
});
