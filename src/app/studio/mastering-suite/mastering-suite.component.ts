import {
  Component,
  inject,
  signal,
  AfterViewInit,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';

interface MasteringBand {
  id: number;
  name: string;
  range: string;
  gain: number;
  threshold: number;
  ratio: number;
}

@Component({
  selector: 'app-mastering-suite',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mastering-suite.component.html',
  styleUrls: ['./mastering-suite.component.css'],
})
export class MasteringSuiteComponent implements AfterViewInit {
  private audioEngine = inject(AudioEngineService);
  public aiService = inject(AiService);
  public uiService = inject(UIService);

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

  lufsIntegrated = signal(-12.42);
  truePeak = signal(-0.08);
  lra = signal(6.2);
  correlation = signal(0.82);
  targetLufs = signal(-14);
  safeCeiling = signal(-0.1);
  isProcessing = signal(false);
  smartAssistSuggestion = signal<string>('');
  eqMaskingHint = signal<string>('');

  ngAfterViewInit() {
    const targets = this.audioEngine.getMasteringTargets();
    this.targetLufs.set(targets.lufs);
    this.safeCeiling.set(targets.truePeak);
    this.startSpectrogram();
  }

  async processMastering() {
    this.isProcessing.set(true);
    try {
      const settings = await this.aiService.getAutoMixSettings();
      const assist = this.aiService.getProductionSmartAssist({
        arrangementDensity: 0.68,
        midMaskingRisk: 0.61,
        transientSharpness: 0.74,
      });

      const mergedThreshold = Math.min(
        settings.threshold,
        assist.correctivePreset.compressorThreshold
      );
      const mergedRatio = Math.max(
        settings.ratio,
        assist.correctivePreset.compressorRatio
      );
      const mergedCeiling = Math.min(
        settings.ceiling,
        assist.correctivePreset.limiterCeiling
      );
      const mergedTargetLufs = Math.min(
        settings.targetLufs,
        assist.correctivePreset.targetLufs
      );

      this.audioEngine.configureCompressor({
        threshold: mergedThreshold,
        ratio: mergedRatio,
      });
      this.audioEngine.configureLimiter({ ceiling: mergedCeiling });
      this.audioEngine.setMasteringTargets({
        lufs: mergedTargetLufs,
        truePeak: mergedCeiling,
      });
      this.targetLufs.set(mergedTargetLufs);
      this.safeCeiling.set(mergedCeiling);
      this.smartAssistSuggestion.set(assist.arrangementSuggestion);
      this.eqMaskingHint.set(assist.eqMaskingHint);
    } finally {
      this.isProcessing.set(false);
    }
  }

  updateTargetLufs(value: number) {
    const next = Math.max(-24, Math.min(-8, value));
    this.targetLufs.set(next);
    this.audioEngine.setMasteringTargets({ lufs: next });
  }

  updateSafeCeiling(value: number) {
    const next = Math.max(-1.2, Math.min(-0.01, value));
    this.safeCeiling.set(next);
    this.audioEngine.setMasteringTargets({ truePeak: next });
  }

  private startSpectrogram() {
    const canvas = this.spectrogramRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const analyser = this.audioEngine.getMasterAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Copy current frame and shift down
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      tempCanvas.getContext('2d')!.drawImage(canvas, 0, 0);

      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 1);

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const x = (i / bufferLength) * canvas.width;
        const hue = (value / 255) * 280; // Spectral color
        ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${value / 255})`;
        ctx.fillRect(x, 0, canvas.width / bufferLength, 1);
      }
    };
    draw();
  }
}
