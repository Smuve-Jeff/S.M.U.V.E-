import { EXPIRY_WARNING_HOURS, expiryLabel, keepLabel } from "./retention-warning";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const now = Date.parse("2026-11-16T12:00:00.000Z");
const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();

describe("retention warnings", () => {
  it("says nothing while a show is comfortably inside its window", () => {
    expect(expiryLabel(at(7 * HOUR), now)).toBe("");
    expect(expiryLabel(at(24 * HOUR), now)).toBe("");
    expect(expiryLabel(at(0), now)).toBe("");
    expect(expiryLabel(at(-HOUR), now)).toBe("");
  });

  it("counts down in hours, then in minutes for the last one", () => {
    expect(expiryLabel(at(EXPIRY_WARNING_HOURS * HOUR), now)).toBe("IN 6H");
    expect(expiryLabel(at(4 * HOUR), now)).toBe("IN 4H");
    expect(expiryLabel(at(2 * HOUR + 10 * MINUTE), now)).toBe("IN 2H");
    expect(expiryLabel(at(45 * MINUTE), now)).toBe("IN 45M");
    expect(expiryLabel(at(20_000), now)).toBe("IN 1M");
  });

  it("crosses into the warning as the clock moves, with no new data", () => {
    const expiresAt = at(6 * HOUR);

    // Same recording, same data: only the clock advanced.
    expect(expiryLabel(expiresAt, now)).toBe("IN 6H");
    expect(expiryLabel(expiresAt, now + 2 * HOUR)).toBe("IN 4H");
    expect(expiryLabel(expiresAt, now + 5 * HOUR + 45 * MINUTE)).toBe("IN 15M");
    expect(expiryLabel(expiresAt, now + 6 * HOUR)).toBe("");
  });

  it("treats a missing or unreadable deadline as no warning", () => {
    expect(expiryLabel(null, now)).toBe("");
    expect(expiryLabel(undefined, now)).toBe("");
    expect(expiryLabel("not a date", now)).toBe("");
  });

  it("honours a different warning window", () => {
    expect(expiryLabel(at(3 * HOUR), now, 1)).toBe("");
    expect(expiryLabel(at(30 * MINUTE), now, 1)).toBe("IN 30M");
  });

  it("shows a keep promise until the day it runs out", () => {
    expect(keepLabel(at(7 * 24 * HOUR), now)).toBe("KEPT UNTIL 23 NOV");
    expect(keepLabel(at(-MINUTE), now)).toBe("");
    expect(keepLabel(null, now)).toBe("");
    expect(keepLabel("not a date", now)).toBe("");
  });
});

