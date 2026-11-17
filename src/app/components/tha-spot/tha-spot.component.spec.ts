import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BehaviorSubject, of } from "rxjs";
import { CommonModule } from "@angular/common";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ThaSpotComponent } from "./tha-spot.component";
import { UserProfileService } from "../../services/user-profile.service";
import { SecurityService } from "../../services/security.service";
import { UIService } from "../../services/ui.service";
import {
  EMBED_BLOCKED_DOMAINS,
  GameService,
  TRUSTED_EMBED_DOMAINS,
} from "../../hub/game.service";
import { GamepadService } from "../../services/gamepad.service";
import { SocialNetworkingService } from "../../services/social-networking.service";
import { ChallengeInboxService } from "../../services/challenge-inbox.service";
import { PeerNetworkingService } from "../../services/peer-networking.service";
import { SnackbarService } from "../../services/snackbar.service";
import { MatchmakingService } from "../../hub/matchmaking.service";
import { ShareableInviteService } from "../../services/shareable-invite.service";
import { DailyMissionsService } from "../../services/daily-missions.service";
import { GameRatingsService } from "../../services/game-ratings.service";
import { StudioOrchestrationService } from "../../services/studio-orchestration.service";
import {
  Router,
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
} from "@angular/router";
import { signal } from "@angular/core";
import { LiveVideoService } from "../../services/live-video.service";
import { TokenService } from "../../services/token.service";

/** The real preview row, mounted in isolation for DOM hit-target tests. */
const THA_SPOT_PREVIEW_TEMPLATE = (() => {
  const full = readFileSync(join(__dirname, "tha-spot.component.html"), "utf8");
  const marker = full.indexOf('<span class="quality-readout">PREVIEW</span>');
  const start = full.lastIndexOf('<div class="stream-quality-row">', marker);
  const end = full.indexOf("<video", marker);
  if (marker < 0 || start < 0 || end < 0) {
    throw new Error("Tha Spot preview controls are missing from the template");
  }
  return full.slice(start, end);
})();

/** The real live source selectors and the separate video mute control. */
const THA_SPOT_LIVE_SOURCE_TEMPLATE = (() => {
  const full = readFileSync(join(__dirname, "tha-spot.component.html"), "utf8");
  const marker = "<!-- live-source-controls-start -->";
  const endMarker = "<!-- live-source-controls-end -->";
  const start = full.indexOf(marker);
  const end = full.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error("Tha Spot live source controls are missing from the template");
  }
  return full.slice(start + marker.length, end);
})();

/** The real four custom RTMP rows, including their CLEAR wiring. */
const THA_SPOT_CUSTOM_ROWS_TEMPLATE = (() => {
  const full = readFileSync(join(__dirname, "tha-spot.component.html"), "utf8");
  const marker = full.indexOf('*ngFor="let slot of customSlots"');
  const start = full.lastIndexOf("<div", marker);
  const note = full.indexOf('<p class="account-note"', marker);
  const end = full.lastIndexOf("</div>", note);
  if (marker < 0 || start < 0 || note < 0 || end < 0) {
    throw new Error("Tha Spot custom RTMP rows are missing from the template");
  }
  return full.slice(start, end + "</div>".length);
})();

