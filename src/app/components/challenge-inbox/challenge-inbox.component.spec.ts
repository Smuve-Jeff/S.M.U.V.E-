import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { of } from "rxjs";
import { ChallengeInboxComponent } from "./challenge-inbox.component";
import { ChallengeInboxService } from "../../services/challenge-inbox.service";
import { SocialNetworkingService } from "../../services/social-networking.service";
import { UserProfileService } from "../../services/user-profile.service";
import { SnackbarService } from "../../services/snackbar.service";
import { TokenService } from "../../services/token.service";
import { GameService } from "../../hub/game.service";
import { ActivatedRoute, Router } from "@angular/router";

describe("ChallengeInboxComponent response feedback", () => {
  it("ignores a challenge response broadcast to the responding recipient", async () => {
    const inbox = {
      loading: signal(false),
      challenges: signal([]),
      notifications: signal([]),
      unreadCount: signal(0),
      pendingCount: signal(0),
      loadInbox: jest.fn().mockResolvedValue(undefined),
      loadNotifications: jest.fn().mockResolvedValue(undefined),
      respondToChallenge: jest.fn().mockResolvedValue(true),
      markNotificationRead: jest.fn(),
      onChallengeInboxSync: jest.fn(),
      onNotificationSync: jest.fn(),
      bindSocket: jest.fn(),
    };
    const listeners: Record<string, (payload: any) => void> = {};
    const socket = {
      on: jest.fn((event, handler) => {
        listeners[event] = handler;
      }),
      off: jest.fn(),
    };
    const snackbar = { success: jest.fn(), info: jest.fn(), error: jest.fn() };
    TestBed.configureTestingModule({
      imports: [ChallengeInboxComponent],
      providers: [
        { provide: ChallengeInboxService, useValue: inbox },
        {
          provide: SocialNetworkingService,
          useValue: { getSocket: () => socket },
        },
        {
          provide: UserProfileService,
          useValue: { profile: signal({ id: "recipient" }) },
        },
        { provide: SnackbarService, useValue: snackbar },
        { provide: TokenService, useValue: { jwtToken: jest.fn() } },
        { provide: GameService, useValue: { getGameById: jest.fn() } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of({ get: () => null }) },
        },
      ],
    }).overrideComponent(ChallengeInboxComponent, { set: { template: "" } });
    const fixture = TestBed.createComponent(ChallengeInboxComponent);
    await fixture.componentInstance.ngOnInit();
    expect(listeners.challenge_response).toEqual(expect.any(Function));
    listeners.challenge_response({
      fromUserId: "challenger",
      toUserId: "recipient",
      status: "accepted",
    });
    expect(snackbar.info).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it("shows failure rather than success when the server rejects an accept", async () => {
    const challenge = {
      id: 11,
      fromUserId: "rival",
      toUserId: "me",
      gameId: "pacman",
      status: "pending" as const,
      timestamp: Date.now(),
    };
    const inbox = {
      loading: signal(false),
      challenges: signal([challenge]),
      notifications: signal([]),
      unreadCount: signal(0),
      pendingCount: signal(1),
      loadInbox: jest.fn().mockResolvedValue(undefined),
      loadNotifications: jest.fn().mockResolvedValue(undefined),
      respondToChallenge: jest.fn().mockResolvedValue(false),
      markNotificationRead: jest.fn(),
      onChallengeInboxSync: jest.fn(),
      onNotificationSync: jest.fn(),
      bindSocket: jest.fn(),
    };
    const snackbar = { success: jest.fn(), info: jest.fn(), error: jest.fn() };
    const socket = { on: jest.fn(), off: jest.fn() };
    const profile = { profile: signal({ id: "me" }) };
    TestBed.configureTestingModule({
      imports: [ChallengeInboxComponent],
      providers: [
        { provide: ChallengeInboxService, useValue: inbox },
        {
          provide: SocialNetworkingService,
          useValue: { getSocket: () => socket },
        },
        { provide: UserProfileService, useValue: profile },
        { provide: SnackbarService, useValue: snackbar },
        { provide: TokenService, useValue: { jwtToken: jest.fn() } },
        { provide: GameService, useValue: { getGameById: jest.fn() } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of({ get: () => null }) },
        },
      ],
    }).overrideComponent(ChallengeInboxComponent, { set: { template: "" } });
    const fixture = TestBed.createComponent(ChallengeInboxComponent);
    await fixture.componentInstance.accept(challenge);
    expect(snackbar.success).not.toHaveBeenCalled();
    expect(snackbar.error).toHaveBeenCalledWith(
      "CHALLENGE RESPONSE FAILED — PLEASE RETRY",
    );
    expect(inbox.respondToChallenge).toHaveBeenCalledWith(11, "accepted");
    fixture.destroy();
  });
});
