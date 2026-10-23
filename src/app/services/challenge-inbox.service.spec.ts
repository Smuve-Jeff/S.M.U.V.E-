import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { of, throwError } from "rxjs";
import { ChallengeInboxService } from "./challenge-inbox.service";
import { TokenService } from "./token.service";
import { UserProfileService } from "./user-profile.service";
import { APP_SECURITY_CONFIG } from "../app.security";

describe("ChallengeInboxService challenge lifecycle", () => {
  let service: ChallengeInboxService;
  let http: { get: jest.Mock; post: jest.Mock };
  let socket: {
    connected: boolean;
    emit: jest.Mock;
    on: jest.Mock;
    off: jest.Mock;
  };
  let handlers: Record<string, (payload: any) => void>;

  beforeEach(() => {
    handlers = {};
    http = { get: jest.fn(() => of([])), post: jest.fn(() => of({})) };
    socket = {
      connected: true,
      emit: jest.fn((_event, _payload, ack) => ack?.({ ok: true })),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
      off: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        ChallengeInboxService,
        { provide: HttpClient, useValue: http },
        { provide: TokenService, useValue: { jwtToken: () => "test-token" } },
        {
          provide: UserProfileService,
          useValue: { profile: signal({ id: "u1" }) },
        },
      ],
    });
    service = TestBed.inject(ChallengeInboxService);
    service.bindSocket(socket);
  });

  afterEach(() => jest.useRealTimers());

  it("does not emit twice when an event error follows a successful acknowledgement", async () => {
    socket.emit.mockImplementation((_event, _payload, ack) => {
      ack({ ok: true });
      handlers.challenge_error({ message: "late transport error" });
    });
    await expect(service.challengePlayer("u2", "pacman")).resolves.toBe(true);
    expect(http.post).not.toHaveBeenCalled();
    expect(service.lastChallengeError()).toBeNull();
  });

  it("uses the socket acknowledgement and merges the persisted sender echo", async () => {
    socket.emit.mockImplementation((_event, _payload, ack) => {
      handlers.challenge_persisted({
        id: 1,
        fromUserId: "u1",
        toUserId: "u2",
        gameId: "pacman",
        status: "pending",
        timestamp: 100,
      });
      ack({ ok: true });
    });
    await expect(service.challengePlayer("u2", "pacman")).resolves.toBe(true);
    expect(socket.emit).toHaveBeenCalledWith(
      "challenge_player",
      { toUserId: "u2", gameId: "pacman", gameName: "pacman" },
      expect.any(Function),
    );
    expect(service.challenges().map((c) => c.id)).toEqual([1]);
    expect(http.post).not.toHaveBeenCalled();
  });

  it("falls back to REST when a connected socket never acknowledges", async () => {
    jest.useFakeTimers();
    socket.emit.mockImplementation(() => undefined);
    http.post.mockReturnValue(
      of({
        id: 2,
        fromUserId: "u1",
        toUserId: "u2",
        gameId: "pacman",
        status: "pending",
        timestamp: 200,
      }),
    );
    const pending = service.challengePlayer("u2", "pacman");
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toBe(true);
    expect(http.post).toHaveBeenCalledWith(
      `${APP_SECURITY_CONFIG.api_url}/users/u1/challenges`,
      { toUserId: "u2", gameId: "pacman", gameName: "pacman" },
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    );
  });

  it("does not treat a socket transport without acknowledgement as success", async () => {
    jest.useFakeTimers();
    socket.emit.mockImplementation(() => undefined);
    http.post.mockReturnValue(throwError(() => new Error("network down")));
    const pending = service.challengePlayer("u2", "pacman");
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toBe(false);
    expect(service.lastChallengeError()).toBe(
      "Challenge could not be sent. Try again.",
    );
  });

  it("does not report a response successful or mutate state when REST fails", async () => {
    service.challenges.set([
      {
        id: 3,
        fromUserId: "u2",
        toUserId: "u1",
        gameId: "pacman",
        status: "pending",
        timestamp: 300,
      },
    ]);
    http.post.mockReturnValue(throwError(() => new Error("conflict")));
    await expect(service.respondToChallenge(3, "accepted")).resolves.toBe(
      false,
    );
    expect(service.challenges()[0].status).toBe("pending");
    expect(service.lastChallengeError()).toBe(
      "Challenge response could not be saved. Try again.",
    );
  });

  it("rejects sending a challenge to yourself before making a request", async () => {
    await expect(service.challengePlayer("u1", "pacman")).resolves.toBe(false);
    expect(socket.emit).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
});
