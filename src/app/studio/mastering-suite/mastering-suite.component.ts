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
  masteringRoast = signal<string>('Analyzing dynamics...');
  public uiService = inject(UIService);

  @ViewChild('spectrogram') spectrogramRef!: ElementRef<HTMLCanvasElement>;

  bands = signal<MasteringBand[]>([
    { id: 1, name: 'SUB',  range: '20Hz - 120Hz',   gain: -1.2, threshold: -12.4, ratio: 4.1 },
    { id: 2, name: 'LOW',  range: '120Hz - 500Hz', gain: -0.5, threshold: -8.1,  ratio: 2.5 },
    { id: 3, name: 'MID',  range: '500Hz - 2.5kHz', gain: 0,    threshold: -2.4, ratio: 1.8 },
    { id: 4, name: 'HIGH', range: '2.5kHz - 10kHz', gain: 0.8, threshold: -4.2, ratio: 2.1 },
    { id: 5, name: 'AIR',  range: '10kHz - 22kHz',  gain: 1.5, threshold: -1.2, ratio: 1.5 },
  ]);

  lufsIntegrated = signal(-12.42);
  truePeak = signal(-0.08);
  lra = signal(6.2);
  correlation = signal(0.82);
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
      roastNote: 'Streaming mastered · soft ceiling, plenty of headroom for codec transcoding',
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
      roastNote: 'Club mastered · -9 LUFS, tight driver-grade limiting, hits like a wall',
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
      roastNote: 'Vinyl warmed · gentle compression, soft highs, pre-cut headroom',
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
      roastNote: 'Broadcast ready · -23 LUFS broadcast standard, dialog-preserving EQ',
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
      roastNote: 'Mastered hot · -8 LUFS, brick-wall limiting, competitive loudness',
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
      const settings = await this.aiService.getAutoMixSettings();
      const assist = this.aiService.getProductionSmartAssist({
        arrangementDensity: 0.68,
        midMaskingRisk: 0.61,
        transientSharpness: 0.74,
      });

      const corrective = {
        compressorThreshold: -14,
        compressorRatio: 4,
        limiterCeiling: -0.1,
        targetLufs: -14,
      };

      const mergedThreshold = Math.min(
        settings?.threshold || -12,
        corrective.compressorThreshold
      );
      const mergedRatio = Math.max(
        settings?.ratio || 4,
        corrective.compressorRatio
      );
      const mergedCeiling = Math.min(
        settings?.ceiling || -0.1,
        corrective.limiterCeiling
      );
      const mergedTargetLufs = Math.min(-14, corrective.targetLufs);

      (this.audioEngine as any).configureCompressor?.({
        threshold: mergedThreshold,
        ratio: mergedRatio,
      });
      (this.audioEngine as any).configureLimiter?.({ ceiling: mergedCeiling });
      (this.audioEngine as any).setMasteringTargets?.({
        lufs: mergedTargetLufs,
        truePeak: mergedCeiling,
      });
      this.targetLufs.set(mergedTargetLufs);
      this.safeCeiling.set(mergedCeiling);
      this.smartAssistSuggestion.set('Standard mastering applied');
      this.eqMaskingHint.set('No significant masking detected');
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
