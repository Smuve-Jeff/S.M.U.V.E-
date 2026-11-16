import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { SocialNetworkingService } from './social-networking.service';
import { SnackbarService } from './snackbar.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import {
  EXPIRY_WARNING_HOURS,
  expiryLabel,
  isSwept,
  keepLabel,
  reconcileSweptRows,
  recordingKey,
  recordingsEmptyNote,
} from './retention-warning';
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

/** One recording the relay still holds for this account. */
export interface BroadcastRecordingDto {
  relayId: string;
  platform: string;
  startedAt: string;
  endedAt: string | null;
  /** File name on the relay. */
  name: string;
  bytes: number;
  recordedAt: string;
  /** Relative to the API base, e.g. `/broadcast/recordings/<id>/download?name=…`. */
  downloadPath: string;
  /** Seconds of media as the file itself reports them; null when unknown. */
  durationSeconds?: number | null;
  /** A small JPEG still as a data URL; null when the relay could not frame it. */
  thumbnail?: string | null;
  /** Hours this show was asked to be kept for; null means the default window. */
  keepHours?: number | null;
  /** When that promise runs out, if one was made. */
  keepUntil?: string | null;
  /** When the sweeper will take this file: the window, or a longer pin. */
  expiresAt?: string | null;
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

  /**
   * Recordings the relay still holds for this host. Every push is recorded on
   * the relay and pruned by its retention window, so this list shrinks on its
   * own; the server joins the files to this account's sessions before they
   * ever reach the browser.
   */
  readonly recordings = signal<BroadcastRecordingDto[]>([]);
  readonly recordingsLoading = signal(false);
  readonly recordingsError = signal('');
  /** The recording open in the panel's player, if any. */
  readonly playback = signal<{
    recording: BroadcastRecordingDto;
    url: string;
  } | null>(null);
  readonly playbackLoading = signal(false);
  readonly playbackError = signal('');
  /** The row waiting for the host to confirm a delete, if any. */
  readonly pendingDelete = signal<string | null>(null);
  readonly deleting = signal<string | null>(null);
  /** Warn this long before the sweeper takes a show, unless it gets pinned. */
  readonly expiryWarningHours = EXPIRY_WARNING_HOURS;
  /**
   * The clock the retention warnings read. It ticks, so a show crossing into
   * its final hours updates a panel that was simply left open.
   */
  readonly clock = signal(Date.now());
  /** The relay window the visible deadlines were computed with. */
  readonly retentionWindow = signal<number | null>(null);
  /** Whether the relay records broadcasts at all; null until it has been asked. */
  readonly recordingEnabled = signal<boolean | null>(null);

  private relayId: string | null = null;
  private egressTimer: ReturnType<typeof setInterval> | null = null;

  private clockTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Shows this panel watched pass their deadline. The relay sweeps on its own
   * schedule, so a reload can still list one for a moment; this keeps it gone
   * instead of letting it blink back into the list.
   */
  private locallySwept = new Set<string>();
  /** When the window was last asked for, so the check stays cheap. */
  private retentionCheckedAt = 0;
  /** False until a window has been read at least once. */
  private windowEverRead = false;

