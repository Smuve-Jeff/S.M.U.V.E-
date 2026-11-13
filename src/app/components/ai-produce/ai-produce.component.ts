import {
  Component,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import {
  AiProduceService,
  ProduceOptions,
  ProduceStage,
  VoicePreview,
} from '../../services/ai-produce.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import {
  AudioEngineLatencyService,
  BenchmarkResult,
} from '../../services/audio-engine-latency.service';
import { NotificationService } from '../../services/notification.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { formatMemoryBytes } from '../../services/memory-estimate.util';
import { StudioRecordingEngineService } from '../../studio/studio-recording-engine.service';
import { StudioOrchestrationService } from '../../services/studio-orchestration.service';
import { AsyncCollaborationPacket } from '../../types/studio-orchestration.types';

interface GenreOption {
  value: string;
  label: string;
  emoji: string;
}

interface MoodOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-ai-produce',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './ai-produce.component.html',
  styleUrls: ['./ai-produce.component.css'],
})
export class AiProduceComponent implements OnDestroy {
  public produce = inject(AiProduceService);
  private notify = inject(NotificationService);
  private music = inject(MusicManagerService);
  public engine = inject(AudioEngineService);
  public latency = inject(AudioEngineLatencyService);
  public recorder = inject(StudioRecordingEngineService);
  public orchestration = inject(StudioOrchestrationService);
  private router = inject(Router);
  /** Whether the voice-preview stage card has visible artifacts. */
  hasVoicePreview = computed(() => !!this.produce.currentVoicePreview());
  voicePreview = this.produce.currentVoicePreview;
  /** Pull cached latency snapshot for the engine metrics sub-card. */
  engineSnapshot = computed(() => this.latency.snapshot());
  /**
   * Live memory wall: JS heap when Chromium exposes it, plus the recorder's
   * bounded resident PCM. Spilled capture bytes live in IndexedDB, so they are
   * labelled as spilled rather than added to the resident figure.
   */
  memoryReadout = computed(() => {
    const snapshot = this.engineSnapshot();
    const capture = this.recorder.capture;
    const used = snapshot.jsHeapUsedBytes;
    const limit = snapshot.jsHeapLimitBytes;
    const residentBytes = capture?.residentBytes ?? 0;
    const spilledFrames = capture?.spilledFrames ?? 0;
    const spilledBytes = spilledFrames * 2 * 4;
    return {
      heapLabel:
        used === null || limit === null
          ? 'Not exposed'
          : `${formatMemoryBytes(used)} / ${formatMemoryBytes(limit)}`,
      heapRatio:
        used !== null && limit !== null && limit > 0 ? used / limit : 0,
      captureLabel: formatMemoryBytes(residentBytes),
      spillLabel:
        spilledBytes > 0 ? `${formatMemoryBytes(spilledBytes)} spilled` : 'none',
    };
  });

  /** Sprint X3 — benchmark CTA state. */
  isBenchmarking = signal(false);
  benchmarkResult = signal<BenchmarkResult | null>(null);

  /**
   * Sprint X3 — Engine benchmark CTA. Drives the latency service's
   * OfflineAudioContext render and surfaces the resulting speed ratio
   * under the engine metrics sub-card. Errors are swallowed but the
   * notification banner shows a friendly message.
   */
  async runBenchmarkNow(): Promise<void> {
    if (this.isBenchmarking()) return;
    this.isBenchmarking.set(true);
    this.benchmarkResult.set(null);
    try {
      const result = await this.latency.runOfflineBenchmark(1);
      this.benchmarkResult.set(result);
    } catch (e: any) {
      this.notify.show(
        'Benchmark could not be run: ' + (e?.message ?? 'unknown'),
        'warning'
      );
    } finally {
      this.isBenchmarking.set(false);
    }
  }

  readonly  stageOrder: ProduceStage[] = [
    'idea',
    'beat',
    'lyrics',
    'voice-preview',
    'mix-master',
    'release',
    'done',
  ];
  readonly genres: GenreOption[] = [
    { value: 'Trap', label: 'Trap', emoji: '🔥' },
    { value: 'Hip Hop', label: 'Hip Hop', emoji: '🎤' },
    { value: 'Pop', label: 'Pop', emoji: '⭐' },
    { value: 'House', label: 'House', emoji: '🎵' },
    { value: 'R&B', label: 'R&B', emoji: '🎸' },
    { value: 'Lo-Fi', label: 'Lo-Fi', emoji: '☕' },
    { value: 'Jazz', label: 'Jazz', emoji: '🎷' },
    { value: 'Electronic', label: 'Electronic', emoji: '🎛️' },
    { value: 'Drill', label: 'Drill', emoji: '💢' },
    { value: 'Dubstep', label: 'Dubstep', emoji: '💥' },
    { value: 'Reggaeton', label: 'Reggaeton', emoji: '🎶' },
  ];

