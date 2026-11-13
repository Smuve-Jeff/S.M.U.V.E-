import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { LiveVideoService } from "../../services/live-video.service";
import type { LiveViewerConnection } from "../../services/live-video.service";
import type { ViewerHealthThresholds } from "../../services/viewer-health";

type ViewerHealth = "good" | "caution" | "poor" | "unknown";

/**
 * TURN relay health plus the actual media path of every viewer, shared by all
 * Go Live surfaces so their labels and thresholds cannot drift apart. Hosts
 * theme it with the CSS custom properties declared in its stylesheet.
 */
@Component({
  selector: "app-live-relay-strip",
  standalone: true,
  templateUrl: "./live-relay-strip.component.html",
  styleUrls: ["./live-relay-strip.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveRelayStripComponent {
  private liveVideo = inject(LiveVideoService);

  readonly turnHealth = this.liveVideo.turnHealth;
  readonly viewers = this.liveVideo.viewerConnections;
  readonly thresholds = this.liveVideo.viewerHealthThresholds;
  readonly viewerHealthLabel = this.liveVideo.viewerHealthLabel;

  readonly healthLabel = computed(() => {
    const health = this.turnHealth();
    if (!health) return "CHECKING...";
    if (health.source === "cloudflare") return "MANAGED TURN READY";
    if (health.source === "static") {
      return health.managed ? "STATIC TURN FALLBACK" : "STATIC TURN";
    }
    return health.managed ? "TURN DEGRADED" : "NO TURN - DIRECT ONLY";
  });

  readonly healthTone = computed(() => {
    const health = this.turnHealth();
    if (!health) return "pending";
    if (health.available) return "ok";
    return health.managed ? "warn" : "off";
  });

  /** "150/300 MS · 4000/1200 KBPS" for the active preset. */
  limitsLabel(): string {
    const limits = this.thresholds();
    return `${limits.rttFairMs}/${limits.rttPoorMs} MS · ${limits.kbpsFair}/${limits.kbpsPoor} KBPS`;
  }

  /** Plain-language reading of the thresholds, shown on the health rows. */
  healthExplainer(): string {
    const limits = this.thresholds();
    return `Fair above ${limits.rttFairMs} ms RTT or below ${limits.kbpsFair} kbps; poor above ${limits.rttPoorMs} ms or below ${limits.kbpsPoor} kbps.`;
  }

  /**
   * A relayed path is a caution on its own; high latency, low bitrate, or a
   * failed peer is poor. Missing metrics stay unknown so they are not flagged
   * before the first sample lands.
   */
  connectionHealth(
    viewer: LiveViewerConnection,
    thresholds: ViewerHealthThresholds,
  ): ViewerHealth {
    if (viewer.state === "failed") return "poor";
    const rtt = viewer.rttMs ?? null;
    const kbps = viewer.kbps ?? null;
    if (
      (rtt !== null && rtt > thresholds.rttPoorMs) ||
      (kbps !== null && kbps < thresholds.kbpsPoor)
    ) {
      return "poor";
    }
    if (
      viewer.state === "relay" ||
      (rtt !== null && rtt > thresholds.rttFairMs) ||
      (kbps !== null && kbps < thresholds.kbpsFair)
    ) {
      return "caution";
    }
    if (rtt !== null || kbps !== null) return "good";
    return "unknown";
  }

  /** Tooltip text explaining why a chip has its tone. */
  healthNote(
    viewer: LiveViewerConnection,
    thresholds: ViewerHealthThresholds,
  ): string {
    const notes: string[] = [];
    if (viewer.state === "failed") notes.push("connection failed");
    if (viewer.state === "relay") notes.push("relayed through TURN");
    if (viewer.rttMs != null && viewer.rttMs > thresholds.rttFairMs) {
      const rtt = Math.round(viewer.rttMs);
      notes.push(
        viewer.rttMs > thresholds.rttPoorMs
          ? `high round-trip time (${rtt} ms > ${thresholds.rttPoorMs} ms)`
          : `elevated round-trip time (${rtt} ms > ${thresholds.rttFairMs} ms)`,
      );
    }
    if (viewer.kbps != null && viewer.kbps < thresholds.kbpsFair) {
      const kbps = Math.round(viewer.kbps);
      notes.push(
        viewer.kbps < thresholds.kbpsPoor
          ? `low bitrate (${kbps} kbps < ${thresholds.kbpsPoor} kbps)`
          : `reduced bitrate (${kbps} kbps < ${thresholds.kbpsFair} kbps)`,
      );
    }
    return notes.length ? notes.join(" · ") : "direct media path";
  }

  /** "84 MS · 1.8 MBPS", with whichever half is available. */
  metricsLabel(viewer: LiveViewerConnection): string {
    return [this.formatRtt(viewer.rttMs), this.formatBitrate(viewer.kbps)]
      .filter((part) => part.length > 0)
      .join(" · ");
  }

  formatRtt(rttMs: number | null | undefined): string {
    if (typeof rttMs !== "number" || !Number.isFinite(rttMs)) return "";
    return `${Math.round(rttMs)} MS`;
  }

  formatBitrate(kbps: number | null | undefined): string {
    if (typeof kbps !== "number" || !Number.isFinite(kbps)) return "";
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} MBPS`;
    return `${Math.max(0, Math.round(kbps))} KBPS`;
  }

  /** Direct vs relayed viewer counts from the host's peer stats. */
  readonly routeSummary = computed(() => {
    const viewers = this.viewers();
    if (!viewers.length) return "NO VIEWERS";
    const count = (state: "connecting" | "direct" | "relay" | "failed") =>
      viewers.filter((viewer) => viewer.state === state).length;
    const parts: string[] = [];
    if (count("direct")) parts.push(`${count("direct")} DIRECT`);
    if (count("relay")) parts.push(`${count("relay")} RELAY`);
    if (count("connecting")) parts.push(`${count("connecting")} CONNECTING`);
    if (count("failed")) parts.push(`${count("failed")} FAILED`);
    const thresholds = this.thresholds();
    const poor = viewers.filter(
      (viewer) => this.connectionHealth(viewer, thresholds) === "poor",
    ).length;
    if (poor) parts.push(`${poor} POOR`);
    return parts.join(" | ");
  });
}