  constructor() {
    // Minute-level badges only need a minute-level tick, and writing the signal
    // re-renders the recordings block alone.
    this.clockTimer = setInterval(() => {
      this.clock.set(Date.now());
      if (this.pruneSweptRecordings() && !this.recordingsLoading()) {
        // Our own deadline said it was gone; ask the relay once so the list is
        // its answer rather than ours.
        void this.loadRecordings({ quiet: true });
      }
      // A window changed on the relay makes every deadline on screen wrong, so
      // check it now and then. Nothing to protect when the list is empty.
      const now = this.clock();
      if (
        this.recordings().length > 0 &&
        now - this.retentionCheckedAt > 5 * 60_000
      ) {
        void this.refreshRecordingStatus(now);
      }
    }, 60_000);
    inject(DestroyRef).onDestroy(() => {
      if (this.clockTimer) clearInterval(this.clockTimer);
    });

    effect(() => {
      const userId = this.profile.profile()?.id ?? '';
      if (!userId) {
        this.destinations.set({});
        return;
      }
      void this.load();
      void this.loadRecordings();
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

  async start(platform: IngestPlatform): Promise<boolean> {
    const stream = this.social.localStream();
    if (!stream) {
      this.snackbar.warning('NO CAPTURE YET — SWITCH THE CAMERA ON FIRST');
      return false;
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
        return false;
      }
      this.watchEgress(this.relayId);
      this.snackbar.success(`PUSHING TO ${platform.toUpperCase()}`);
      return true;
    } catch (error) {
      // The relay may already hold a session that the publisher never joined;
      // release it instead of leaving an orphaned ingest for the next push.
      try {
        await this.releaseRelay();
      } catch {
        /* best-effort cleanup */
      }
      this.snackbar.error(this.describe(error));
      return false;
    } finally {
      this.pushing.set(null);
    }
  }

  async stop(): Promise<void> {
    this.stopWatching();
    await this.whip.stop();
    await this.releaseRelay();
    this.stopPlayback();
    this.snackbar.info('BROADCAST PUSH STOPPED');
    // The show that just ended is the one the host is most likely to want.
    void this.loadRecordings();
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
        this.http.get<{
          ready?: boolean;
          bytesReceived?: number;
          tracks?: unknown[];
          ingest?: {
            audio?: { codec?: string } | null;
            problem?: string | null;
          } | null;
        }>(this.endpoint(`/selftest/${relayId}`), { headers: this.headers() }),
      );
      const bytes = Number(status?.bytesReceived ?? 0);
      const tracks = Array.isArray(status?.tracks) ? status.tracks.length : 0;
      if (status?.ready && bytes > 0) {
        // What the ingest received is the part the channel would show and the
        // operator cannot see: an AAC encode that never produced audio looks
        // exactly like a healthy push from here otherwise.
        const ingest = status.ingest ?? null;
        const codec = ingest?.audio?.codec ?? null;
        const audioNote = !ingest
          ? ''
          : codec
            ? ` · AUDIO ${codec}`
            : ` · ${(ingest.problem ?? 'NO AUDIO AT THE INGEST').toUpperCase()}`;
        this.selfTest.set({
          status: 'pass',
          detail: `MEDIA CONFIRMED — ${Math.max(1, Math.round(bytes / 1024))} KB, ${tracks} TRACK${tracks === 1 ? '' : 'S'}${audioNote}`,
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

  /** Re-read what the relay is still keeping for this account. */
  async loadRecordings(options: { quiet?: boolean } = {}): Promise<void> {
    if (!this.tokenService.jwtToken()) {
      this.recordings.set([]);
      return;
    }
    this.recordingsLoading.set(true);
    // A background reconcile must not cancel a delete the host is confirming.
    if (!options.quiet) this.pendingDelete.set(null);
    try {
      const rows = await firstValueFrom(
        this.http.get<BroadcastRecordingDto[]>(this.endpoint('/recordings'), {
          headers: this.headers(),
        }),
      );
      const listed = Array.isArray(rows) ? rows : [];
      const reconciled = reconcileSweptRows(listed, this.locallySwept);
      this.locallySwept = reconciled.swept;
      this.recordings.set(reconciled.rows);
      void this.refreshRecordingStatus();
      this.recordingsError.set('');
    } catch {
      // A failed read must never read as "your recordings are gone". A quiet
      // reload is a background reconcile, so it stays silent rather than
      // alarming a host whose list is already on screen.
      if (!options.quiet) {
        this.recordingsError.set('COULD NOT LOAD RECORDINGS — TRY REFRESH');
      }
    } finally {
      this.recordingsLoading.set(false);
    }
  }

  /** One line per recording: destination, size, and when it was written. */
  /** `1:04:05` or `6:58`; empty when the file did not report a duration. */
  recordingDuration(seconds: number | null | undefined): string {
    const total = Math.round(Number(seconds) || 0);
    if (total <= 0) return '';
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0
      ? `${hours}:${pad(minutes)}:${pad(rest)}`
      : `${minutes}:${pad(rest)}`;
  }

  recordingLabel(recording: BroadcastRecordingDto): string {
    const platform =
      String(recording.platform ?? '').toUpperCase() || 'BROADCAST';
    const bytes = Number(recording.bytes) || 0;
    const size =
      bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const when = new Date(recording.recordedAt || recording.startedAt);
    const stamp = Number.isNaN(when.getTime())
      ? ''
      : `${when.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
    const duration = this.recordingDuration(recording.durationSeconds);
    return [platform, size, duration, stamp].filter(Boolean).join(' · ');
  }

  /**
   * Play a recording in the panel.
   *
   * A `<video>` element cannot send the bearer token, and a JWT in a media URL
   * would land in access logs, so the app asks the API for a short-lived,
   * signed playback URL and hands that to the element. Seeking works because
   * the API and the relay both answer byte ranges.
   */
  async playRecording(recording: BroadcastRecordingDto): Promise<void> {
    this.playbackLoading.set(true);
    this.playbackError.set('');
    try {
      const ticket = await firstValueFrom(
        this.http.post<{ path?: string }>(
          this.endpoint(
            `/recordings/${encodeURIComponent(recording.relayId)}/playback?name=${encodeURIComponent(recording.name)}`,
          ),
          {},
          { headers: this.headers() },
        ),
      );
      if (!ticket?.path) throw new Error('NO PLAYBACK URL');
      this.playback.set({
        recording,
        url: `${APP_SECURITY_CONFIG.api_url}${ticket.path}`,
      });
    } catch {
      this.playback.set(null);
      this.playbackError.set('COULD NOT OPEN THAT RECORDING — DOWNLOAD IT INSTEAD');
    } finally {
      this.playbackLoading.set(false);
    }
  }

  stopPlayback(): void {
    this.playback.set(null);
    this.playbackError.set('');
  }

  /**
   * Download through the API: the relay's token stays on the server, and the
   * browser only ever sees the bytes it just downloaded.
   */
  async downloadRecording(recording: BroadcastRecordingDto): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${APP_SECURITY_CONFIG.api_url}${recording.downloadPath}`, {
          headers: this.headers(),
          responseType: 'blob',
        }),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = recording.name;
      anchor.click();
      URL.revokeObjectURL(url);
      this.snackbar.success('RECORDING DOWNLOADED');
    } catch {
      this.snackbar.error('DOWNLOAD FAILED — TRY AGAIN');
    }
  }

  /** True only when the relay has said, and said it is not recording. */
  recordingOff(): boolean {
    return this.recordingEnabled() === false;
  }

  /**
   * What the empty recordings list should say: whether the relay records at all,
   * and how long it keeps what it does record.
   */
  recordingsEmptyNote(): string {
    return recordingsEmptyNote(this.recordingEnabled(), this.retentionWindow());
  }

  /**
   * Ask what the relay is doing with recordings: whether it records at all, and
   * which window is in force. A window change re-reads the list, because every
   * deadline on screen was computed from the old one; an unreachable relay
   * leaves what is already on screen alone.
   */
  private async refreshRecordingStatus(now = Date.now()): Promise<void> {
    if (!this.tokenService.jwtToken()) return;
    this.retentionCheckedAt = now;
    try {
      const payload = await firstValueFrom(
        this.http.get<{
          enabled?: boolean | null;
          retentionHours?: number | null;
        }>(this.endpoint('/recordings/status'), { headers: this.headers() }),
      );
      const hours = Number(payload?.retentionHours);
      const next = Number.isFinite(hours) && hours >= 0 ? hours : null;
      const previous = this.retentionWindow();
      const hadWindow = this.windowEverRead;
      this.retentionWindow.set(next);
      this.recordingEnabled.set(
        typeof payload?.enabled === 'boolean' ? payload.enabled : null,
      );
      if (next !== null) this.windowEverRead = true;
      // After a failed read the old window is unknown, so a recovered relay is
      // worth one re-read even when the number happens to match.
      if (
        hadWindow &&
        next !== null &&
        previous !== next &&
        !this.recordingsLoading()
      ) {
        void this.loadRecordings({ quiet: true });
      }
    } catch {
      // Keep what is on screen rather than blanking it over a bad read.
    }
  }

  /**
   * Drop shows whose deadline has passed. The sweeper runs on the same rule, so
   * this is the list agreeing with the relay a moment early, not inventing a
   * deletion. Stops playback if the show that went was the one playing.
   */
  private pruneSweptRecordings(): boolean {
    const now = this.clock();
    const rows = this.recordings();
    const live = rows.filter((row) => !isSwept(row.expiresAt, now));
    if (live.length === rows.length) return false;

    for (const row of rows) {
      if (!live.includes(row)) this.locallySwept.add(recordingKey(row));
    }
    this.recordings.set(live);
    this.pendingDelete.set(null);
    const playing = this.playback();
    if (
      playing &&
      !live.some(
        (row) => this.recordingKey(row) === this.recordingKey(playing.recording),
      )
    ) {
      this.stopPlayback();
    }
    return true;
  }

  /** `IN 4H` / `IN 45M` while a show is close to the sweeper, else empty. */
  expiryLabel(recording: BroadcastRecordingDto): string {
    return expiryLabel(recording.expiresAt, this.clock(), this.expiryWarningHours);
  }

  /** How many shows the panel should warn about right now. */
  expiringCount(): number {
    return this.recordings().filter((row) => this.expiryLabel(row) !== '')
      .length;
  }

  /** `KEPT UNTIL 23 NOV` for a promise that has not run out yet, else empty. */
  keepLabel(recording: BroadcastRecordingDto): string {
    return keepLabel(recording.keepUntil, this.clock());
  }

  /**
   * Keep a show past the default window, or put it back on the default with 0.
   * The relay owns the promise, so the row is updated from its answer.
   */
  async setRetention(
    recording: BroadcastRecordingDto,
    hours: number | string,
  ): Promise<void> {
    const value = Math.max(0, Math.round(Number(hours) || 0));
    try {
      const kept = await firstValueFrom(
        this.http.put<{ keepHours?: number | null; keepUntil?: string | null }>(
          this.endpoint(
            `/recordings/${encodeURIComponent(recording.relayId)}/retention?name=${encodeURIComponent(recording.name)}`,
          ),
          { hours: value },
          { headers: this.headers() },
        ),
      );
      const key = this.recordingKey(recording);
      const pinnedUntil = Date.parse(String(kept?.keepUntil ?? ''));
      this.recordings.update((rows) =>
        rows.map((row) => {
          if (this.recordingKey(row) !== key) return row;
          // Move the local deadline with the pin, so the row is not pruned by
          // the old window in the seconds before the reload below lands.
          const current = Date.parse(String(row.expiresAt ?? ''));
          const next = Number.isFinite(pinnedUntil)
            ? Math.max(Number.isFinite(current) ? current : 0, pinnedUntil)
            : current;
          return {
            ...row,
            keepHours: kept?.keepHours ?? null,
            keepUntil: kept?.keepUntil ?? null,
            expiresAt: Number.isFinite(next) ? new Date(next).toISOString() : null,
          };
        }),
      );
      // The relay owns the real deadline; take its answer rather than keeping
      // one derived here, especially after a pin is cleared back to the window.
      void this.loadRecordings({ quiet: true });
      this.snackbar.success(
        value > 0
          ? `RECORDING KEPT FOR ${this.retentionLabel(value)}`
          : 'RECORDING BACK ON THE DEFAULT WINDOW',
      );
    } catch (error) {
      this.snackbar.error(this.describe(error));
    }
  }

  /** `7 DAYS` rather than `168 HOURS`. */
  private retentionLabel(hours: number): string {
    if (hours % 24 === 0) {
      const days = hours / 24;
      return `${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
    }
    return `${hours} ${hours === 1 ? 'HOUR' : 'HOURS'}`;
  }

  /** Two clicks rather than a dialog: the row itself asks before it goes. */
  askDeleteRecording(recording: BroadcastRecordingDto): void {
    this.pendingDelete.set(this.recordingKey(recording));
  }

  cancelDeleteRecording(): void {
    this.pendingDelete.set(null);
  }

  isPendingDelete(recording: BroadcastRecordingDto): boolean {
    return this.pendingDelete() === this.recordingKey(recording);
  }

  isDeleting(recording: BroadcastRecordingDto): boolean {
    return this.deleting() === this.recordingKey(recording);
  }

  /**
   * Free the space now instead of waiting for retention. The API proves the
   * recording is this host's before the relay removes the file and its frame,
   * and a file retention already took is success, not an error.
   */
  async deleteRecording(recording: BroadcastRecordingDto): Promise<void> {
    const key = this.recordingKey(recording);
    this.deleting.set(key);
    try {
      await firstValueFrom(
        this.http.delete(
          this.endpoint(
            `/recordings/${encodeURIComponent(recording.relayId)}?name=${encodeURIComponent(recording.name)}`,
          ),
          { headers: this.headers() },
        ),
      );
      this.recordings.update((rows) =>
        rows.filter((row) => this.recordingKey(row) !== key),
      );
      const playing = this.playback();
      if (playing && this.recordingKey(playing.recording) === key) {
        this.stopPlayback();
      }
      this.pendingDelete.set(null);
      this.snackbar.success('RECORDING DELETED');
    } catch (error) {
      this.snackbar.error(this.describe(error));
    } finally {
      this.deleting.set(null);
    }
  }

  private recordingKey(recording: BroadcastRecordingDto): string {
    return recordingKey(recording);
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