  readonly moods: MoodOption[] = [
    { value: 'pop', label: 'Pop' },
    { value: 'dark', label: 'Dark' },
    { value: 'romantic', label: 'Romantic' },
    { value: 'high-energy', label: 'High Energy' },
    { value: 'chill', label: 'Chill' },
    { value: 'sad', label: 'Sad' },
  ];

  form = signal<ProduceOptions>({
    prompt: '',
    genre: 'Trap',
    mood: 'pop',
    title: '',
    bpm: undefined,
    voicePreview: true,
  });

  stageLabel = computed(() => {
    const map: Record<ProduceStage, string> = {
      idle: 'Ready',
      idea: 'Idea',
      beat: 'Beat',
      lyrics: 'Lyrics',
      'voice-preview': 'Voice Preview',
      'mix-master': 'Mix + Master',
      release: 'Release',
      done: 'Done',
      cancelled: 'Cancelled',
      error: 'Error',
    };
    return map[this.produce.stage()] || 'Ready';
  });

  stageIndex = computed(() => {
    const stage = this.produce.stage();
    return this.stageOrder.indexOf(stage);
  });

  stageState = computed(() => {
    const stage = this.produce.stage();
    if (stage === 'cancelled' || stage === 'error') return stage;
    const idx = this.stageOrder.indexOf(stage);
    if (idx < 0) return 'pending';
    return 'active';
  });

  canRun = computed(
    () =>
      !this.produce.isRunning() &&
      (this.form().prompt || '').trim().length > 0
  );

  canApply = computed(
    () =>
      this.produce.stage() === 'done' &&
      this.produce.currentBeat() !== null &&
      this.produce.appliedTrackIds().length === 0
  );

  updateForm<K extends keyof ProduceOptions>(
    key: K,
    value: ProduceOptions[K]
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  updateBpm(raw: number | string | null | undefined): void {
    if (raw === null || raw === undefined || raw === '') {
      this.form.update((f) => ({ ...f, bpm: undefined }));
      return;
    }
    const num = typeof raw === 'string' ? Number(raw) : raw;
    if (!Number.isFinite(num) || num <= 0) {
      this.form.update((f) => ({ ...f, bpm: undefined }));
      return;
    }
    this.form.update((f) => ({ ...f, bpm: Math.round(num) }));
  }

  async run(): Promise<void> {
    const opts = this.form();
    if (!(opts.prompt || '').trim()) {
      this.notify.show(
        'Enter a prompt first — even a single word works.',
        'warning'
      );
      return;
    }
    await this.produce.run({ ...opts, bpm: opts.bpm || undefined });
  }

  cancel(): void {
    this.produce.cancel();
    this.notify.show('AI Produce cancelled.', 'info');
  }

  reset(): void {
    this.produce.reset();
  }

  applyToProject(): void {
    const ids = this.produce.applyToProject();
    if (ids.length === 0) return;
    this.notify.show(
      `${ids.length} tracks added to studio. Opening arrangement view...`,
      'success'
    );
    this.router.navigate(['/studio'], { queryParams: { view: 'arrangement' } });
  }

  goToRelease(): void {
    // The Release Pipeline page picks up the produce service's applied
    // release (if any) and always renders the full pipeline otherwise, so
    // there is exactly one destination.
    this.router.navigate(['/release-pipeline']);
  }

  /**
   * Hand the run to a collaborator: the brief is plain text, so a creator can
   * work from it in a message thread without opening the session.
   */
  async copyCreatorBrief(): Promise<void> {
    const handoff = this.produce.creatorHandoff();
    if (!handoff) return;
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) {
      this.notify.show(
        'Clipboard is blocked here — select the brief and copy it manually.',
        'warning'
      );
      return;
    }
    try {
      await clipboard.writeText(handoff.brief);
      this.notify.show(
        'Creator brief copied — paste it to your collaborator.',
        'success'
      );
    } catch (e: any) {
      this.notify.show(
        'Clipboard was refused: ' + (e?.message ?? 'unknown'),
        'warning'
      );
    }
  }

