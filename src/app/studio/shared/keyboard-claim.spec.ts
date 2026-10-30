import { claimKeyEvent } from "./keyboard-claim";

describe("claimKeyEvent", () => {
  it("lets the first handler act and stands the others down", () => {
    const event = new KeyboardEvent("keydown", { key: "d" });

    expect(claimKeyEvent(event)).toBe(true);
    expect(claimKeyEvent(event)).toBe(false);
  });

  it("claims every press independently", () => {
    expect(claimKeyEvent(new KeyboardEvent("keydown", { key: "d" }))).toBe(true);
    expect(claimKeyEvent(new KeyboardEvent("keydown", { key: "d" }))).toBe(true);
  });
});
