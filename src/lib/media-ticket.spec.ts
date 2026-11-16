jest.mock("@/config/env", () => ({ JWT_SECRET: "test-secret" }));

import {
  mintPlaybackTicket,
  playbackPath,
  verifyPlaybackTicket,
} from "./media-ticket";

const claims = (overrides: Record<string, unknown> = {}) => ({
  userId: 7,
  relayId: "aaaa",
  name: "aaaa.mp4",
  ...overrides,
});

describe("playback tickets", () => {
  it("mints a ticket that verifies for the same claims", () => {
    const ticket = mintPlaybackTicket(claims());

    expect(
      verifyPlaybackTicket({
        userId: ticket.userId,
        relayId: ticket.relayId,
        name: ticket.name,
        expiresAt: ticket.expiresAt,
        signature: ticket.signature,
      }),
    ).toBe(true);
  });

  it("expires", () => {
    const ticket = mintPlaybackTicket({ ...claims(), ttlMs: 1_000, now: 1_000 });

    expect(
      verifyPlaybackTicket({
        userId: ticket.userId,
        relayId: ticket.relayId,
        name: ticket.name,
        expiresAt: ticket.expiresAt,
        signature: ticket.signature,
        now: 1_999,
      }),
    ).toBe(true);
    expect(
      verifyPlaybackTicket({
        userId: ticket.userId,
        relayId: ticket.relayId,
        name: ticket.name,
        expiresAt: ticket.expiresAt,
        signature: ticket.signature,
        now: 2_000,
      }),
    ).toBe(false);
  });

  it("binds the ticket to one file, one session and one user", () => {
    const ticket = mintPlaybackTicket(claims());
    const base = {
      userId: ticket.userId,
      relayId: ticket.relayId,
      name: ticket.name,
      expiresAt: ticket.expiresAt,
      signature: ticket.signature,
    };

    expect(verifyPlaybackTicket({ ...base, name: "bbbb.mp4" })).toBe(false);
    expect(verifyPlaybackTicket({ ...base, relayId: "bbbb" })).toBe(false);
    expect(verifyPlaybackTicket({ ...base, userId: 9 })).toBe(false);
    // Extending the expiry by hand must not survive the signature check.
    expect(
      verifyPlaybackTicket({ ...base, expiresAt: ticket.expiresAt + 60_000 }),
    ).toBe(false);
  });

  it("rejects a forged or missing signature", () => {
    const ticket = mintPlaybackTicket(claims());
    const base = {
      userId: ticket.userId,
      relayId: ticket.relayId,
      name: ticket.name,
      expiresAt: ticket.expiresAt,
    };

    expect(verifyPlaybackTicket({ ...base, signature: "00" })).toBe(false);
    expect(verifyPlaybackTicket({ ...base, signature: "" })).toBe(false);
    expect(verifyPlaybackTicket({ ...base, signature: undefined })).toBe(false);
    expect(
      verifyPlaybackTicket({ ...base, signature: "x".repeat(64) }),
    ).toBe(false);
  });

  it("rounds claims through a URL path", () => {
    const ticket = mintPlaybackTicket(claims());
    const path = playbackPath(ticket);

    expect(path.startsWith("/broadcast/recordings/aaaa/stream?")).toBe(true);
    const query = new URLSearchParams(path.split("?")[1]);
    expect(query.get("name")).toBe("aaaa.mp4");
    expect(query.get("u")).toBe("7");
    expect(query.get("exp")).toBe(String(ticket.expiresAt));
    expect(query.get("sig")).toBe(ticket.signature);
  });
});
