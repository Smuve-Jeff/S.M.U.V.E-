import { ComponentFixture, TestBed } from "@angular/core/testing";
import { WritableSignal, signal } from "@angular/core";
import { LiveRelayStripComponent } from "./live-relay-strip.component";
import { LiveVideoService } from "../../services/live-video.service";
import { DEFAULT_VIEWER_HEALTH } from "../../services/viewer-health";
import type { ViewerHealthThresholds } from "../../services/viewer-health";
import type {
  LiveTurnHealth,
  LiveViewerConnection,
} from "../../services/live-video.service";

describe("LiveRelayStripComponent", () => {
  let fixture: ComponentFixture<LiveRelayStripComponent>;
  let turnHealth: WritableSignal<LiveTurnHealth | null>;
  let viewerConnections: WritableSignal<LiveViewerConnection[]>;
  let thresholds: WritableSignal<ViewerHealthThresholds>;
  let healthLabel: WritableSignal<string>;

  beforeEach(async () => {
    turnHealth = signal<LiveTurnHealth | null>(null);
    viewerConnections = signal<LiveViewerConnection[]>([]);
    thresholds = signal<ViewerHealthThresholds>({ ...DEFAULT_VIEWER_HEALTH });
    healthLabel = signal("DEFAULT");
    await TestBed.configureTestingModule({
      imports: [LiveRelayStripComponent],
      providers: [
        {
          provide: LiveVideoService,
          useValue: {
            turnHealth,
            viewerConnections,
            viewerHealthThresholds: thresholds,
            viewerHealthLabel: healthLabel,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LiveRelayStripComponent);
    fixture.detectChanges();
  });

  const values = () =>
    Array.from(
      fixture.nativeElement.querySelectorAll(
        ".relay-value",
      ) as NodeListOf<HTMLElement>,
    ).map((element) => element.textContent?.trim());

  it("shows a checking state before health arrives", () => {
    expect(values()).toEqual([
      "CHECKING...",
      "NO VIEWERS",
      "DEFAULT",
      "120/250 MS · 1500/500 KBPS",
    ]);
    expect(
      fixture.nativeElement
        .querySelector(".relay-value")
        ?.classList.contains("pending"),
    ).toBe(true);
  });

  it("renders managed TURN readiness and direct/relay counts", () => {
    turnHealth.set({
      configured: true,
      managed: true,
      available: true,
      source: "cloudflare",
    });
    viewerConnections.set([
      { socketId: "a", name: "NOVA", state: "direct" },
      { socketId: "b", name: null, state: "relay" },
    ]);
    fixture.detectChanges();

    expect(values()).toEqual([
      "MANAGED TURN READY",
      "1 DIRECT | 1 RELAY",
      "DEFAULT",
      "120/250 MS · 1500/500 KBPS",
    ]);
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll(
        ".relay-chip",
      ) as NodeListOf<HTMLElement>,
    ).map((element) => element.textContent?.trim());
    expect(chips).toEqual(["NOVA · direct", "Viewer 2 · relay"]);
    expect(
      fixture.nativeElement
        .querySelector(".relay-value")
        ?.classList.contains("ok"),
    ).toBe(true);
  });

  it("shows round-trip time and bitrate beside each route", () => {
    turnHealth.set({
      configured: true,
      managed: true,
      available: true,
      source: "cloudflare",
    });
    viewerConnections.set([
      { socketId: "a", name: "NOVA", state: "relay", rttMs: 84, kbps: 1800 },
      { socketId: "b", name: "ACE", state: "direct", rttMs: 32, kbps: 1800 },
    ]);
    fixture.detectChanges();

    const chips = Array.from(
      fixture.nativeElement.querySelectorAll(
        ".relay-chip",
      ) as NodeListOf<HTMLElement>,
    ).map((element) => element.textContent?.replace(/\s+/g, " ").trim());
    expect(chips).toEqual([
      "NOVA · relay 84 MS · 1.8 MBPS",
      "ACE · direct 32 MS · 1.8 MBPS",
    ]);
  });

  it("flags a poor link with its reason, while a relayed link is only a caution", () => {
    turnHealth.set({
      configured: true,
      managed: true,
      available: true,
      source: "cloudflare",
    });
    viewerConnections.set([
      { socketId: "a", name: "NOVA", state: "direct", rttMs: 310, kbps: 1800 },
      { socketId: "b", name: "ACE", state: "relay", rttMs: 84, kbps: 1800 },
    ]);
    fixture.detectChanges();

    const chips = Array.from(
      fixture.nativeElement.querySelectorAll(
        ".relay-chip",
      ) as NodeListOf<HTMLElement>,
    );
    expect(chips[0].classList.contains("poor")).toBe(true);
    expect(chips[0].textContent).toContain("POOR");
    expect(chips[0].getAttribute("title")).toContain("high round-trip time");
    expect(chips[1].classList.contains("relay")).toBe(true);
    expect(chips[1].classList.contains("poor")).toBe(false);
    expect(chips[1].getAttribute("title")).toContain("relayed through TURN");
    expect(values()[1]).toBe("1 DIRECT | 1 RELAY | 1 POOR");
  });

  it("flags low bitrate as a poor link", () => {
    viewerConnections.set([
      { socketId: "a", name: "LOW", state: "direct", rttMs: 30, kbps: 120 },
    ]);
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector(
      ".relay-chip",
    ) as HTMLElement;
    expect(chip.classList.contains("poor")).toBe(true);
    expect(chip.getAttribute("title")).toContain("low bitrate");
  });

  it("uses the thresholds of the active delivery preset", () => {
    // 310 ms is poor under the defaults, but only a caution for a preset
    // that expects slower, higher-bitrate delivery.
    thresholds.set({
      rttFairMs: 300,
      rttPoorMs: 500,
      kbpsFair: 4000,
      kbpsPoor: 1200,
    });
    viewerConnections.set([
      { socketId: "a", name: "NOVA", state: "direct", rttMs: 310, kbps: 5000 },
    ]);
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector(
      ".relay-chip",
    ) as HTMLElement;
    expect(chip.classList.contains("poor")).toBe(false);
    expect(chip.getAttribute("title")).toContain("elevated round-trip time");

    // The same viewer becomes poor once the preset demands tighter latency.
    thresholds.set({
      rttFairMs: 100,
      rttPoorMs: 200,
      kbpsFair: 4000,
      kbpsPoor: 1200,
    });
    fixture.detectChanges();
    expect(chip.classList.contains("poor")).toBe(true);
  });

  it("explains the active preset limits and why a viewer is flagged", () => {
    healthLabel.set("CinemaScope 4K");
    thresholds.set({
      rttFairMs: 150,
      rttPoorMs: 300,
      kbpsFair: 4000,
      kbpsPoor: 1200,
    });
    viewerConnections.set([
      { socketId: "a", name: "NOVA", state: "direct", rttMs: 310, kbps: 1800 },
    ]);
    fixture.detectChanges();

    expect(values().slice(2)).toEqual([
      "CinemaScope 4K",
      "150/300 MS · 4000/1200 KBPS",
    ]);
    const limitValue = fixture.nativeElement.querySelectorAll(
      ".relay-value",
    )[3] as HTMLElement;
    expect(limitValue.getAttribute("title")).toContain(
      "Fair above 150 ms RTT or below 4000 kbps",
    );
    expect(limitValue.getAttribute("title")).toContain(
      "poor above 300 ms or below 1200 kbps",
    );
    const chip = fixture.nativeElement.querySelector(
      ".relay-chip",
    ) as HTMLElement;
    expect(chip.getAttribute("title")).toContain("310 ms > 300 ms");
    expect(chip.getAttribute("title")).toContain("1800 kbps < 4000 kbps");
  });

  it("flags a degraded managed relay when no TURN server came back", () => {
    turnHealth.set({
      configured: true,
      managed: true,
      available: false,
      source: "none",
    });
    fixture.detectChanges();

    expect(values()[0]).toBe("TURN DEGRADED");
    expect(
      fixture.nativeElement
        .querySelector(".relay-value")
        ?.classList.contains("warn"),
    ).toBe(true);
  });

  it("shows static TURN and a no-turn fallback", () => {
    turnHealth.set({
      configured: true,
      managed: false,
      available: true,
      source: "static",
    });
    fixture.detectChanges();
    expect(values()[0]).toBe("STATIC TURN");

    turnHealth.set({
      configured: false,
      managed: false,
      available: false,
      source: "none",
    });
    fixture.detectChanges();
    expect(values()[0]).toBe("NO TURN - DIRECT ONLY");
  });
});
