import {
  parseTransportPrefs,
  serializeTransportPrefs,
  TransportPrefs,
} from "./transport-prefs";

/**
 * The stored transport record is read inside `AudioEngineService`'s constructor,
 * so anything that throws there takes the whole audio graph down with it. These
 * pin the two rules that matter: a corrupt record degrades to the defaults, and
 * a partial one never half-applies.
 */
describe("transport prefs", () => {
  const full: TransportPrefs = {
    loop: true,
    metronome: true,
    loopStart: 8,
    loopEnd: 24,
  };

  it("round-trips the current state", () => {
    expect(parseTransportPrefs(serializeTransportPrefs(full))).toEqual(full);
    expect(
      parseTransportPrefs(
        serializeTransportPrefs({
          loop: false,
          metronome: false,
          loopStart: null,
          loopEnd: null,
        }),
      ),
    ).toEqual({ loop: false, metronome: false });
  });

  it("returns nothing for absent or unreadable records", () => {
    expect(parseTransportPrefs(null)).toEqual({});
    expect(parseTransportPrefs("")).toEqual({});
    expect(parseTransportPrefs("{not json")).toEqual({});
    expect(parseTransportPrefs("42")).toEqual({});
    expect(parseTransportPrefs("null")).toEqual({});
  });

  it("keeps the fields that are valid and drops the rest", () => {
    expect(
      parseTransportPrefs(JSON.stringify({ loop: "yes", metronome: true })),
    ).toEqual({ metronome: true });
    expect(
      parseTransportPrefs(JSON.stringify({ loop: true, metronome: 1 })),
    ).toEqual({ loop: true });
  });

  it("treats the loop region as all-or-nothing", () => {
    // A start with no end is not a region: keeping one half would leave the
    // transport looping something nobody set.
    expect(
      parseTransportPrefs(JSON.stringify({ loopStart: 4, loopEnd: null })),
    ).toEqual({});
    expect(
      parseTransportPrefs(JSON.stringify({ loopStart: 12, loopEnd: 12 })),
    ).toEqual({});
    expect(
      parseTransportPrefs(JSON.stringify({ loopStart: 20, loopEnd: 4 })),
    ).toEqual({});
    expect(
      parseTransportPrefs(JSON.stringify({ loopStart: -2, loopEnd: 8 })),
    ).toEqual({});
    expect(parseTransportPrefs(JSON.stringify({ loopEnd: 8 }))).toEqual({});
  });

  it("normalises a fractional region to whole steps", () => {
    expect(
      parseTransportPrefs(JSON.stringify({ loopStart: 3.7, loopEnd: 9.2 })),
    ).toEqual({ loopStart: 3, loopEnd: 9 });
  });
});
