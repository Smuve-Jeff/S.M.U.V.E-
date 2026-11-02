import { WasmInsertPresetService } from "./wasm-insert-preset.service";

const STORAGE_KEY = "smuve_wasm_insert_presets_v1";

describe("WasmInsertPresetService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it("exposes factory sounds for each built-in plugin without mixing plugins", () => {
    const service = new WasmInsertPresetService();

    const reverb = service.presetsFor("smuve.reverb.v2");
    const delayLike = service.presetsFor("smuve.unknown.v1");

    expect(reverb.map((preset) => preset.name)).toEqual([
      "Tight Room",
      "Plate Sheen",
      "Cathedral",
    ]);
    expect(reverb.every((preset) => preset.factory)).toBe(true);
    expect(reverb.every((preset) => preset.pluginId === "smuve.reverb.v2")).toBe(
      true,
    );
    expect(delayLike).toEqual([]);
    expect(service.presetsFor(undefined)).toEqual([]);
  });

  it("saves only finite numeric parameters and persists the preset", () => {
    const service = new WasmInsertPresetService();

    const preset = service.save("  My Air  ", "smuve.eq.mastering.v2", {
      air: 5,
      mid: -1,
      zero: 0,
      label: "not-a-number",
      infinite: Infinity,
      notANumber: Number.NaN,
    });

    expect(preset).toMatchObject({
      name: "My Air",
      pluginId: "smuve.eq.mastering.v2",
      factory: false,
      params: { air: 5, mid: -1, zero: 0 },
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([preset]);
  });

  it("rejects unnamed or unscoped presets and trims long names", () => {
    const service = new WasmInsertPresetService();

    expect(service.save("   ", "smuve.reverb.v2", { mix: 1 })).toBeNull();
    expect(service.save("Room", "", { mix: 1 })).toBeNull();
    expect(service.presets()).toEqual([]);

    const longName = service.save(
      "x".repeat(80),
      "smuve.reverb.v2",
      { mix: 0.5 },
    );
    expect(longName?.name).toHaveLength(48);
  });

  it("lists factory sounds before user saves, newest user preset first", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const service = new WasmInsertPresetService();
    const older = service.save("My Room", "smuve.reverb.v2", { mix: 0.2 })!;
    now.mockReturnValue(2_000);
    const newer = service.save("Bigger Room", "smuve.reverb.v2", { mix: 0.7 })!;
    service.save("Other Plugin", "smuve.saturation.v2", { amount: 0.4 });

    const presets = service.presetsFor("smuve.reverb.v2");

    expect(presets.slice(0, 3).every((preset) => preset.factory)).toBe(true);
    expect(presets.slice(3).map((preset) => preset.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it("removes user presets but refuses to remove a factory preset", () => {
    const service = new WasmInsertPresetService();
    const keep = service.save("Keep", "smuve.reverb.v2", { mix: 0.3 })!;
    const remove = service.save("Remove", "smuve.reverb.v2", { mix: 0.6 })!;
    const factoryId = service.presetsFor("smuve.reverb.v2")[0].id;

    service.remove(remove.id);
    service.remove(factoryId);

    expect(service.presets()).toEqual([keep]);
    expect(service.presetsFor("smuve.reverb.v2")[0].id).toBe(factoryId);
  });

  it("reloads user presets and ignores malformed persisted data", () => {
    const saved = new WasmInsertPresetService().save(
      "Saved",
      "smuve.saturation.v2",
      { amount: 0.3, mix: 0.8 },
    )!;

    expect(new WasmInsertPresetService().presets()).toEqual([saved]);

    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(new WasmInsertPresetService().presets()).toEqual([]);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "bad", name: "Missing plugin", factory: false, params: {} },
        {
          id: "good",
          name: "Keep",
          pluginId: "smuve.saturation.v2",
          factory: false,
          params: { amount: 0.2 },
          createdAt: 1,
        },
      ]),
    );

    expect(
      new WasmInsertPresetService()
        .presets()
        .map((preset) => preset.id),
    ).toEqual(["good"]);
  });
});
