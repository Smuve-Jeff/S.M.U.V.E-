import {
  copyPatternName,
  countClipsUsingPattern,
  isSamePattern,
  nextPatternName,
  planPatternDelete,
} from "./pattern-slots.util";

describe("pattern-slots util", () => {
  it("names the next pattern from the highest number, not the slot count", () => {
    expect(nextPatternName([])).toBe("Pattern 1");
    expect(
      nextPatternName([
        { id: "a", name: "Pattern 1" },
        { id: "b", name: "Pattern 3" },
      ]),
    ).toBe("Pattern 4");
    // Deleting Pattern 2 must not make the next name collide with Pattern 3.
    expect(
      nextPatternName([
        { id: "a", name: "Pattern 1" },
        { id: "b", name: "Pattern 3" },
      ]),
    ).not.toBe("Pattern 3");
  });

  it("suffixes copies without colliding", () => {
    const slots = [{ id: "a", name: "Verse" }];
    expect(copyPatternName("Verse", slots)).toBe("Verse copy");
    expect(
      copyPatternName("Verse", [...slots, { id: "b", name: "Verse copy" }]),
    ).toBe("Verse copy 2");
  });

  it("counts the clips that play a pattern", () => {
    const clips = [
      { patternSlotId: "slot-0" },
      { patternSlotId: "slot-1" },
      { patternSlotId: "slot-1" },
      {},
    ];
    expect(countClipsUsingPattern(clips, "slot-1")).toBe(2);
    expect(countClipsUsingPattern(clips, "slot-0")).toBe(1);
    expect(countClipsUsingPattern(clips, "slot-9")).toBe(0);
    expect(countClipsUsingPattern(undefined, "slot-0")).toBe(0);
  });

  it("refuses to delete the last remaining pattern", () => {
    const plan = planPatternDelete([{ id: "a", name: "Only" }], [], "a", "a");
    expect(plan.error).toMatch(/at least one pattern/i);
    expect(plan.slots).toHaveLength(1);
  });

  it("refuses to delete an unknown slot", () => {
    const plan = planPatternDelete([{ id: "a", name: "One" }], [], "a", "zzz");
    expect(plan.error).toBeTruthy();
    expect(plan.fallbackSlotId).toBe("a");
  });

  it("re-points clips at the surviving slot when the active pattern goes", () => {
    const slots = [
      { id: "a", name: "One" },
      { id: "b", name: "Two" },
    ];
    const clips = [{ patternSlotId: "b" }, { patternSlotId: "b" }, {}];
    const plan = planPatternDelete(slots, clips, "b", "b");
    expect(plan.error).toBeUndefined();
    expect(plan.slots.map((s) => s.id)).toEqual(["a"]);
    expect(plan.fallbackSlotId).toBe("a");
    expect(plan.repointedClips).toBe(2);
  });

  it("keeps the active pattern when a different slot is deleted", () => {
    const slots = [
      { id: "a", name: "One" },
      { id: "b", name: "Two" },
    ];
    const plan = planPatternDelete(slots, [{ patternSlotId: "a" }], "a", "b");
    expect(plan.fallbackSlotId).toBe("a");
    expect(plan.repointedClips).toBe(0);
  });

  it("only reports a snapshot as duplicate when steps and notes match", () => {
    const base = { steps: [true, false], notes: [{ id: "n1" }] };
    expect(isSamePattern(base, { ...base, steps: [true, false] })).toBe(true);
    expect(isSamePattern(base, { ...base, steps: [false, false] })).toBe(false);
    expect(
      isSamePattern(base, { ...base, notes: [{ id: "n2" }] }),
    ).toBe(false);
    expect(isSamePattern(base, null)).toBe(false);
  });
});
