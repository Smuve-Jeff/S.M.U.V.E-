import { EffectPresetService } from "./effect-preset.service";

const STORAGE_KEY = "smuve_fx_insert_presets_v1";

describe("EffectPresetService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it("saves a named preset with only finite numeric parameters", () => {
    const service = new EffectPresetService();

    const preset = service.save("  Wide Hall  ", "Reverb", {
      wet: 72,
      decay: 3.5,
      zero: 0,
      label: "not-a-number",
      missing: undefined,
      infinite: Infinity,
      notANumber: Number.NaN,
    });

    expect(preset).toMatchObject({
      name: "Wide Hall",
      type: "Reverb",
      params: { wet: 72, decay: 3.5, zero: 0 },
    });
    expect(service.presets()).toEqual([preset]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([preset]);
  });

  it("rejects an unnamed or untyped preset", () => {
    const service = new EffectPresetService();

    expect(service.save("   ", "Reverb", { wet: 50 })).toBeNull();
    expect(service.save("Hall", "", { wet: 50 })).toBeNull();
    expect(service.presets()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("trims a long name to the stored limit", () => {
    const service = new EffectPresetService();

    const preset = service.save("x".repeat(80), "Delay", { wet: 10 });

    expect(preset?.name).toHaveLength(48);
  });

  it("browses only presets for the requested effect type, newest first", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const service = new EffectPresetService();
    const older = service.save("Tight room", "Reverb", { wet: 20 })!;
    now.mockReturnValue(2_000);
    const newer = service.save("Cathedral", "Reverb", { wet: 90 })!;
    now.mockReturnValue(3_000);
    service.save("Slapback", "Delay", { wet: 30 });

    expect(service.presetsFor("Reverb")).toEqual([newer, older]);
    expect(service.presetsFor("Delay").map((preset) => preset.name)).toEqual([
      "Slapback",
    ]);
    expect(service.presetsFor(undefined)).toEqual([]);
  });

  it("deletes only the requested preset and persists the removal", () => {
    const service = new EffectPresetService();
    const keep = service.save("Keep", "Compressor", { wet: 40 })!;
    const remove = service.save("Remove", "Compressor", { wet: 60 })!;

    service.remove(remove.id);

    expect(service.presets()).toEqual([keep]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([keep]);
  });

  it("reloads saved presets from storage", () => {
    const preset = new EffectPresetService().save("Saved", "EQ", {
      low: -2,
      high: 3,
    })!;

    const reloaded = new EffectPresetService();

    expect(reloaded.presets()).toEqual([preset]);
  });

  it("ignores malformed persisted data instead of breaking the browser", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    expect(new EffectPresetService().presets()).toEqual([]);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "bad", name: "Missing type", params: {}, createdAt: 1 },
        {
          id: "good",
          name: "Keep",
          type: "Reverb",
          params: { wet: 50 },
          createdAt: 1,
        },
      ]),
    );

    expect(new EffectPresetService().presets().map((preset) => preset.id)).toEqual(
      ["good"],
    );
  });
});
