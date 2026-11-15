import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { SocialNetworkingService } from './social-networking.service';
import { SnackbarService } from './snackbar.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { createTestPattern } from './test-pattern';
import { WhipPublisher } from './whip-publisher';

export type IngestPlatform = 'twitch' | 'kick';

interface DestinationStatusDto {
  platform?: string;
  ready?: boolean;
  detail?: string;
}

interface DestinationsResponse {
  platforms?: DestinationStatusDto[];
  relayConfigured?: boolean;
}

interface IngestSessionDto {
  platform?: string;
  relayId?: string;
  whipUrl?: string;
}

/**
 * Push the host's capture to a connected channel.
 *
 * The server resolves the provider's RTMP destination (Twitch over Helix, Kick
 * from the dashboard values the host pasted) and opens a relay session; the
 * browser only ever receives a WHIP URL, never a stream key. Destination state
 * is re-read on sign-in so the panel shows what is actually ready.
 */
@Injectable({ providedIn: 'root' })
export class BroadcastIngestService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);
  private readonly profile = inject(UserProfileService);
  private readonly social = inject(SocialNetworkingService);
  private readonly snackbar = inject(SnackbarService);
  private readonly whip = inject(WhipPublisher);

  readonly platforms: readonly { id: IngestPlatform; label: string }[] = [
    { id: 'twitch', label: 'TWITCH' },
    { id: 'kick', label: 'KICK' },
  ];

  readonly destinations = signal<
    Partial<Record<IngestPlatform, DestinationStatusDto>>
  >({});
  readonly relayConfigured = signal(true);
  readonly loading = signal(false);
  /** The platform whose push is starting, if any. */
  readonly pushing = signal<IngestPlatform | null>(null);
  readonly state = this.whip.state;
  readonly error = this.whip.error;

  /**
   * Relay watchdog verdict for the live push. The relay knows whether ffmpeg is
   * still writing to the provider; the panel shows it rather than guessing.
   */
  readonly stall = signal<{ stalled: boolean; stalledForMs: number }>({
    stalled: false,
    stalledForMs: 0,
  });

  /** What the provider is actually receiving, as the relay measures it. */
  readonly quality = signal<{
    bitrateKbps: number;
    drops: number;
    silentMs: number;
  }>({ bitrateKbps: 0, drops: 0, silentMs: 0 });

  /**
   * Relay-driven recovery: after the grace period the relay restarts ffmpeg
   * itself, so the panel reports the reconnect instead of asking the host to.
   */
  readonly recovery = signal<{
    recovering: boolean;
    recoveries: number;
    gaveUp: boolean;
  }>({ recovering: false, recoveries: 0, gaveUp: false });

  /** Result of the last relay self-test, shown next to the button. */
  readonly selfTest = signal<{ status: 'idle' | 'running' | 'pass' | 'fail'; detail: string }>({
    status: 'idle',
    detail: '',
  });

  private relayId: string | null = null;
  private egressTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const userId = this.profile.profile()?.id ?? '';
      if (!userId) {
        this.destinations.set({});
        return;
      }
      void this.load();
    });

    // A camera ↔ game switch replaces the outgoing video track in place, which
    // is what keeps the provider feed alive across the switch.
    effect(() => {
      this.social.videoSource();
      if (!this.relayId) return;
      const stream = this.social.localStream();
      this.whip.replaceVideoTrack(stream?.getVideoTracks()[0] ?? null);
    });

    // The push is part of the broadcast: ending the stream ends it too.
    effect(() => {
      if (this.social.isStreaming() || !this.relayId) return;
      void this.stop();
    });
  }

  ready(platform: IngestPlatform): boolean {
    return !!this.destinations()[platform]?.ready;
  }

  detail(platform: IngestPlatform): string {
    return this.destinations()[platform]?.detail ?? '';
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.get<DestinationsResponse>(this.endpoint('/destinations'), {
          headers: this.headers(),
        }),
      );
      const next: Partial<Record<IngestPlatform, DestinationStatusDto>> = {};
      for (const row of response?.platforms ?? []) {
        const id = String(row.platform ?? '').toLowerCase() as IngestPlatform;
        if (id === 'twitch' || id === 'kick') next[id] = row;
      }
      this.destinations.set(next);
      this.relayConfigured.set(response?.relayConfigured !== false);
    } catch {
      // Signed out or offline: the panel keeps its last known state.
    } finally {
      this.loading.set(false);
    }
  }

  /** Store the Kick URL + key; the key is never echoed back. */
  async saveKick(rtmpUrl: string, streamKey: string): Promise<boolean> {
    try {
      const status = await firstValueFrom(
        this.http.put<DestinationStatusDto>(
          this.endpoint('/destinations/kick'),
          { rtmpUrl, streamKey },
          { headers: this.headers() },
        ),
      );
      this.destinations.update((current) => ({ ...current, kick: status }));
      this.snackbar.success('KICK DESTINATION SAVED');
      return true;
    } catch (error) {
      this.snackbar.error(this.describe(error));
      return false;
    }
  }

  async start(platform: IngestPlatform): Promise<void> {
    const stream = this.social.localStream();
    if (!stream) {
      this.snackbar.warning('NO CAPTURE YET — SWITCH THE CAMERA ON FIRST');
      return;
    }
    this.pushing.set(platform);
    try {
      const session = await firstValueFrom(
        this.http.post<IngestSessionDto>(
          this.endpoint(`/ingest/${platform}`),
          {},
          { headers: this.headers() },
        ),
      );
      if (!session?.whipUrl) throw new Error('THE RELAY RETURNED NO PUBLISH URL');
      this.relayId = session.relayId ?? null;
      const started = await this.whip.start(session.whipUrl, stream);
      if (!started) {
        await this.releaseRelay();
        this.snackbar.error(
          this.whip.error() ?? `${platform.toUpperCase()} PUSH FAILED`,
        );
        return;
      }
      this.watchEgress(this.relayId);
      this.snackbar.success(`PUSHING TO ${platform.toUpperCase()}`);
    } catch (error) {
      this.snackbar.error(this.describe(error));
    } finally {
      this.pushing.set(null);
    }
  }

  async stop(): Promise<void> {
    this.stopWatching();
    await this.whip.stop();
    await this.releaseRelay();
    this.snackbar.info('BROADCAST PUSH STOPPED');
  }

  /**
   * Ask the relay every few seconds whether the push is still going out.
   *
   * The browser can only see its own WHIP upload; if the RTMP half dies the
   * capture looks perfectly healthy on this side. Polling the relay is what
   * makes that visible while the host can still do something about it.
   */
  private watchEgress(relayId: string | null): void {
    this.stopWatching();
    if (!relayId) return;
    this.egressTimer = setInterval(() => void this.refreshEgress(relayId), 5_000);
  }

  private stopWatching(): void {
    if (this.egressTimer) clearInterval(this.egressTimer);
    this.egressTimer = null;
    this.stall.set({ stalled: false, stalledForMs: 0 });
    this.quality.set({ bitrateKbps: 0, drops: 0, silentMs: 0 });
    this.recovery.set({ recovering: false, recoveries: 0, gaveUp: false });
  }

  private async refreshEgress(relayId: string): Promise<void> {
    try {
      const status = await firstValueFrom(
        this.http.get<{
          stalled?: boolean;
          stalledForMs?: number;
          bitrateKbps?: number;
          drops?: number;
          silentMs?: number;
          recoveries?: number;
          recovering?: boolean;
          recoveryGaveUp?: boolean;
        }>(this.endpoint(`/ingest/${encodeURIComponent(relayId)}`), {
          headers: this.headers(),
        }),
      );
      this.stall.set({
        stalled: status?.stalled === true,
        stalledForMs: Number(status?.stalledForMs ?? 0) || 0,
      });
      this.quality.set({
        bitrateKbps: Number(status?.bitrateKbps ?? 0) || 0,
        drops: Number(status?.drops ?? 0) || 0,
        silentMs: Number(status?.silentMs ?? 0) || 0,
      });
      this.recovery.set({
        recovering: status?.recovering === true,
        recoveries: Number(status?.recoveries ?? 0) || 0,
        gaveUp: status?.recoveryGaveUp === true,
      });
    } catch (error) {
      // A session the relay no longer knows about is not a stall: stop asking.
      if ((error as { status?: number } | null)?.status === 404) this.stopWatching();
    }
  }

  /** What the relay is doing about a silent push, if it is doing anything. */
  recoveryNote(): string {
    if (this.state() !== 'live') return '';
    const { recovering, gaveUp } = this.recovery();
    if (recovering) {
      return 'RELAY IS RECONNECTING THE PUSH — THE PROVIDER MAY SHOW A SHORT GAP';
    }
    if (gaveUp) {
      return 'THE RELAY COULD NOT RECONNECT — STOP AND PUSH AGAIN';
    }
    return '';
  }

  /** One line for the panel while the provider has stopped receiving. */
  stallNote(): string {
    const { stalled, stalledForMs } = this.stall();
    if (!stalled) return '';
    const seconds = Math.max(1, Math.round(stalledForMs / 1_000));
    return `PROVIDER SILENT FOR ${seconds}S — THE RELAY IS STILL RECEIVING, SO CHECK ITS RTMP EGRESS`;
  }

  /**
   * One line of evidence that the provider is being fed: the bitrate the relay
   * measures on the egress side, and how many drops this push has survived.
   */
  qualityNote(): string {
    if (this.state() !== 'live') return '';
    const { bitrateKbps, drops, silentMs } = this.quality();
    const rate =
      bitrateKbps > 0
        ? `${Math.round(bitrateKbps).toLocaleString('en-US')} KBPS`
        : 'NO BYTES YET';
    const history =
      drops === 0
        ? 'NO DROPS'
        : `${drops} DROP${drops === 1 ? '' : 'S'} (${Math.round(silentMs / 1_000)}S SILENT)`;
    const reboots = this.recovery().recoveries;
    const suffix =
      reboots > 0 ? ` · ${reboots} RECONNECT${reboots === 1 ? '' : 'S'}` : '';
    return `EGRESS ${rate} · ${history}${suffix}`;
  }

  /**
   * Prove the media path before a real broadcast: publish a generated pattern
   * with the same WHIP publisher a host uses, then ask the relay what arrived.
   * A byte counter above zero is the difference between "the URL was accepted"
   * and "video reached the RTMP side".
   */
  async runSelfTest(): Promise<void> {
    if (this.selfTest().status === 'running') return;
    const pattern = createTestPattern();
    if (!pattern) {
      this.selfTest.set({
        status: 'fail',
        detail: 'THIS BROWSER CANNOT GENERATE A TEST PATTERN',
      });
      return;
    }

    this.selfTest.set({ status: 'running', detail: 'PUBLISHING A TEST PATTERN…' });
    let relayId: string | null = null;
    try {
      const session = await firstValueFrom(
        this.http.post<{ relayId?: string; whipUrl?: string }>(
          this.endpoint('/selftest'),
          {},
          { headers: this.headers() },
        ),
      );
      if (!session?.relayId || !session.whipUrl) {
        throw new Error('THE RELAY RETURNED NO TEST SESSION');
      }
      relayId = session.relayId;
      const started = await this.whip.start(session.whipUrl, pattern.stream);
      if (!started) throw new Error(this.whip.error() ?? 'PUBLISH FAILED');

      // Long enough for ICE, an RTSP connection and a few seconds of frames.
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      const status = await firstValueFrom(
        this.http.get<{ ready?: boolean; bytesReceived?: number; tracks?: unknown[] }>(
          this.endpoint(`/selftest/${relayId}`),
          { headers: this.headers() },
        ),
      );
      const bytes = Number(status?.bytesReceived ?? 0);
      const tracks = Array.isArray(status?.tracks) ? status.tracks.length : 0;
      if (status?.ready && bytes > 0) {
        this.selfTest.set({
          status: 'pass',
          detail: `MEDIA CONFIRMED — ${Math.max(1, Math.round(bytes / 1024))} KB, ${tracks} TRACK${tracks === 1 ? '' : 'S'}`,
        });
        this.snackbar.success('SELF-TEST PASSED');
      } else {
        this.selfTest.set({
          status: 'fail',
          detail: 'THE RELAY RECEIVED NO MEDIA — CHECK THE WHIP URL, TLS AND UDP',
        });
        this.snackbar.error('SELF-TEST FAILED');
      }
    } catch (error) {
      const detail = this.describe(error);
      this.selfTest.set({ status: 'fail', detail });
      this.snackbar.error(detail);
    } finally {
      await this.whip.stop();
      pattern.stop();
      if (relayId) {
        try {
          await firstValueFrom(
            this.http.delete(this.endpoint(`/selftest/${relayId}`), {
              headers: this.headers(),
            }),
          );
        } catch {
          // The relay's own self-test timeout closes it.
        }
      }
    }
  }

  private async releaseRelay(): Promise<void> {
    const id = this.relayId;
    this.relayId = null;
    if (!id) return;
    try {
      await firstValueFrom(
        this.http.delete(this.endpoint(`/ingest/${encodeURIComponent(id)}`), {
          headers: this.headers(),
        }),
      );
    } catch {
      // The relay's idle timeout closes a session we could not tear down.
    }
  }

  /** Prefer the server's own sentence over a status code. */
  private describe(error: unknown): string {
    const body = (error as { error?: { error?: unknown } } | null)?.error;
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    if (message) return message.toUpperCase();
    const fallback = (error as { message?: unknown } | null)?.message;
    return typeof fallback === 'string' && fallback.trim()
      ? fallback.trim().toUpperCase()
      : 'BROADCAST PUSH FAILED';
  }

  private endpoint(path = ''): string {
    return `${APP_SECURITY_CONFIG.api_url}/broadcast${path}`;
  }

  private headers(): Record<string, string> {
    const token = this.tokenService.jwtToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
