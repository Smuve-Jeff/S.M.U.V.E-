import {
  Component,
  inject,
  signal,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';
import { AiMixAssistantService } from '../effects/ai-mix-assistant.service';
import { ExportService } from '../../services/export.service';
import { PluginStoreService } from '../../services/plugin-store.service';
import { MusicManagerService } from '../../services/music-manager.service';

interface MasteringBand {
  id: number;
  name: string;
  range: string;
  gain: number;
  threshold: number;
  ratio: number;
}

interface MasteringPreset {
  id: string;
  label: string;
  emoji: string;
  tagline: string;
  targetLufs: number;
  safeCeiling: number;
  /** Per-band delta gains in dB applied on top of current values */
  bandDelta: Record<number, number>;
  /** Compressor / limiter setup hints */
  ratio: number;
  threshold: number;
  roastNote: string;
}

@Component({
  selector: 'app-mastering-suite',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mastering-suite.component.html',
  styleUrls: ['./mastering-suite.component.css'],
})
export class MasteringSuiteComponent implements AfterViewInit, OnDestroy {
  private audioEngine = inject(AudioEngineService);
  public aiService = inject(AiService);
  private haptic = inject(HapticService);
  private snack = inject(SnackbarService);
  private aiMix = inject(AiMixAssistantService);
  private exportService = inject(ExportService);
  private pluginStore = inject(PluginStoreService);
  private musicManager = inject(MusicManagerService);
  masteringRoast = signal<string>('Analyzing dynamics...');
  public uiService = inject(UIService);

  // ── Sprint B1 Phase 2 — real-render mastering meters ────────────
  renderedPeak = signal<number | null>(null);
  renderedLufs = signal<number | null>(null);
  renderedRms = signal<number | null>(null);
  renderedDuration = signal<number | null>(null);
  renderedPluginCount = signal(0);
  isRendering = signal(false);

  /** Sprint B2 — the polished AudioBuffer is retained so the Audition
   *  button can replay it without re-bouncing the project. */
  renderedBufferRef: AudioBuffer | null = null;

  /** Toggle audition through the live ctx (bypasses master polish + limiter). */
  auditionToggle(): void {
    if (!this.renderedBufferRef) return;
    if (this.audioEngine.auditionPlaying()) {
      this.audioEngine.stopAudition();
      return;
    }
    this.audioEngine.playAudition(this.renderedBufferRef, () => undefined);
  }

  /** Render seconds into a mm:ss label for the audition progress read-out. */
  formatSeconds(s: number): string {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s - m * 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  /**
   * Sprint B1 Phase 2 — Render & Master: bounce the arrangement offline with
   * the REAL synth voice graph, run the enabled WASM plugin chain as polish,
   * then analyze the result into true meters (peak / LUFS / RMS / duration).
   */
  async renderAndMaster(): Promise<void> {
    if (this.isRendering()) return;
    this.isRendering.set(true);
    try {
      this.masteringRoast.set('Bouncing real synth voices offline…');
      const raw = await this.exportService.renderProjectOffline();
      this.masteringRoast.set('Applying WASM plugin chain…');
      const polished = await this.exportService.applySmuvePolish(raw);
      this.renderedBufferRef = polished;
      const stats = this.exportService.analyzeBuffer(polished);
      this.renderedPeak.set(stats.peakDb);
      this.renderedLufs.set(stats.lufs);
      this.renderedRms.set(stats.rmsDb);
      this.renderedDuration.set(stats.durationSec);
      const enabled = this.pluginStore
        .catalog
        .filter((p) => this.pluginStore.isEnabled(p.id))
        .map((p) => p.name);
      this.renderedPluginCount.set(enabled.length);
      this.masteringRoast.set(
        `Real render done · ${stats.durationSec}s · peak ${stats.peakDb} dBFS · ${stats.lufs} LUFS${enabled.length ? ' · chain: ' + enabled.join(' → ') : ''}`
      );
      this.smartAssistSuggestion.set(
        enabled.length
          ? `Rendered with ${enabled.length} WASM plugin${enabled.length > 1 ? 's' : ''} in the polish chain`
          : 'Rendered with real synth voices — enable WASM plugins in the Plugin Store to add polish'
      );
    } catch (err: any) {
      this.masteringRoast.set('Render failed · ' + (err?.message ?? 'unknown error'));
    } finally {
      this.isRendering.set(false);
    }
  }

  /** Selected genre for AI mastering (null = auto-detect) */
  readonly availableGenres = [
    { value: '', label: 'Auto-Detect', emoji: '🤖' },
    { value: 'trap', label: 'Trap', emoji: '🔥' },
    { value: 'house', label: 'House', emoji: '🎵' },
    { value: 'lo-fi', label: 'Lo-Fi', emoji: '☕' },
    { value: 'pop', label: 'Pop', emoji: '⭐' },
    { value: 'dubstep', label: 'Dubstep', emoji: '💥' },
    { value: 'reggaeton', label: 'Reggaeton', emoji: '🎶' },
    { value: 'ambient', label: 'Ambient', emoji: '🌌' },
    { value: 'jazz', label: 'Jazz', emoji: '🎷' },
    { value: 'rnb', label: 'R&B', emoji: '🎸' },
  ];
  selectedGenre = signal<string>('');
  aiDetectedGenre = signal<string>('');

  /** Select a genre for AI mastering. */
  selectGenre(value: string): void {
    this.selectedGenre.set(value);
    this.haptic.light();
  }

  @ViewChild('spectrogram') spectrogramRef!: ElementRef<HTMLCanvasElement>;

  bands = signal<MasteringBand[]>([
    {
      id: 1,
      name: 'SUB',
      range: '20Hz - 120Hz',
      gain: -1.2,
      threshold: -12.4,
      ratio: 4.1,
    },
    {
      id: 2,
      name: 'LOW',
      range: '120Hz - 500Hz',
      gain: -0.5,
      threshold: -8.1,
      ratio: 2.5,
    },
    {
      id: 3,
      name: 'MID',
      range: '500Hz - 2.5kHz',
      gain: 0,
      threshold: -2.4,
      ratio: 1.8,
    },
    {
      id: 4,
      name: 'HIGH',
      range: '2.5kHz - 10kHz',
      gain: 0.8,
      threshold: -4.2,
      ratio: 2.1,
    },
    {
      id: 5,
      name: 'AIR',
      range: '10kHz - 22kHz',
      gain: 1.5,
      threshold: -1.2,
      ratio: 1.5,
    },
  ]);

  lufsIntegrated = this.audioEngine.outputLufs;
  truePeak = this.audioEngine.outputPeak;
  lra = signal(6.2);
  correlation = signal(0.82); // This could be wired to a real phase correlation node if added
  targetLufs = signal(-14);
  safeCeiling = signal(-0.1);
  isProcessing = signal(false);
  smartAssistSuggestion = signal<string>('');
  eqMaskingHint = signal<string>('');
  /** Track which preset is currently selected (for visual highlight). */
  activePresetId = signal<string | null>(null);

  // ── Pro: AI mastering presets ───────────────────────────────────
  readonly presets: MasteringPreset[] = [
    {
      id: 'streaming',
      label: 'Streaming',
      emoji: '🎧',
      tagline: 'Spotify · Apple · YouTube',
      targetLufs: -14,
      safeCeiling: -1,
      // Streaming keeps headroom; gentle low-shelf trim, slight air boost
      bandDelta: { 1: -0.6, 2: -0.3, 3: 0, 4: +0.4, 5: +0.6 },
      ratio: 2.5,
      threshold: -8,
      roastNote:
        'Streaming mastered · soft ceiling, plenty of headroom for codec transcoding',
    },
    {
      id: 'club',
      label: 'Club / Loud',
      emoji: '🔥',
      tagline: 'Festival · Sound System',
      targetLufs: -9,
      safeCeiling: -0.3,
      // Aggressive limiting; tight low-mid, hard push on air
      bandDelta: { 1: +1.0, 2: 0, 3: -0.4, 4: +0.8, 5: +1.2 },
      ratio: 6,
      threshold: -6,
      roastNote:
        'Club mastered · -9 LUFS, tight driver-grade limiting, hits like a wall',
    },
    {
      id: 'vinyl',
      label: 'Vinyl / Warm',
      emoji: '🖤',
      tagline: 'Pre-master analog feel',
      targetLufs: -16,
      safeCeiling: -2,
      // Soft highs, gentle low-mid warmth
      bandDelta: { 1: -0.2, 2: +0.3, 3: +0.1, 4: -0.4, 5: -0.8 },
      ratio: 1.8,
      threshold: -10,
      roastNote:
        'Vinyl warmed · gentle compression, soft highs, pre-cut headroom',
    },
    {
      id: 'broadcast',
      label: 'Broadcast',
      emoji: '📺',
      tagline: 'TV · Radio · Podcast',
      targetLufs: -23,
      safeCeiling: -2,
      // Dialogue-friendly: gentle mid bump + rolled-off air
      bandDelta: { 1: -0.4, 2: 0, 3: +0.5, 4: -0.2, 5: -0.6 },
      ratio: 3,
      threshold: -8,
      roastNote:
        'Broadcast ready · -23 LUFS broadcast standard, dialog-preserving EQ',
    },
    {
      id: 'mastered',
      label: 'Mastered',
      emoji: '⚡',
      tagline: 'Maximum loudness',
      targetLufs: -8,
      safeCeiling: -0.1,
      // Brick-wall master
      bandDelta: { 1: +0.8, 2: +0.2, 3: 0, 4: +1.0, 5: +1.4 },
      ratio: 8,
      threshold: -4,
      roastNote:
        'Mastered hot · -8 LUFS, brick-wall limiting, competitive loudness',
    },
  ];

  private animationId: number | null = null;

  ngAfterViewInit() {
    const targets = (this.audioEngine as any).getMasteringTargets();
    this.targetLufs.set(targets.lufs);
    this.safeCeiling.set(targets.truePeak);
    this.startSpectrogram();
  }

  ngOnDestroy() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
  }

  // ── Pro: apply preset ───────────────────────────────────────
  applyPreset(preset: MasteringPreset): void {
    this.haptic.heavy();
    this.activePresetId.set(preset.id);

    // Update LUFS target + safe ceiling
    this.targetLufs.set(preset.targetLufs);
    this.safeCeiling.set(preset.safeCeiling);
    (this.audioEngine as any).setMasteringTargets?.({
      lufs: preset.targetLufs,
      truePeak: preset.safeCeiling,
    });
    (this.audioEngine as any).configureCompressor?.({
      threshold: preset.threshold,
      ratio: preset.ratio,
    });
    (this.audioEngine as any).configureLimiter?.({
      ceiling: preset.safeCeiling,
    });

    // Apply per-band deltas (preserve current gain + delta)
    this.bands.update((arr) =>
      arr.map((b) => ({
        ...b,
        gain: Math.max(
          -12,
          Math.min(12, (b.gain ?? 0) + (preset.bandDelta[b.id] ?? 0))
        ),
        ratio: preset.ratio,
        threshold: preset.threshold,
      }))
    );

    // Update live meters to reflect new LUFS target
    this.lufsIntegrated.set(preset.targetLufs);
    this.truePeak.set(preset.safeCeiling);

    this.masteringRoast.set(preset.roastNote);
    this.smartAssistSuggestion.set(
      `${preset.emoji} ${preset.label} preset applied · target ${preset.targetLufs} LUFS`
    );
    this.eqMaskingHint.set(
      `EQ shaped for ${preset.tagline} · AIR ${preset.bandDelta[5] >= 0 ? '+' : ''}${preset.bandDelta[5]?.toFixed(1)}dB, SUB ${preset.bandDelta[1] >= 0 ? '+' : ''}${preset.bandDelta[1]?.toFixed(1)}dB`
    );

    this.snack.success(
      `${preset.emoji} ${preset.label} preset · target ${preset.targetLufs} LUFS, ceiling ${preset.safeCeiling} dBFS`
    );
  }

  // ── Roast message generator ─────────────────────────────────
  refreshRoast(): void {
    const roast = this.aiService.getMasteringRoast?.() ?? null;
    this.masteringRoast.set(
      roast ||
        `Integrated ${this.lufsIntegrated().toFixed(1)} LUFS · peak ${this.truePeak().toFixed(1)} dBFS · ${this.activePresetId() ? 'preset active' : 'custom shape'}`
    );
    this.haptic.medium();
  }

  async processMastering() {
    this.refreshRoast();
    this.isProcessing.set(true);
    try {
      // Auto-detect genre if none selected
      const genre = this.selectedGenre() || undefined;
      if (!genre) {
        this.aiDetectedGenre.set(this.aiMix.detectGenre());
      }

      // Run the full AI auto-master analysis chain with genre hint
      const report = this.aiMix.autoMaster(genre);

      // Update UI with mastering targets from the engine
      const targets = this.audioEngine.getMasteringTargets();
      this.targetLufs.set(targets.lufs);
      this.safeCeiling.set(targets.truePeak);

      // Build smart assist readout from the report
      const summaryLines = report.filter((l) => l.startsWith('🎯') || l.startsWith('✅'));
      this.smartAssistSuggestion.set(summaryLines.join(' · ') || 'AI Master applied');

      // Show EQ hint from the report
      const eqLine = report.find((l) => l.startsWith('📈'));
      this.eqMaskingHint.set(eqLine?.replace('📈 ', '') || 'EQ optimized for mix density');

      // Update roast with the analysis
      const detailLines = report.filter((l) => !l.startsWith('🎯') && !l.startsWith('✅') && !l.startsWith('📈'));
      this.masteringRoast.set(detailLines.join(' | '));

      // Deactivate manual preset since AI chose optimal settings
      this.activePresetId.set(null);

      this.snack.success('AI Mastering complete — full chain optimized');
    } finally {
      this.isProcessing.set(false);
    }
  }

  updateTargetLufs(value: number) {
    const next = Math.max(-24, Math.min(-8, value));
    this.targetLufs.set(next);
    (this.audioEngine as any).setMasteringTargets?.({ lufs: next });
    this.activePresetId.set(null); // manually overridden
  }

  updateSafeCeiling(value: number) {
    const next = Math.max(-1.2, Math.min(-0.01, value));
    this.safeCeiling.set(next);
    (this.audioEngine as any).setMasteringTargets?.({ truePeak: next });
    this.activePresetId.set(null);
  }

  private startSpectrogram() {
    const canvas = this.spectrogramRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const analyser = (this.audioEngine as any).getMasterAnalyser?.();
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
        ctx.fillStyle = '#0d0d0d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 1);
      }

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const x = (i / bufferLength) * canvas.width;
        const hue = (value / 255) * 280;
        ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${value / 255})`;
        ctx.fillRect(x, 0, canvas.width / bufferLength, 1);
      }
    };
    draw();
  }
}
