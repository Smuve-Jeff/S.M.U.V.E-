import { openSecret, sealSecret } from "./secret-box";

/**
 * These values are what protects a host's channel: a database dump must not be
 * replayable, and a tampered row must fail loudly rather than decrypt into
 * something that gets sent to Twitch or Google.
 */
describe("secret-box", () => {
  it("round-trips a token without storing it in the clear", () => {
    const sealed = sealSecret("twitch-access-token");

    expect(sealed).not.toContain("twitch-access-token");
    expect(openSecret(sealed)).toBe("twitch-access-token");
  });

  it("uses a fresh IV for every seal", () => {
    expect(sealSecret("same-value")).not.toBe(sealSecret("same-value"));
  });

  it("refuses a tampered ciphertext", () => {
    const parts = sealSecret("secret").split(".");
    const flipped = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);

    expect(() =>
      openSecret([parts[0], parts[1], parts[2], flipped].join(".")),
    ).toThrow();
  });

  it("refuses a value it did not write", () => {
    expect(() => openSecret("not-a-sealed-value")).toThrow();
  });
});
