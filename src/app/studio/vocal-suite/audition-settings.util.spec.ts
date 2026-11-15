import {
  AUDITION_PREFS_KEY,
  DEFAULT_AUDITION_PREFS,
  loadAuditionPrefs,
  saveAuditionPrefs,
} from "./audition-settings.util";

function makeStorage(initial?: string): Storage {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(AUDITION_PREFS_KEY, initial);
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  } as Storage;
}

describe("audition settings", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(loadAuditionPrefs(makeStorage())).toEqual(DEFAULT_AUDITION_PREFS);
  });

  it("round-trips the artist's choices", () => {
    const storage = makeStorage();

    saveAuditionPrefs({ inMix: false, loop: true, preRollBars: 2 }, storage);

    expect(loadAuditionPrefs(storage)).toEqual({
      inMix: false,
      loop: true,
      preRollBars: 2,
    });
  });

  it("clamps a stored lead-in outside the offered range", () => {
    const storage = makeStorage(
      JSON.stringify({ inMix: true, loop: false, preRollBars: 9 }),
    );

    expect(loadAuditionPrefs(storage).preRollBars).toBe(2);
  });

  it("falls back to the defaults when the stored value is corrupt", () => {
    const storage = makeStorage("{not json");

    expect(loadAuditionPrefs(storage)).toEqual(DEFAULT_AUDITION_PREFS);
  });

  it("does nothing when the host has no storage", () => {
    expect(loadAuditionPrefs(null)).toEqual(DEFAULT_AUDITION_PREFS);
    expect(() =>
      saveAuditionPrefs({ inMix: true, loop: false, preRollBars: 1 }, null),
    ).not.toThrow();
  });
});