  /**
   * Send the brief into a live collaboration session as an async packet, so a
   * collaborator who is not online still receives the work.
   */
  sendCreatorBrief(): void {
    const packet = this.orchestration.sendCreatorHandoff();
    this.notify.show(
      packet
        ? 'Creator brief sent to the session as an async packet.'
        : 'No live session with share rights — the brief was not sent.',
      packet ? 'success' : 'warning'
    );
  }

  /** Row title for a session packet: creator briefs carry the track title. */
  packetTitle(packet: AsyncCollaborationPacket): string {
    const payload = (packet.payload ?? {}) as Record<string, unknown>;
    const title = payload['title'];
    if (typeof title === 'string' && title.trim()) return title;
    return packet.packetType.replace(/_/g, ' ');
  }

  /**
   * A row never claims delivery before the server echoed the packet; queued
   * means it left this tab but is not confirmed yet.
   */
  packetDeliveryLabel(packet: AsyncCollaborationPacket): string {
    return this.orchestration.packetDelivery(packet) === 'delivered'
      ? 'delivered'
      : 'queued · awaiting session ack';
  }

  /** Empty string means the session — a brief addressed to everyone. */
  packetRecipient(packet: AsyncCollaborationPacket): string {
    return packet.toUserId || 'session';
  }

  /** The newest brief in the session list, so both sides can read it inline. */
  latestPacketBrief(): string {
    const packet = this.orchestration
      .sessionAsyncPackets()
      .find((entry) => !!this.packetBrief(entry));
    return packet ? this.packetBrief(packet) : '';
  }

  private packetBrief(packet: AsyncCollaborationPacket): string {
    const payload = (packet.payload ?? {}) as Record<string, unknown>;
    const brief = payload['brief'];
    return typeof brief === 'string' ? brief : '';
  }

  /**
   * Same brief as a file, so an async collaborator keeps it after the tab
   * closes and the handoff is not trapped in this app.
   */
  downloadCreatorBrief(): void {
    const handoff = this.produce.creatorHandoff();
    if (!handoff) return;
    try {
      const blob = new Blob([handoff.brief], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${handoff.id}.md`;
      link.click();
      URL.revokeObjectURL(url);
      this.notify.show('Creator brief downloaded.', 'success');
    } catch (e: any) {
      this.notify.show(
        'Brief could not be downloaded: ' + (e?.message ?? 'unknown'),
        'warning'
      );
    }
  }

  /** Listen for the synthesized voice preview playback on the live
   *  engine. Routes through `AudioEngineService.playAudition()` so the
   *  synthesized AudioBuffer is monitored without bleeding into master. */
  auditioningVoice(): boolean {
    const vp = this.produce.currentVoicePreview();
    return !!vp && this.engine.auditionPlaying();
  }

  playVoicePreview(vp: VoicePreview): void {
    try {
      this.engine.playAudition(vp.previewBuffer, () => {
        // No-op end handler — the silence-on-end UX is handled by the
        // signal flipping false.
      });
    } catch (e: any) {
      this.notify.show(
        'Voice preview failed to start: ' + (e?.message || 'unknown'),
        'warning'
      );
    }
  }

  stopVoicePreview(): void {
    this.engine.stopAudition();
  }

  /** Render-formatted elapsed/duration tag (e.g. "5.2 / 8.3s"). */
  voicePreviewProgress(): string {
    const dur = this.produce.currentVoicePreview()?.durationSeconds || 0;
    const elapsed = dur * this.engine.auditionProgress();
    return `${elapsed.toFixed(1)} / ${dur.toFixed(1)}s`;
  }

  formatStamp(ts: number): string {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  stageDone(stage: ProduceStage): boolean {
    const current = this.produce.stage();
    if (current === 'done') return true;
    if (current === 'cancelled' || current === 'error') return false;
    const currentIdx = this.stageOrder.indexOf(current);
    const targetIdx = this.stageOrder.indexOf(stage);
    return targetIdx >= 0 && currentIdx > targetIdx;
  }

  ngOnDestroy(): void {
    if (this.produce.isRunning()) {
      this.produce.cancel();
    }
  }
}