describe("ThaSpotComponent", () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;
  let removeListenerSpy: jest.SpyInstance;
  let routerMock: { navigate: jest.Mock };
  let routeQueryParamMap: BehaviorSubject<ParamMap>;
  let socialServiceMock: any;
  let inboxServiceMock: any;
  let fakeSocket: any;
  let matchmakingMock: any;
  let profileServiceMock: any;

  const mockFeed = {
    games: [
      {
        id: "1",
        name: "Game 1",
        url: "test",
        genre: "Action",
        launchConfig: { embedMode: "inline" },
      },
      {
        id: "2",
        name: "Game 2",
        url: "test",
        genre: "RPG",
        launchConfig: { embedMode: "inline" },
      },
    ],
    rooms: [],
    badges: [],
    liveEvents: [],
    socialPresence: [],
    promotions: [],
    recommendationRails: [],
  };

  beforeEach(async () => {
    (navigator as any).getGamepads = jest.fn().mockReturnValue([]);
    profileServiceMock = {
      profile: signal({
        primaryGenre: "Action",
        gameStats: {},
        thaSpotProgression: { currentStreak: 0 },
        careerGoals: [],
      }),
      recordGameLaunch: jest.fn(),
      recordGameResult: jest.fn(),
    };

    const uiServiceMock = {
      isCompactMobile: signal(false),
      navigateToView: jest.fn(),
    };

    const securityServiceMock = {
      getCSRFToken: jest.fn().mockReturnValue("test-token"),
    };
    const gameServiceMock = {
      getThaSpotFeed: jest.fn().mockReturnValue(of(mockFeed)),
      matchesRoom: jest.fn().mockReturnValue(true),
      filterAndSortGames: jest.fn((games: any[]) => games),
      buildIframeSandbox: jest.fn().mockReturnValue("allow-scripts"),
      buildIframeAllowAttr: jest.fn().mockReturnValue("fullscreen"),
    };
    routerMock = { navigate: jest.fn() };
    routeQueryParamMap = new BehaviorSubject(convertToParamMap({}));
    fakeSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    socialServiceMock = {
      isIncognito: signal(false),
      socketConnected: signal(false),
      getSocket: jest.fn().mockReturnValue(fakeSocket),
      onlineUsers: signal([]),
      onlineInRoom: jest.fn(() => 0),
      messages: signal([]),
      roomMessages: signal([]),
      activeHubTab: signal<"room" | "dm" | "stream" | "friends" | "party">(
        "room",
      ),
      simulatedLiveChat: signal([]),
      matchmakingStatus: signal<"idle" | "searching" | "matched">("idle"),
      typingUsers: signal<Record<string, boolean>>({}),
      pendingPartyInvite: signal(null),
      pendingNeuralSync: signal(null),
      currentPartyId: jest.fn().mockReturnValue(null),
      updateStatus: jest.fn(),
      setPresenceExtrasProvider: jest.fn(),
      loadBlockedUsers: jest.fn(),
      friends: signal([]),
      friendsDirectory: signal([]),
      liveNow: signal([]),
      friendWentLive: signal(null),
      clearFriendLive: jest.fn(),
      reconnectSocket: jest.fn(),
      localStream: signal(null),
      videoSource: signal("camera"),
      isStreaming: signal(false),
      previewActive: signal(false),
      previewStarting: signal(false),
      previewCancelled: signal(false),
      switchingSource: signal(false),
      cameraEnabled: signal(true),
      toggleCamera: jest.fn(() =>
        socialServiceMock.cameraEnabled.set(!socialServiceMock.cameraEnabled()),
      ),
      screenShareSupported: signal(true),
      screenShareUnavailableReason: signal(null),
      screenAudioWarning: signal(null),
      startPreview: jest.fn().mockResolvedValue(true),
      stopPreview: jest.fn(),
      setVideoSource: jest.fn(async (source: "camera" | "screen" | "camera-pip") => {
        socialServiceMock.videoSource.set(source);
      }),
      streamError: signal(null),
      captureBlocked: signal(false),
      loadFriends: jest.fn(),
      joinParty: jest.fn(),
      joinRoom: jest.fn(),
      sendTypingStatus: jest.fn(),
      acceptPartyInvite: jest.fn(),
      declinePartyInvite: jest.fn(),
      acceptNeuralSyncRequest: jest.fn(),
      declineNeuralSyncRequest: jest.fn(),
      getFeaturedUsers: jest.fn().mockResolvedValue([]),
      searchUsers: jest.fn().mockResolvedValue([]),
      sendRoomMessage: jest.fn(),
      sendMessage: jest.fn(),
      sendPartyMessage: jest.fn(),
      startStream: jest.fn(),
      stopStream: jest.fn(),
      loadMessageHistory: jest.fn(),
      screenAudioOnly: signal(false),
      onHostStreamReplaced: jest.fn(() => () => undefined),
    };
    inboxServiceMock = {
      challenges: signal([]),
      lastChallengeError: signal(null),
      challengePlayer: jest.fn().mockResolvedValue(true),
      respondToChallenge: jest.fn().mockResolvedValue(true),
    };
    const peerServiceMock = {
      isKnocking: signal(false),
      knockFromUserId: signal(null),
      isCallActive: signal(false),
      remoteStream: signal(null),
      voiceActivityLevel: jest.fn().mockReturnValue(0),
      startCall: jest.fn().mockResolvedValue(true),
      endCall: jest.fn(),
      toggleMute: jest.fn(),
    };
    matchmakingMock = {
      cancelMatchQueue: jest.fn(),
      queueForMatch: jest.fn(),
      createLobby: jest
        .fn()
        .mockReturnValue({ gameName: "Test Game", id: "lobby-1" }),
      toggleReady: jest.fn(),
      clearMatchState: jest.fn(),
      startCountdown: jest.fn(),
      cancelCountdown: jest.fn(),
      sendLobbyChatMessage: jest.fn(),
      startSpectateLobby: jest.fn(),
      stopSpectateLobby: jest.fn(),
      activeSplitLobby: jest.fn().mockReturnValue(null),
      myLobby: jest.fn().mockReturnValue(null),
      startReplay: jest.fn(),
      stopReplay: jest.fn(),
      copyLobbyInviteLink: jest.fn(),
      shareLobbyInvite: jest.fn().mockResolvedValue(undefined),
      broadcastGameState: jest.fn(),
      recordGameSnapshot: jest.fn(),
      acceptedChallenge: jest.fn().mockReturnValue(null),
      clearAcceptedChallenge: jest.fn(),
      partyLaunch: jest.fn().mockReturnValue(null),
      clearPartyLaunch: jest.fn(),
      markResolvedLaunch: jest.fn(),
      consumeResolvedLaunch: jest.fn().mockReturnValue(false),
      endCurrentMatch: jest.fn(),
    };
    const orchestrationMock = {
      requestRemix: jest.fn().mockResolvedValue(true),
      requestReview: jest.fn().mockResolvedValue(true),
      currentTarget: signal({
        projectId: "proj-1",
        sessionId: "sess-1",
        activeView: "tha-spot",
        selectedTrackId: null,
        branchId: null,
        checkpointId: null,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [ThaSpotComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerMock },
        {
          provide: ActivatedRoute,
          useValue: {
            routeConfig: { path: "tha-spot" },
            snapshot: {
              queryParamMap: convertToParamMap({}),
              queryParams: {},
            },
            paramMap: of(convertToParamMap({})),
            queryParamMap: routeQueryParamMap,
          },
        },
        { provide: UserProfileService, useValue: profileServiceMock },
        { provide: UIService, useValue: uiServiceMock },
        { provide: SecurityService, useValue: securityServiceMock },
        { provide: GameService, useValue: gameServiceMock },
        {
          provide: GamepadService,
          useValue: {
            connectedGamepad: signal(null),
            dpadX: signal(0),
            dpadY: signal(0),
          },
        },
        { provide: SocialNetworkingService, useValue: socialServiceMock },
        { provide: ChallengeInboxService, useValue: inboxServiceMock },
        { provide: PeerNetworkingService, useValue: peerServiceMock },
        {
          provide: SnackbarService,
          useValue: {
            info: jest.fn(),
            success: jest.fn(),
            warning: jest.fn(),
            error: jest.fn(),
          },
        },
        { provide: MatchmakingService, useValue: matchmakingMock },
        { provide: DailyMissionsService, useValue: {} },
        { provide: GameRatingsService, useValue: {} },
        { provide: StudioOrchestrationService, useValue: orchestrationMock },
      ],
    })
      .overrideComponent(ThaSpotComponent, {
        set: {
          imports: [CommonModule],
          template: `<div class="preview-dom">${THA_SPOT_PREVIEW_TEMPLATE}</div>
            <div class="live-source-dom">${THA_SPOT_LIVE_SOURCE_TEMPLATE}</div>
            <div class="custom-rows-dom">${THA_SPOT_CUSTOM_ROWS_TEMPLATE}</div>`,
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ThaSpotComponent);
    component = fixture.componentInstance;
    removeListenerSpy = jest.spyOn(window, "removeEventListener");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("live source controls", () => {
    const sourceButtons = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll(
          ".live-source-dom .av-btn",
        ),
      ) as HTMLButtonElement[];
    const button = (label: string) =>
      sourceButtons().find((entry) =>
        entry.textContent?.toUpperCase().includes(label),
      );

    it("switches the live source from CAMERA and SCREEN, with mute kept separate", async () => {
      socialServiceMock.isStreaming.set(true);
      socialServiceMock.videoSource.set("screen");
      jest
        .spyOn(component.ingest, "primeAudioContext")
        .mockImplementation(() => undefined);
      fixture.detectChanges();

      button("CAMERA")!.click();
      await fixture.whenStable();
      expect(socialServiceMock.setVideoSource).toHaveBeenLastCalledWith("camera");

      button("SCREEN")!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      expect(socialServiceMock.setVideoSource).toHaveBeenLastCalledWith("screen");

      const mute = button("MUTE VIDEO");
      expect(mute).toBeTruthy();
      mute!.click();
      fixture.detectChanges();
      expect(socialServiceMock.toggleCamera).toHaveBeenCalledTimes(1);
      expect(button("UNMUTE")).toBeTruthy();
      expect(socialServiceMock.setVideoSource).toHaveBeenCalledTimes(2);
    });
  });

  describe("custom RTMP rows", () => {
    const rows = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll(
          ".custom-rows-dom .manual-destination",
        ),
      ) as HTMLElement[];

    const clearButton = (row: HTMLElement) =>
      row.querySelector<HTMLButtonElement>(".recording-delete");

    it("shows CLEAR only for saved slots and resets the cleared slot", async () => {
      const ingest = component.ingest;
      ingest.destinations.set({
        custom2: { platform: "custom2", ready: true, label: "Instagram" },
        custom4: { platform: "custom4", ready: true, label: "LinkedIn" },
      });
      component.setCustomDraft("custom2", "label", "Instagram");
      component.setCustomDraft(
        "custom2",
        "rtmpUrl",
        "rtmps://instagram.example.com/live",
      );
      component.setCustomDraft("custom2", "streamKey", "INSTAGRAM_KEY");
      component.setCustomDraft("custom4", "label", "LinkedIn");
      component.setCustomDraft(
        "custom4",
        "rtmpUrl",
        "rtmps://linkedin.example.com/live",
      );
      component.setCustomDraft("custom4", "streamKey", "LINKEDIN_KEY");
      const clearDestination = jest
        .spyOn(ingest, "clearDestination")
        .mockResolvedValue(true);
      fixture.detectChanges();

      const [custom1Row, custom2Row, custom3Row, custom4Row] = rows();
      expect(rows()).toHaveLength(4);
      expect(custom2Row.querySelector(".account-name")?.textContent).toContain(
        "Instagram",
      );
      expect(clearButton(custom1Row)).toBeNull();
      expect(clearButton(custom2Row)?.textContent).toContain("CLEAR");
      expect(clearButton(custom3Row)).toBeNull();
      expect(clearButton(custom4Row)?.textContent).toContain("CLEAR");

      clearButton(custom2Row)!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(clearDestination).toHaveBeenCalledWith("custom2");
      expect(component.customDraft("custom2", "label")).toBe("");
      expect(component.customDraft("custom2", "rtmpUrl")).toBe("");
      expect(component.customDraft("custom2", "streamKey")).toBe("");
      expect(component.customDraft("custom4", "label")).toBe("LinkedIn");
      expect(component.customDraft("custom4", "rtmpUrl")).toBe(
        "rtmps://linkedin.example.com/live",
      );
      expect(component.customDraft("custom4", "streamKey")).toBe("LINKEDIN_KEY");
      expect(clearButton(custom4Row)).not.toBeNull();
    });
  });

  it("counts only incoming pending requests for the NET badge", () => {
    socialServiceMock.friendsDirectory.set([
      { userId: "incoming-1", status: "pending", direction: "incoming" },
      { userId: "outgoing-1", status: "pending", direction: "outgoing" },
      { userId: "friend-1", status: "accepted" },
    ]);

    expect(component.incomingFriendRequestCount()).toBe(1);
  });

  it("opens the LIVE tab and Broadcast Push from a guide deep link", () => {
    routeQueryParamMap.next(convertToParamMap({ panel: "broadcast" }));

    expect(component.showRivalHub()).toBe(true);
    expect(component.activeHubTab()).toBe("stream");
  });

  it("polls the live directory only while NET is open and the socket is down", () => {
    const loadSpy = jest.spyOn(component.liveStream, "loadActiveStreams");
    try {
      component.showRivalHub.set(true);
      component.activeHubTab.set("friends");
      component.socialService.socketConnected.set(false);
      component.refreshLiveDirectoryIfVisible();
      expect(loadSpy).toHaveBeenCalledTimes(1);

      // Socket events keep the list current while connected; polling stops.
      component.socialService.socketConnected.set(true);
      component.refreshLiveDirectoryIfVisible();
      expect(loadSpy).toHaveBeenCalledTimes(1);

      component.socialService.socketConnected.set(false);
      component.activeHubTab.set("room");
      component.refreshLiveDirectoryIfVisible();
      expect(loadSpy).toHaveBeenCalledTimes(1);

      component.activeHubTab.set("friends");
      component.showRivalHub.set(false);
      component.refreshLiveDirectoryIfVisible();
      expect(loadSpy).toHaveBeenCalledTimes(1);
    } finally {
      loadSpy.mockRestore();
    }
  });

  it("should toggle between gaming and the S.M.U.V.E TV broadcast mode", () => {
    expect(component.displayMode()).toBe("gaming");
    component.enterTv();
    expect(component.displayMode()).toBe("tv");
    component.setMode("gaming");
    expect(component.displayMode()).toBe("gaming");
  });

  /*
   * S.M.U.V.E TV replaced a Pluto TV embed. Pluto's consumer player refuses to
   * run inside a frame, so these lock in what took its place: an in-app
   * broadcast module rendered as a sibling of the scrolling <main>, app chrome
   * that stands down while it is up, and an Escape route out of it.
   */
  describe("S.M.U.V.E TV broadcast mode", () => {
    const template = () =>
      readFileSync(join(__dirname, "tha-spot.component.html"), "utf8");
    const source = () =>
      readFileSync(join(__dirname, "tha-spot.component.ts"), "utf8");

    it("opens the broadcast surface with the arcade and intel drawer shut", () => {
      component.toggleIntel();
      expect(component.showIntelPanel()).toBe(true);

      component.enterTv();

      expect(component.displayMode()).toBe("tv");
      expect(component.showIntelPanel()).toBe(false);
    });

    it("announces the tune-in on entry", () => {
      const statusSpy = jest.spyOn(component.socialService, "updateStatus");

      component.enterTv();

      expect(statusSpy).toHaveBeenCalledWith({
        activity: "tuned in to S.M.U.V.E TV",
      });
      statusSpy.mockRestore();
    });

    it("stops offering arcade cabinets while broadcasting", () => {
      component.enterTv();
      expect(component.filteredGames()).toEqual([]);
    });

    it("hands the keyboard back to the toggle it left from", () => {
      const focus = jest.fn();

      component.enterTv();
      component.exitTv();

      expect(component.displayMode()).toBe("gaming");
      // While broadcasting the toggle does not exist, so there is nothing to
      // hand the keyboard to yet — and no timer is guessing at it either.
      expect(focus).not.toHaveBeenCalled();

      // The header re-renders after exit; the query setter is that transition.
      (component as any).tvToggle = { nativeElement: { focus } };

      expect(focus).toHaveBeenCalledTimes(1);
    });

    it("lets Escape back out of the broadcast surface", () => {
      const press = () => {
        const event = new KeyboardEvent("keydown", {
          key: "Escape",
          cancelable: true,
        });
        component.onTvEscape(event);
        return event;
      };

      // In gaming mode the key belongs to the preview/game handler.
      expect(press().defaultPrevented).toBe(false);

      component.enterTv();
      expect(press().defaultPrevented).toBe(true);
      expect(component.displayMode()).toBe("gaming");
    });

    it("renders the broadcast module outside the scrolling main region", () => {
      // It is `position: fixed` and must cover the app, and <main> is made
      // `inert` while broadcasting — hanging the module off <main> would make
      // the surface itself inert.
      const html = template();
      const mainEnd = html.indexOf("</main>");
      const moduleStart = html.indexOf("<app-smuve-tv");

      expect(moduleStart).toBeGreaterThan(mainEnd);
      expect(html.slice(html.indexOf("<main"), mainEnd)).not.toContain(
        "<app-smuve-tv",
      );
      expect(html).toContain("<app-smuve-tv");
      expect(html).toContain("*ngIf=\"displayMode() === 'tv'\"");
      expect(html).toContain('(exit)="exitTv()"');
    });

    it("keeps the retired Pluto embed out of the app for good", () => {
      const html = template();

      expect(html).not.toContain("pluto-standalone-experience");
      expect(html).not.toContain("pluto-live-launch");
      expect(html).not.toContain("pluto-toolbar");
      expect(html).not.toContain("pluto.tv");
      expect(html).not.toContain("logPlutoLaunch");
    });

    it("stands the app chrome down while broadcasting", () => {
      const html = template();

      // Header, mobile search, intel drawer, and rival hub all gate on the
      // broadcast mode.
      expect(html).toContain("*ngIf=\"displayMode() !== 'tv'\"");
      expect(html).toContain("showIntelPanel() && displayMode() !== 'tv'");
      expect(html).toContain("showRivalHub() && displayMode() !== 'tv'");

      // <main> goes inert instead.
      const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
      expect(main).toContain(
        "[attr.inert]=\"displayMode() === 'tv' ? '' : null\"",
      );
      expect(main).toContain(
        "[attr.aria-hidden]=\"displayMode() === 'tv' ? 'true' : null\"",
      );

      /*
       * The hub footer is a *sibling* of <main>, so `inert` never covered it:
       * measured in Chromium, `.hub-footer` was still rendered while the
       * broadcast was up. The stylesheet is what removes it.
       */
      const styles = readFileSync(
        join(__dirname, "tha-spot.component.css"),
        "utf8",
      );
      expect(styles).toContain(".tha-spot-container.tv-active .hub-footer {");
      expect(styles).toContain(
        ".tha-spot-container.tv-active .hub-footer {\n  display: none;\n}",
      );
    });

    it("has no retired Pluto alias left anywhere in the surface", () => {
      /*
       * Both sites used to sit past the file editor's byte window, so the alias
       * was tolerated and pinned rather than removed. They are gone now, and
       * this is a floor rather than a ratchet: no template line and no class
       * member may test or assign the retired mode again.
       */
      const staleTemplate = template()
        .split("\n")
        .filter((line) => line.includes("'pluto'"));
      const staleSource = source()
        .split("\n")
        .filter((line) => line.includes("'pluto'"));

      expect(staleTemplate).toEqual([]);
      expect(
        staleSource.filter((line) => !line.trimStart().startsWith("*")),
      ).toEqual([]);
      expect(source()).not.toContain("logPlutoLaunch");

      // The footer still stands down during a broadcast — now by its own gate
      // rather than only by the stylesheet.
      expect(template()).toContain("displayMode() !== 'tv' &&");
    });

    it("cannot be put into the retired mode at all", () => {
      component.setMode("gaming");
      expect(component.displayMode()).toBe("gaming");

      component.setMode("tv");
      expect(component.displayMode()).toBe("tv");
    });
  });

  it("does not send duplicate challenges for invalid cabinet selection", async () => {
    await component.sendChallenge("peer-1", "all");
    expect(inboxServiceMock.challengePlayer).not.toHaveBeenCalled();
  });

  it("does not claim a challenge was sent when the service rejects it", async () => {
    inboxServiceMock.challengePlayer.mockResolvedValue(false);
    await component.sendChallenge("peer-1", "1");
    expect(inboxServiceMock.challengePlayer).toHaveBeenCalledWith(
      "peer-1",
      "1",
    );
    expect(component.challengeCount()).toBe(0);
  });

  it("accept challenge banner remains visible when saving the response fails", async () => {
    inboxServiceMock.lastChallengeError.set("server down");
    inboxServiceMock.respondToChallenge.mockResolvedValue(false);
    component.incomingChallenge.set({
      id: 66,
      fromUserId: "rival",
      gameId: "1",
      timestamp: 1,
    });
    component.acceptIncomingChallenge();
    await Promise.resolve();
    expect(component.incomingChallenge()).toMatchObject({ id: 66 });
  });

  it("surfaces live socket challenges on the in-hub accept banner", () => {
    expect(fakeSocket.on).toHaveBeenCalledWith(
      "incoming_challenge",
      expect.any(Function),
    );
    const handler = fakeSocket.on.mock.calls.find(
      (c: any[]) => c[0] === "incoming_challenge",
    )[1];
    handler({
      id: 42,
      fromUserId: "peer-1",
      fromUserName: "RIVAL ONE",
      gameId: "1",
      timestamp: 1000,
    });
    fixture.detectChanges();
    expect(component.incomingChallenge()).toEqual({
      id: 42,
      fromUserId: "peer-1",
      fromUserName: "RIVAL ONE",
      gameId: "1",
      timestamp: 1000,
    });

    component.acceptIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      42,
      "accepted",
    );
    expect(component.incomingChallenge()).toMatchObject({ id: 42 });
  });

  it("declines a live challenge off the in-hub banner", () => {
    const handler = fakeSocket.on.mock.calls.find(
      (c: any[]) => c[0] === "incoming_challenge",
    )[1];
    handler({
      id: 43,
      fromUserId: "peer-2",
      gameId: "1",
      timestamp: 2000,
    });
    fixture.detectChanges();
    component.declineIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      43,
      "declined",
    );
    expect(component.incomingChallenge()).toMatchObject({ id: 43 });
  });

  it("detaches the challenge socket listener on destroy", () => {
    const handler = fakeSocket.on.mock.calls.find(
      (c: any[]) => c[0] === "incoming_challenge",
    )[1];
    component.ngOnDestroy();
    expect(fakeSocket.off).toHaveBeenCalledWith("incoming_challenge", handler);
  });

  it("defaults to the full catalog (room all) on load", () => {
    expect(component.activeRoom()).toBe("all");
    expect(socialServiceMock.joinRoom).toHaveBeenCalledWith("all");
  });

  it("mirrors a room selection into the URL as a navigable filter", () => {
    component.selectRoom("arcade");
    expect(component.activeRoom()).toBe("arcade");
    expect(routerMock.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ room: "arcade" }),
        queryParamsHandling: "merge",
      }),
    );
  });

  it("restores the room filter from the URL reactively", () => {
    routeQueryParamMap.next(convertToParamMap({ room: "arcade" }));
    fixture.detectChanges();
    expect(component.activeRoom()).toBe("arcade");
  });

  it("restores genre/platform/search filters from the URL", () => {
    routeQueryParamMap.next(
      convertToParamMap({ genre: "RPG", platform: "SNES", q: "mario" }),
    );
    fixture.detectChanges();
    expect(component.activeGenre()).toBe("RPG");
    expect(component.activePlatform()).toBe("SNES");
    expect(component.searchQuery()).toBe("mario");
  });

  it("resets filters back to the full catalog when the URL drops them", () => {
    component.selectRoom("arcade");
    expect(component.activeRoom()).toBe("arcade");
    routeQueryParamMap.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(component.activeRoom()).toBe("all");
  });

  it("persists an accepted banner challenge so the challenger is notified", () => {
    component.incomingChallenge.set({
      id: 7,
      fromUserId: "rival-1",
      fromUserName: "RIVAL",
      gameId: "game-1",
      timestamp: 1,
    });
    component.acceptIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      7,
      "accepted",
    );
    expect(component.incomingChallenge()).toMatchObject({ id: 7 });
  });

  it("persists a declined banner challenge so the challenger is notified", () => {
    component.incomingChallenge.set({
      id: 8,
      fromUserId: "rival-1",
      gameId: "game-1",
      timestamp: 1,
    });
    component.declineIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      8,
      "declined",
    );
    expect(component.incomingChallenge()).toMatchObject({ id: 8 });
  });

  it("falls back to the matching pending record for id-less deep-link challenges", () => {
    inboxServiceMock.challenges.set([
      {
        id: 42,
        fromUserId: "rival-1",
        fromUserName: "RIVAL",
        toUserId: profileServiceMock.profile().id,
        gameId: "game-1",
        status: "pending",
        timestamp: 1,
      },
    ]);
    component.incomingChallenge.set({
      fromUserId: "rival-1",
      gameId: "game-1",
      timestamp: 1,
    });
    component.acceptIncomingChallenge();
    expect(inboxServiceMock.respondToChallenge).toHaveBeenCalledWith(
      42,
      "accepted",
    );
  });

  it("keeps launcher embed allowlists aligned with the canonical service lists", () => {
    // The component's private statics are the runtime launcher policy; the
    // service exports drive the split-screen panel. If they drift, one
    // surface will iframe a cabinet the other refuses (or vice versa).
    const c = ThaSpotComponent as unknown as {
      TRUSTED_EMBED_DOMAINS: readonly string[];
      EMBED_BLOCKED_DOMAINS: readonly string[];
    };
    expect([...c.TRUSTED_EMBED_DOMAINS]).toEqual([...TRUSTED_EMBED_DOMAINS]);
    // Blocked list is a strict subset of the service's canonical blockers,
    // which additionally covers the modern AAA/external sites.
    for (const d of c.EMBED_BLOCKED_DOMAINS) {
      expect(EMBED_BLOCKED_DOMAINS).toContain(d);
    }
  });

  it("carries the active split-screen lobby id into split-screen share links", async () => {
    const shareable = TestBed.inject(ShareableInviteService);
    const buildSpy = jest.spyOn(shareable, "buildShareIntent");
    matchmakingMock.activeSplitLobby = jest
      .fn()
      .mockReturnValue({ id: "split_abc" });
    component.selectedGame.set({ id: "game-1", name: "Game One" } as any);
    await component.shareSelectedGame("split-screen");
    expect(buildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "split-screen",
        gameId: "game-1",
        lobbyId: "split_abc",
      }),
    );
    buildSpy.mockRestore();
  });

  it("keeps the rival chat drawer collapsed until explicitly toggled", () => {
    expect(component.showRivalHub()).toBe(false);

    component.toggleRivalHub();
    expect(component.showRivalHub()).toBe(true);

    component.toggleRivalHub();
    expect(component.showRivalHub()).toBe(false);
  });

  it("keeps strategic intel collapsed until explicitly toggled", () => {
    expect(component.showIntelPanel()).toBe(false);

    component.toggleIntel();
    expect(component.showIntelPanel()).toBe(true);

    component.toggleIntel();
    expect(component.showIntelPanel()).toBe(false);
  });

  it("preserves raster art and falls back to the correct title when loading fails", () => {
    const game = {
      id: "missing-art",
      name: "Missing Art",
      genre: "Arcade",
      url: "https://example.test/game",
      image: "/assets/games/missing-art.png",
    };
    expect(component.getGameImage(game)).toBe("/assets/games/missing-art.png");
    const image = document.createElement("img");
    component.onGameImageError({ target: image } as unknown as Event, game);
    expect(image.src).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(image.src)).toContain(
      "<title>Missing Art</title>",
    );
    const fallback = image.src;
    component.onGameImageError({ target: image } as unknown as Event, game);
    expect(image.src).toBe(fallback);

    // A reused card must still recover when its new source fails.
    image.src = "/assets/games/another-missing.png";
    component.onGameImageError({ target: image } as unknown as Event, {
      ...game,
      name: "Next Game",
    });
    expect(decodeURIComponent(image.src)).toContain("<title>Next Game</title>");
  });

  it("replaces missing/shared art with title-specific artwork and preserves cover URLs", () => {
    const base = {
      id: "art-check",
      name: "Art Check",
      genre: "Arcade",
      url: "https://example.test/game",
    };
    const fallback = component.getGameImage(base);
    expect(fallback).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(fallback)).toContain("<title>Art Check</title>");
    expect(
      component.getGameImage({
        ...base,
        image: "assets/hub/home-backdrop-command.png",
      }),
    ).toBe(fallback);
    expect(
      component.getGameImage({
        ...base,
        image: "https://cdn.example.test/art-check.png",
      }),
    ).toBe("https://cdn.example.test/art-check.png");
    expect(
      component.getGameImage({ ...base, image: "/assets/games/art-check.jpg" }),
    ).toBe("/assets/games/art-check.jpg");
  });

  it("routes untrusted and X-Frame-blocked embed hosts to external launch", () => {
    const untrusted = component.resolveLaunchMode({
      id: "x",
      url: "https://untrusted.example/game",
      launchConfig: {
        embedMode: "inline",
        approvedEmbedUrl: "https://untrusted.example/game",
      },
    } as any);
    expect(untrusted).toBe("external");

    // Gamepix /play/ pages send X-Frame-Options: SAMEORIGIN + CSP
    // frame-ancestors 'self', so they must open externally, not inline.
    const gamepix = component.resolveLaunchMode({
      id: "y",
      url: "https://www.gamepix.com/play/pac-man",
      launchConfig: {
        embedMode: "inline",
        approvedEmbedUrl: "https://www.gamepix.com/play/pac-man",
      },
    } as any);
    expect(gamepix).toBe("external");

    // retrogames.cc /embed/ endpoints carry no framing headers, so the
    // provider's iframe contract plays inline.
    const retro = component.resolveLaunchMode({
      id: "z",
      url: "https://www.retrogames.cc/embed/3654-super-mario-bros-nes.html",
      launchConfig: {
        embedMode: "inline",
        approvedEmbedUrl:
          "https://www.retrogames.cc/embed/3654-super-mario-bros-nes.html",
      },
    } as any);
    expect(retro).toBe("inline");
  });

  it("offers an external launch dialog only for safe web URLs", () => {
    component.selectedGame.set({
      id: "ext-safe",
      name: "External Safe",
      genre: "Arcade",
      url: "https://untrusted.example/game",
      launchConfig: { embedMode: "external-only" },
    } as any);

    component.confirmLaunch();

    expect(component.showExternalConfirm()).toBe(true);
    expect(component.externalTargetUrl()).toBe(
      "https://untrusted.example/game",
    );
    expect(component.externalTargetDomain()).toBe("untrusted.example");
  });

  it("refuses non-web external launch URLs before showing the dialog", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      component.selectedGame.set({
        id: "ext-evil",
        name: "External Evil",
        genre: "Arcade",
        url: "javascript:alert(1)",
        launchConfig: { embedMode: "external-only" },
      } as any);

      component.confirmLaunch();

      expect(component.showExternalConfirm()).toBe(false);
      expect(component.externalTargetUrl()).toBe("");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("opens only http(s) targets from the external-launch dialog", () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    try {
      component.externalTargetUrl.set("https://example.test/game");
      component.showExternalConfirm.set(true);

      component.confirmExternalLaunch();

      expect(openSpy).toHaveBeenCalledWith(
        "https://example.test/game",
        "_blank",
        "noopener,noreferrer",
      );
      expect(component.showExternalConfirm()).toBe(false);
      expect(component.selectedGame()).toBeNull();
    } finally {
      openSpy.mockRestore();
    }
  });

  it("never opens non-web targets from the external-launch dialog", () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    try {
      component.externalTargetUrl.set("javascript:alert(1)");
      component.showExternalConfirm.set(true);

      component.confirmExternalLaunch();

      expect(openSpy).not.toHaveBeenCalled();
      expect(component.showExternalConfirm()).toBe(false);
    } finally {
      openSpy.mockRestore();
    }
  });

  it("streams solo-capable multiplayer cabinets inline instead of scanning for rivals", () => {
    const matchmaking = TestBed.inject(MatchmakingService) as any;
    component.selectedGame.set({
      id: "solo-capable-mp",
      name: "Solo Capable MP",
      genre: "Arcade",
      url: "https://www.retrogames.cc/embed/1-solo-capable.html",
      modes: ["solo", "duel"],
      multiplayerType: "Server",
      launchConfig: {
        embedMode: "inline",
        approvedEmbedUrl: "https://www.retrogames.cc/embed/1-solo-capable.html",
      },
    } as any);

    component.confirmLaunch();

    // Solo is an advertised mode: the cabinet itself must stream now, with no
    // rival-scan gate. Organized versus stays on the lobby path.
    expect(matchmaking.queueForMatch).not.toHaveBeenCalled();
    expect(component.isMatchmaking()).toBe(false);
  });

  it("queues purely-versus cabinets for a rival scan on direct launch", () => {
    const matchmaking = TestBed.inject(MatchmakingService) as any;
    component.selectedGame.set({
      id: "duel-only-mp",
      name: "Duel Only MP",
      genre: "Arcade",
      url: "https://www.retrogames.cc/embed/2-duel-only.html",
      modes: ["duel", "team"],
      multiplayerType: "Server",
      launchConfig: {
        embedMode: "inline",
        approvedEmbedUrl: "https://www.retrogames.cc/embed/2-duel-only.html",
      },
    } as any);

    component.confirmLaunch();

    expect(matchmaking.queueForMatch).toHaveBeenCalledWith("duel-only-mp");
    expect(component.isMatchmaking()).toBe(true);
  });

  it("recreates the game frame through the state-driven retry machine", () => {
    jest.useFakeTimers();
    try {
      component.currentGame.set({
        id: "retry-1",
        url: "/assets/games/demo.html",
        launchConfig: { embedMode: "inline" },
      } as any);
      component.gameLoadError.set(true);

      component.retryGameLoad();

      // Error held during the swap window so *ngIf removes the dead iframe
      expect(component.gameLoadError()).toBe(true);
      expect(component.gameLoadStage()).toBe("loading");

      jest.advanceTimersByTime(1);

      // Error cleared -> *ngIf recreates a FRESH iframe; watchdog re-armed
      expect(component.gameLoadError()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignores game messages from untrusted origins", () => {
    const profileService = TestBed.inject(UserProfileService) as any;
    const frameWindow = {} as Window;
    component.gameIframe = {
      nativeElement: { contentWindow: frameWindow },
    } as any;
    component.currentGame.set({
      id: "1",
      url: "/assets/games/demo.html",
      launchConfig: { embedMode: "inline" },
    } as any);

    const message = {
      origin: "https://evil.example",
      source: frameWindow,
      data: { type: "GAME_OVER", data: { score: 42 } },
    } as MessageEvent;

    component.onMessage(message);

    expect(profileService.recordGameResult).not.toHaveBeenCalled();
  });

  it("accepts trusted cabinet telemetry from the active iframe origin", () => {
    const matchmaking = TestBed.inject(MatchmakingService) as any;
    const frameWindow = {} as Window;
    component.gameIframe = {
      nativeElement: { contentWindow: frameWindow },
    } as any;
    component.currentGame.set({
      id: "2",
      name: "Gamepix Title",
      url: "https://www.gamepix.com/play/arcade",
      launchConfig: {
        embedMode: "inline",
        approvedEmbedUrl: "https://www.gamepix.com/play/arcade",
      },
    } as any);

    const message = {
      origin: "https://www.gamepix.com",
      source: frameWindow,
      data: { type: "GAME_STATE_UPDATE", data: { score: 12, level: 2 } },
    } as MessageEvent;

    component.onMessage(message);

    expect(matchmaking.broadcastGameState).toHaveBeenCalledWith({
      score: 12,
      progress: undefined,
      level: 2,
      alive: undefined,
      position: undefined,
      custom: undefined,
    });
  });

  it("removes the exact message listener on destroy", () => {
    component.ngOnDestroy();
    const removeCall = removeListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "message",
    );
    expect(removeCall).toBeDefined();
    expect(typeof removeCall?.[1]).toBe("function");
  });

  it("dispatches remix requests through the orchestration layer", async () => {
    const orchestration = TestBed.inject(StudioOrchestrationService) as any;

    await component.sendRemixRequest("peer-1");

    expect(orchestration.requestRemix).toHaveBeenCalledWith("peer-1");
  });

  it("clears the live typing indicator when a DM is submitted", () => {
    component.activeHubTab.set("dm");
    component.dmTargetUserId.set("peer-1");
    component.chatInput.set("yo");

    component.handleChatSubmit();

    expect(socialServiceMock.sendMessage).toHaveBeenCalledWith("peer-1", "yo");
    expect(socialServiceMock.sendTypingStatus).toHaveBeenCalledWith(
      "peer-1",
      false,
    );
    expect(component.chatInput()).toBe("");
  });

  it("never silently drops squad chat when no squad exists", () => {
    const snackbar = TestBed.inject(SnackbarService) as any;
    component.activeHubTab.set("party");
    component.chatInput.set("lets run it");

    component.handleChatSubmit();

    expect(socialServiceMock.sendPartyMessage).not.toHaveBeenCalled();
    expect(snackbar.info).toHaveBeenCalledWith(
      "JOIN OR CREATE A SQUAD BEFORE CHATTING",
    );
    expect(component.chatInput()).toBe("");
  });

  it("reports the DM typing state for the active target reactively", () => {
    component.dmTargetUserId.set("peer-1");
    fixture.detectChanges();
    expect(component.dmTyping()).toBe(false);

    socialServiceMock.typingUsers.set({ "peer-1": true });
    fixture.detectChanges();
    expect(component.dmTyping()).toBe(true);

    socialServiceMock.typingUsers.set({ "peer-1": false });
    fixture.detectChanges();
    expect(component.dmTyping()).toBe(false);
  });

  it("resets stale matchmaking state when the queue is cancelled", () => {
    component.selectedGame.set({ id: "game-1" } as any);
    socialServiceMock.matchmakingStatus.set("matched");
    component.isMatchmaking.set(true);

    component.cancelMatchmaking();

    expect(matchmakingMock.cancelMatchQueue).toHaveBeenCalledWith("game-1");
    expect(matchmakingMock.clearMatchState).toHaveBeenCalled();
    expect(socialServiceMock.matchmakingStatus()).toBe("idle");
    expect(component.isMatchmaking()).toBe(false);
  });

  it("clears stale match state when engaging the AI bot after no rivals found", () => {
    component.selectedGame.set({ id: "game-1" } as any);
    socialServiceMock.matchmakingStatus.set("searching");

    component.engageAiBot();

    expect(matchmakingMock.clearMatchState).toHaveBeenCalled();
    expect(socialServiceMock.matchmakingStatus()).toBe("idle");
    expect(component.showBotOption()).toBe(false);
  });

  it("accepts a squad invite through the social layer and opens the party tab", () => {
    component.acceptPartyInvite("party-9");

    expect(socialServiceMock.acceptPartyInvite).toHaveBeenCalledWith("party-9");
    expect(component.activeHubTab()).toBe("party");
    expect(component.showRivalHub()).toBe(true);
  });

  it("declines a squad invite and notifies the user", () => {
    const snackbar = TestBed.inject(SnackbarService) as any;

    component.declinePartyInvite();

    expect(socialServiceMock.declinePartyInvite).toHaveBeenCalled();
    expect(snackbar.info).toHaveBeenCalledWith("SQUAD INVITE DECLINED");
  });

  it("routes neural sync accept/decline through the social layer", () => {
    socialServiceMock.acceptNeuralSyncRequest.mockReturnValueOnce(true);
    const snackbar = TestBed.inject(SnackbarService) as any;

    component.acceptNeuralSync("peer-2");
    expect(socialServiceMock.acceptNeuralSyncRequest).toHaveBeenCalledWith(
      "peer-2",
    );
    expect(snackbar.success).toHaveBeenCalledWith(
      "NEURAL SYNC APPROVED — EXCHANGING DATA",
    );

    component.declineNeuralSync();
    expect(socialServiceMock.declineNeuralSyncRequest).toHaveBeenCalled();
  });

  it("does not announce a neural sync the network never received", () => {
    socialServiceMock.acceptNeuralSyncRequest.mockReturnValueOnce(false);
    const snackbar = TestBed.inject(SnackbarService) as any;
    snackbar.success.mockClear();

    component.acceptNeuralSync("peer-2");

    expect(snackbar.success).not.toHaveBeenCalledWith(
      "NEURAL SYNC APPROVED — EXCHANGING DATA",
    );
    expect(snackbar.info).toHaveBeenCalledWith(
      "NEURAL SYNC UNAVAILABLE — NOT CONNECTED TO THE NETWORK",
    );
  });
  /*
   * Phone layout contract.
   *
   * The layouts below were tuned against the laid-out page — the phone header
   * wraps to ~160px, not the 64px desktop bar — and every one of those offsets
   * shipped through a green suite because jsdom cannot lay anything out. These
   * pin the wiring and the offsets to the component source so a future edit
   * cannot quietly reintroduce a covered header or an unreserved rail.
   */
  describe("phone layout contract", () => {
    const template = () =>
      readFileSync(join(__dirname, "tha-spot.component.html"), "utf8");
    const componentSource = () =>
      readFileSync(join(__dirname, "tha-spot.component.ts"), "utf8");
    const componentStyles = () =>
      readFileSync(join(__dirname, "tha-spot.component.css"), "utf8");

    it("flags spectating and an open sheet on the root container", () => {
      const rootTag = template().slice(0, template().indexOf(">"));
      expect(rootTag).toContain(
        '[class.spectating]="matchmaking.isSpectating()"',
      );
      expect(rootTag).toContain(
        '[class.sheet-open]="showRivalHub() || showIntelPanel()"',
      );
    });

    it("sets both flags from the signals they describe", () => {
      component.showRivalHub.set(true);
      expect(component.showRivalHub()).toBe(true);
      component.showRivalHub.set(false);
      component.showIntelPanel.set(true);
      expect(component.showIntelPanel()).toBe(true);
      component.showIntelPanel.set(false);
    });

    it("reserves the rail column in pixels, only while spectating", () => {
      const css = componentStyles();
      // rem drifted from the rail's real width once the root font scaled.
      expect(css).toContain("--spectator-rail-space: calc(86px + 10px + 12px)");
      expect(css).toMatch(
        /\.tha-spot-container\.spectating\s*\{[^}]*padding-right:\s*var\(--spectator-rail-space\)/,
      );
      expect(css).toMatch(/\.spectator-rail\s*\{[^}]*width:\s*86px/);
    });

    it("starts the phone sheets under the header and the sticky search bar", () => {
      const styles = componentSource() + componentStyles();
      // 160px wrapped header + 48px search bar, and 56 + 48 in short landscape.
      expect(styles).toContain(
        "inset: calc(208px + env(safe-area-inset-top, 0px)) 0 0 0;",
      );
      expect(styles).toContain("inset: 104px 0 0 0;");
    });

    it("drops the edge tabs below the open sheet header", () => {
      const styles = componentSource();
      expect(styles).toMatch(
        /\.tha-spot-container\.sheet-open \.rival-hub-toggle[\s\S]{0,160}\+ 284px/,
      );
      expect(styles).toMatch(
        /\.tha-spot-container\.sheet-open \.intel-toggle[\s\S]{0,160}\+ 332px/,
      );
      // Closed state clears the search bar, not the header.
      expect(styles).toMatch(
        /\.rival-hub-toggle,\s*\n\s*\.rival-hub-toggle\.panel-open,\s*\n\s*\.intel-toggle,[\s\S]{0,200}\+ 216px/,
      );
    });

    it("glides the tab move with the panel's own timing and honours reduced motion", () => {
      const styles = componentStyles() + componentSource();
      expect(styles).toContain("top 0.35s cubic-bezier(0.16, 1, 0.3, 1)");
      expect(styles).toMatch(
        /prefers-reduced-motion: reduce[\s\S]{0,400}\.rival-hub-toggle,[\s\S]{0,120}transition: none !important/,
      );
    });
  });

  describe("host capture warning", () => {
    it("warns while live with no capture at all", () => {
      component.liveStream.currentStream.set({
        id: 1,
        shareToken: "tok_live",
        hostId: "1",
        hostDisplayName: "NOVA",
        platform: "smuve",
        gameId: null,
        lobbyId: null,
        payload: null,
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: "https://x",
      });

      expect(component.hostFeedMissing()).toBe(true);
    });

    it("stays quiet once a live camera track is running", () => {
      component.liveStream.currentStream.set({
        id: 1,
        shareToken: "tok_live",
        hostId: "1",
        hostDisplayName: "NOVA",
        platform: "smuve",
        gameId: null,
        lobbyId: null,
        payload: null,
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: "https://x",
      });
      socialServiceMock.localStream.set({
        getVideoTracks: () => [{ readyState: "live" }],
      } as unknown as MediaStream);

      expect(component.hostFeedMissing()).toBe(false);
    });

    it("retries capture on tap and reports the outcome", async () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      const snackbar = TestBed.inject(SnackbarService);
      const retry = jest
        .spyOn(liveVideo, "retryHostFeed")
        .mockResolvedValue(true);

      await component.retryHostCapture();
      expect(retry).toHaveBeenCalled();
      expect(snackbar.success).toHaveBeenCalledWith(
        "CAMERA/MIC BACK ONLINE — VIEWERS CAN WATCH",
      );

      retry.mockResolvedValueOnce(false);
      await component.retryHostCapture();
      expect(snackbar.warning).toHaveBeenCalled();

      // A hard block cannot be re-prompted: say so instead of "still
      // unavailable", which reads like the button is broken.
      const blocked = jest
        .spyOn(liveVideo, "hostFeedBlocked")
        .mockReturnValue(true);
      retry.mockResolvedValueOnce(false);
      await component.retryHostCapture();
      expect(snackbar.warning).toHaveBeenLastCalledWith(
        "CAMERA BLOCKED — ALLOW THIS SITE IN BROWSER SETTINGS, THEN RETRY",
      );
      blocked.mockRestore();
    });

    it("stays quiet when the host is not live", () => {
      component.liveStream.currentStream.set(null);
      expect(component.hostFeedMissing()).toBe(false);
    });
  });

  describe("host takeover", () => {
    it("clears a replaced takeover when this tab starts a new broadcast", async () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      const liveStream = component.liveStream;
      const oldStream = {
        id: 1,
        shareToken: "tok_live",
        hostId: "1",
        hostDisplayName: "NOVA",
        platform: "smuve",
        gameId: null,
        lobbyId: null,
        payload: null,
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: "https://x/live",
      } as any;
      const nextStream = {
        ...oldStream,
        id: 2,
        shareToken: "tok_next",
        shareUrl: "https://x/next",
      };

      // This tab was replaced on the old broadcast. The next broadcast has a
      // new token, so the component effect must start hosting it and clear
      // the old takeover instead of leaving the tab stuck as a viewer.
      (liveVideo as any).replacedToken.set("tok_live");
      expect(liveVideo.hostReplacedFor(oldStream)).toBe(true);

      (liveStream as any).hostingToken.set("tok_next");
      liveStream.currentStream.set(nextStream);
      fakeSocket.connected = true;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(liveVideo.hostReplaced()).toBe(false);
      expect(liveVideo.hostReplacedFor(oldStream)).toBe(false);
      expect(liveVideo.hostReplacedFor(nextStream)).toBe(false);
      expect(fakeSocket.emit).toHaveBeenCalledWith(
        "live_stream_host_join",
        { token: "tok_next" },
      );

      liveVideo.stopHosting();
    });
  });

  describe("live reconnect banner", () => {
    it("stays hidden while nothing is being watched", () => {
      expect(component.liveFeedReconnecting()).toBe(false);
    });

    it("shows while a dropped feed or transport is being rebuilt", () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      liveVideo.watchingToken.set("tok_live");
      liveVideo.viewerTransportUp.set(true);
      // Presence is not the transport: an anonymous viewer has no social
      // socket at all, and must not be told its connection is lost.
      socialServiceMock.socketConnected.set(false);

      expect(component.liveFeedReconnecting()).toBe(false);

      liveVideo.recovering.set(true);
      expect(component.liveFeedReconnecting()).toBe(true);

      liveVideo.recovering.set(false);
      liveVideo.viewerTransportUp.set(false);
      expect(component.liveFeedReconnecting()).toBe(true);

      liveVideo.viewerTransportUp.set(true);
      expect(component.liveFeedReconnecting()).toBe(false);
    });

    it("wakes the transport and forces a fresh feed on tap", () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      const retry = jest.spyOn(liveVideo, "retryViewerFeed");
      const transport = jest.spyOn(liveVideo, "reconnectViewerTransport");

      component.reconnectLiveFeed();

      expect(socialServiceMock.reconnectSocket).toHaveBeenCalled();
      expect(transport).toHaveBeenCalled();
      expect(retry).toHaveBeenCalled();
    });

    it("opens the player from the token when the preview lookup fails", async () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      const watch = jest.spyOn(liveVideo, "watch").mockResolvedValue(undefined);
      jest
        .spyOn(component.liveStream, "peekViewerToken")
        .mockResolvedValue(null);
      jest
        .spyOn(component.liveStream, "loadActiveStreams")
        .mockResolvedValue(undefined);

      await component.watchLiveToken("tok_fallback");

      // A failed REST peek must not cost a viewer the feed: the player opens
      // from the token and signaling decides whether the room is really gone.
      expect(component.liveStream.inboundPreview()?.shareToken).toBe(
        "tok_fallback",
      );
      expect(watch).toHaveBeenCalledWith("tok_fallback");
    });
  });

  describe("friend go-live card", () => {
    it("joins the friend's broadcast and clears the card", async () => {
      const social = TestBed.inject(SocialNetworkingService);
      social.friendWentLive.set({
        hostId: "42",
        hostDisplayName: "NOVA",
        platform: "smuve",
        gameId: null,
        shareToken: "tok_friend",
        ts: 1,
      });
      const watchSpy = jest
        .spyOn(component, "watchLiveToken")
        .mockResolvedValue(undefined);

      (social.clearFriendLive as jest.Mock).mockImplementation(() =>
        social.friendWentLive.set(null),
      );

      await component.watchFriendLive();

      expect(watchSpy).toHaveBeenCalledWith("tok_friend");
      expect(social.clearFriendLive).toHaveBeenCalled();
    });

    it("does nothing when there is no card", async () => {
      const social = TestBed.inject(SocialNetworkingService);
      social.friendWentLive.set(null);
      const watchSpy = jest
        .spyOn(component, "watchLiveToken")
        .mockResolvedValue(undefined);

      await component.watchFriendLive();

      expect(watchSpy).not.toHaveBeenCalled();
      expect(social.clearFriendLive).not.toHaveBeenCalled();
    });
  });

  describe("viewer mix split", () => {
    let OriginalMediaStream: any;

    beforeEach(() => {
      OriginalMediaStream = (global as any).MediaStream;
      (global as any).MediaStream = class {
        tracks: any[];
        constructor(tracks: any[] = []) {
          this.tracks = [...tracks];
        }
        getTracks() {
          return [...this.tracks];
        }
        getVideoTracks() {
          return this.tracks.filter((t: any) => t.kind === "video");
        }
        getAudioTracks() {
          return this.tracks.filter((t: any) => t.kind === "audio");
        }
      };
    });

    afterEach(() => {
      (global as any).MediaStream = OriginalMediaStream;
      TestBed.inject(LiveVideoService).remoteStream.set(null);
    });

    it("splits camera/game pictures and follows the host source", () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      const camera = { kind: "video", id: "cam" };
      const game = { kind: "video", id: "game" };
      const mic = { kind: "audio", id: "mic" };
      const system = { kind: "audio", id: "sys" };
      liveVideo.remoteStream.set({
        getVideoTracks: () => [camera, game],
        getAudioTracks: () => [mic, system],
      } as any);
      TestBed.flushEffects();

      // Host contract: camera, game, mic, system.
      expect(component.viewerCameraStream()?.getTracks()).toEqual([camera]);
      expect(component.viewerGameVideoStream()?.getTracks()).toEqual([game]);
      expect(component.viewerVoiceStream()?.getTracks()).toEqual([mic]);
      // Game sound stays hidden until the host actually shares the screen.
      expect(component.viewerGameStream()).toBeNull();
      expect(component.viewerShowGame()).toBe(false);
      expect(component.viewerDisplayStream()?.getTracks()).toEqual([camera]);

      liveVideo.hostSharingScreen.set(true);
      TestBed.flushEffects();
      expect(component.viewerShowGame()).toBe(true);
      expect(component.viewerDisplayStream()?.getTracks()).toEqual([game]);
      expect(component.viewerGameStream()?.getTracks()).toEqual([system]);

      liveVideo.remoteStream.set(null);
      TestBed.flushEffects();
      expect(component.viewerCameraStream()).toBeNull();
      expect(component.viewerGameVideoStream()).toBeNull();
      expect(component.viewerVoiceStream()).toBeNull();
      expect(component.viewerGameStream()).toBeNull();
      expect(component.viewerDisplayStream()).toBeNull();
    });

    it("lets the viewer override the display until the next switch", () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      const camera = { kind: "video", id: "cam" };
      const game = { kind: "video", id: "game" };
      liveVideo.remoteStream.set({
        getVideoTracks: () => [camera, game],
        getAudioTracks: () => [],
      } as any);
      TestBed.flushEffects();

      // Host is sharing: the display auto-follows to the game.
      liveVideo.hostSharingScreen.set(true);
      TestBed.flushEffects();
      expect(component.viewerShowGame()).toBe(true);
      expect(component.viewerDisplayStream()?.getTracks()).toEqual([game]);

      // Manual CAM override holds until the next host announcement.
      component.viewerShowGame.set(false);
      TestBed.flushEffects();
      expect(component.viewerDisplayStream()?.getTracks()).toEqual([camera]);

      liveVideo.hostSharingScreen.set(false);
      TestBed.flushEffects();
      expect(component.viewerShowGame()).toBe(false);
      expect(component.viewerDisplayStream()?.getTracks()).toEqual([camera]);
    });

    it("never shows a silent slot the host is not publishing", () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      // The host went live already sharing the screen: the camera slot is
      // its disabled placeholder, so showing it is a black screen.
      const camera = { kind: "video", id: "cam", muted: true };
      const game = { kind: "video", id: "game", muted: false };
      liveVideo.remoteStream.set({
        getVideoTracks: () => [camera, game],
        getAudioTracks: () => [],
      } as any);
      TestBed.flushEffects();

      component.viewerShowGame.set(false);
      TestBed.flushEffects();
      expect(component.viewerDisplayStream()?.getTracks()).toEqual([game]);
    });

    it("falls back to camera when the game slot is empty", () => {
      const liveVideo = TestBed.inject(LiveVideoService);
      const camera = { kind: "video", id: "cam" };
      liveVideo.remoteStream.set({
        getVideoTracks: () => [camera],
        getAudioTracks: () => [],
      } as any);
      TestBed.flushEffects();

      component.viewerShowGame.set(true);
      TestBed.flushEffects();
      expect(component.viewerDisplayStream()?.getTracks()).toEqual([camera]);
    });
  });

  describe("preview lifecycle", () => {
    it("leaves one preview running across repeat PREVIEW clicks", async () => {
      let resolvePreview: (value: boolean) => void = () => undefined;
      socialServiceMock.startPreview.mockImplementation(() => {
        socialServiceMock.previewStarting.set(true);
        return new Promise<boolean>((resolve) => {
          resolvePreview = resolve;
        });
      });

      const first = component.startStreamPreview();
      const second = component.startStreamPreview();

      expect(socialServiceMock.startPreview).toHaveBeenCalledTimes(1);
      expect(socialServiceMock.stopPreview).not.toHaveBeenCalled();

      resolvePreview(true);
      socialServiceMock.previewStarting.set(false);
      socialServiceMock.previewActive.set(true);
      await first;
      await second;

      expect(socialServiceMock.startPreview).toHaveBeenCalledTimes(1);
      expect(socialServiceMock.stopPreview).not.toHaveBeenCalled();
    });

    it("dispatches a real DOM double-click to the mounted PREVIEW control", async () => {
      let resolvePreview: (value: boolean) => void = () => undefined;
      socialServiceMock.startPreview.mockImplementation(() => {
        socialServiceMock.previewStarting.set(true);
        return new Promise<boolean>((resolve) => {
          resolvePreview = resolve;
        });
      });
      fixture.detectChanges();
      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll("button"),
      ) as HTMLButtonElement[];
      const start = buttons.find((button) =>
        button.textContent?.includes("START PREVIEW"),
      );
      const stop = buttons.find((button) =>
        button.textContent?.includes("STOP PREVIEW"),
      );
      expect(start).toBeTruthy();
      expect(stop).toBeTruthy();
      expect(stop!.disabled).toBe(true);
      expect(start!.type).toBe("button");
      expect(stop!.type).toBe("button");
      expect(start!.parentElement).toBe(stop!.parentElement);
      expect(
        Array.from(start!.parentElement!.querySelectorAll("button")).indexOf(
          start!,
        ),
      ).toBeLessThan(
        Array.from(stop!.parentElement!.querySelectorAll("button")).indexOf(
          stop!,
        ),
      );

      start!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      start!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      fixture.detectChanges();

      expect(socialServiceMock.startPreview).toHaveBeenCalledTimes(1);
      expect(socialServiceMock.stopPreview).not.toHaveBeenCalled();
      expect(stop!.isConnected).toBe(true);

      resolvePreview(true);
      await Promise.resolve();
    });

    it("reports a deliberate pending cancel without a failure message", async () => {
      let resolvePreview: (value: boolean) => void = () => undefined;
      socialServiceMock.startPreview.mockImplementation(() => {
        socialServiceMock.previewStarting.set(true);
        return new Promise<boolean>((resolve) => {
          resolvePreview = resolve;
        });
      });
      socialServiceMock.stopPreview.mockImplementation(() => {
        socialServiceMock.previewStarting.set(false);
        socialServiceMock.previewActive.set(false);
        socialServiceMock.previewCancelled.set(true);
      });
      const snackbar = TestBed.inject(SnackbarService);

      const pending = component.startStreamPreview();
      component.stopStreamPreview();

      expect(socialServiceMock.stopPreview).toHaveBeenCalledTimes(1);
      expect(snackbar.info).toHaveBeenCalledWith(
        "PREVIEW CANCELLED — CAPTURE RELEASED",
      );

      resolvePreview(false);
      await pending;

      expect(snackbar.error).not.toHaveBeenCalled();
    });

    it("does not stop an immediately-started preview on the second click", async () => {
      socialServiceMock.startPreview.mockImplementation(() => {
        // Fast permission path: the capture is running before the second
        // click of a double-click is delivered.
        socialServiceMock.previewActive.set(true);
        socialServiceMock.previewStarting.set(false);
        return Promise.resolve(true);
      });

      const first = component.startStreamPreview();
      const second = component.startStreamPreview();
      await Promise.all([first, second]);

      expect(socialServiceMock.startPreview).toHaveBeenCalledTimes(1);
      expect(socialServiceMock.stopPreview).not.toHaveBeenCalled();
      expect(socialServiceMock.previewActive()).toBe(true);
    });

    it("hands the active preview to the real GO LIVE row handoff", async () => {
      const tokens = TestBed.inject(TokenService);
      const http = TestBed.inject(HttpTestingController);
      tokens.setToken("TKN");
      profileServiceMock.profile.set({
        ...profileServiceMock.profile(),
        id: "77",
        artistName: "JEFF",
      });
      socialServiceMock.localStream.set({
        getVideoTracks: () => [{ kind: "video", id: "preview-track" }],
        getAudioTracks: () => [],
        getTracks: () => [{ kind: "video", id: "preview-track" }],
      } as any);
      socialServiceMock.startPreview.mockImplementation(() => {
        socialServiceMock.previewActive.set(true);
        socialServiceMock.previewStarting.set(false);
        return Promise.resolve(true);
      });
      socialServiceMock.startStream.mockImplementation(async () => {
        // LiveStreamService must hand the existing preview to startStream,
        // which reuses this local capture instead of prompting again.
        expect(socialServiceMock.localStream()).not.toBeNull();
        socialServiceMock.previewActive.set(false);
        socialServiceMock.isStreaming.set(true);
        return true;
      });
      jest.spyOn(component.liveVideo, "startHosting").mockImplementation(() => undefined);

      await component.startStreamPreview();
      component.showGoLivePicker.set(true);

      const golive = component.confirmGoLive("smuve");
      const preflight = http.expectOne((req) =>
        req.url.endsWith("/api/broadcast/destinations"),
      );
      preflight.flush([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const request = http.expectOne(
        (req) => req.method === "POST" && req.url.endsWith("/users/77/live-streams"),
      );
      request.flush({
        id: 11,
        shareToken: "tok-live",
        hostId: "77",
        hostDisplayName: "JEFF",
        platform: "smuve",
        gameId: null,
        lobbyId: null,
        payload: null,
        active: true,
        startedAt: new Date().toISOString(),
        endedAt: null,
        viewerJoins: 0,
        shareUrl: "https://x/live/tok-live",
      });
      await golive;

      expect(socialServiceMock.startStream).toHaveBeenCalledTimes(1);
      expect(socialServiceMock.startStream).toHaveBeenCalledWith("smuve");
      expect(socialServiceMock.stopPreview).not.toHaveBeenCalled();
      expect(component.liveStream.pendingGolive()).toBeNull();
      expect(component.liveStream.currentStream()?.shareToken).toBe("tok-live");
      expect(component.liveStream.currentStream()?.active).toBe(true);
      expect(component.showGoLivePicker()).toBe(false);

      const end = component.liveStream.endStream();
      const endRequest = http.expectOne((req) =>
        req.url.endsWith("/users/77/live-streams/end"),
      );
      endRequest.flush({ success: true, streamId: 11 });
      await end;
      tokens.setToken(null);
    });

    it("sends every selected destination in one Go Live request", async () => {
      const golive = jest
        .spyOn(component.liveStream, "golive")
        .mockResolvedValue(null);

      component.toggleGoLivePlatform("kick");
      component.toggleGoLivePlatform("facebook");
      await component.confirmGoLive();

      expect(golive).toHaveBeenCalledTimes(1);
      expect(golive).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: "smuve",
          destinations: ["smuve", "kick", "facebook"],
        }),
      );
      golive.mockRestore();
    });

    it("maps the Facebook CTA to the Facebook Go Live destination", async () => {
      const golive = jest
        .spyOn(component.liveStream, "golive")
        .mockResolvedValue(null);

      await component.goLive("Facebook");

      expect(golive).toHaveBeenCalledWith(
        expect.objectContaining({ platform: "facebook" }),
      );
      expect(component.activeHubTab()).toBe("stream");
    });

    it("releases a pending preview when Tha Spot is left", () => {
      socialServiceMock.previewStarting.set(true);

      component.ngOnDestroy();

      expect(socialServiceMock.stopPreview).toHaveBeenCalled();
    });
  });

});
