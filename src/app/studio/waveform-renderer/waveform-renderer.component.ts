import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-waveform-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './waveform-renderer.component.html',
  styleUrls: ['./waveform-renderer.component.css'],
})
export class WaveformRendererComponent implements AfterViewInit, OnChanges {
  /** Raw PCM data (Float32Array, -1..1). Null = placeholder / empty. */
  @Input() audioData: Float32Array | null = null;
  /** Duration in seconds. Used for playhead positioning. */
  @Input() duration = 0;
  /** Playback progress 0..1. Draws the playhead line. */
  @Input() progress = 0;
  /** Waveform fill colour. Falls back to teal CSS variable. */
  @Input() color = 'var(--teal-500, #0E7C7B)';
  /** Whether a recording is in progress (shows live overlays). */
  @Input() isRecording = false;
  /** Display mode: 'bars' | 'envelope' | 'mirrored' */
  @Input() mode: 'bars' | 'envelope' | 'mirrored' = 'envelope';

  /** Loop region start position (0..1 as fraction of waveform). Null = no loop. */
  @Input() loopStart: number | null = null;
  /** Loop region end position (0..1 as fraction of waveform). Null = no loop. */
  @Input() loopEnd: number | null = null;
  /** Whether loop handles are interactive (draggable / clickable to set). */
  @Input() loopInteractive = false;
  /** Emitted when loopStart changes via drag interaction */
  @Output() loopStartChange = new EventEmitter<number>();
  /** Emitted when loopEnd changes via drag interaction */
  @Output() loopEndChange = new EventEmitter<number>();

  @ViewChild('waveCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx: CanvasRenderingContext2D | null = null;

  // ── Draggable loop handle state ───────────────────
  private draggingHandle: 'start' | 'end' | null = null;

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.draw();

    if (this.loopInteractive) {
      canvas.addEventListener('mousedown', this.onCanvasMouseDown.bind(this));
      canvas.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));
      canvas.addEventListener('mouseup', this.onCanvasMouseUp.bind(this));
      canvas.addEventListener('mouseleave', this.onCanvasMouseUp.bind(this));
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.ctx) this.draw();
  }

  // ── Draggable loop handle interaction ─────────────
  private onCanvasMouseDown(event: MouseEvent): void {
    if (this.loopStart === null || this.loopEnd === null) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const w = canvas.width;
    const x = (event.clientX - rect.left) / rect.width;

    const startX = this.loopStart * w;
    const endX = this.loopEnd * w;
    const pixelX = x * w;
    const handleRadius = 10;

    // Check if click is near start or end handle
    const distToStart = Math.abs(pixelX - startX);
    const distToEnd = Math.abs(pixelX - endX);

    if (distToStart < handleRadius && distToStart <= distToEnd) {
      this.draggingHandle = 'start';
    } else if (distToEnd < handleRadius) {
      this.draggingHandle = 'end';
    }
  }

  private onCanvasMouseMove(event: MouseEvent): void {
    if (!this.draggingHandle) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

    if (this.draggingHandle === 'start') {
      if (ratio < (this.loopEnd ?? 1) - 0.01) {
        this.loopStartChange.emit(ratio);
      }
    } else if (this.draggingHandle === 'end') {
      if (ratio > (this.loopStart ?? 0) + 0.01) {
        this.loopEndChange.emit(ratio);
      }
    }
  }

  private onCanvasMouseUp(_event: MouseEvent): void {
    this.draggingHandle = null;
  }

  /**
   * Down-samples audio data into peak values fitting the canvas width.
   * Returns an array of {min, max} per pixel column.
   */
  private computePeaks(width: number): { min: number; max: number }[] {
    const data = this.audioData;
    const peaks: { min: number; max: number }[] = [];
    if (!data || data.length === 0 || width <= 0) {
      // Return flat line
      return Array.from({ length: width }, () => ({ min: 0, max: 0 }));
    }

    const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      let min = 0;
      let max = 0;
      for (let s = start; s < start + samplesPerPixel && s < data.length; s++) {
        const v = data[s];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks.push({ min, max });
    }
    return peaks;
  }

  /** Main draw entry point. */
  draw() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'var(--espresso-text, #1F1A12)';
    // Fallback for CSS variable in canvas
    ctx.fillStyle = '#1A1814';
    ctx.fillRect(0, 0, w, h);

    const peaks = this.computePeaks(w);
    if (peaks.length === 0) return;

    const midY = h / 2;

    ctx.save();

    if (this.mode === 'bars') {
      this.drawBars(ctx, peaks, w, h, midY);
    } else if (this.mode === 'mirrored') {
      this.drawMirrored(ctx, peaks, w, h, midY);
    } else {
      this.drawEnvelope(ctx, peaks, w, h, midY);
    }

    // Playhead
    if (this.progress > 0 && this.duration > 0) {
      const px = Math.round(this.progress * w);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();

      // Playhead glow
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Loop region overlay
    if (this.loopStart !== null && this.loopEnd !== null) {
      const lx = Math.round(this.loopStart * w);
      const rx = Math.round(this.loopEnd * w);

      // Translucent highlight for loop region
      ctx.fillStyle = 'rgba(43, 160, 156, 0.08)';
      ctx.fillRect(lx, 0, rx - lx, h);

      // Loop start marker
      ctx.strokeStyle = '#2BA09C';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();

      // Loop end marker
      ctx.strokeStyle = '#E8A838';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx, h);
      ctx.stroke();

      // Loop label
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(43, 160, 156, 0.6)';
      ctx.font = '9px monospace';
      ctx.fillText(`⟳ ${(this.loopEnd - this.loopStart) * 100}%`, lx + 4, 14);

      // Interactive handle markers
      if (this.loopInteractive) {
        // Start handle diamond
        ctx.fillStyle = '#2BA09C';
        ctx.beginPath();
        ctx.moveTo(lx, h / 2 - 8);
        ctx.lineTo(lx + 6, h / 2);
        ctx.lineTo(lx, h / 2 + 8);
        ctx.lineTo(lx - 6, h / 2);
        ctx.closePath();
        ctx.fill();

        // End handle diamond
        ctx.fillStyle = '#E8A838';
        ctx.beginPath();
        ctx.moveTo(rx, h / 2 - 8);
        ctx.lineTo(rx + 6, h / 2);
        ctx.lineTo(rx, h / 2 + 8);
        ctx.lineTo(rx - 6, h / 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Recording pulse overlay
    if (this.isRecording) {
      ctx.fillStyle = 'rgba(185,28,28,0.12)';
      ctx.fillRect(0, 0, w, h);

      // Right-edge recording glow
      const grad = ctx.createLinearGradient(w - 60, 0, w, 0);
      grad.addColorStop(0, 'rgba(185,28,28,0)');
      grad.addColorStop(1, 'rgba(185,28,28,0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(w - 60, 0, 60, h);
    }

    ctx.restore();
  }

  /** Bar-style waveform (like FL Studio step view). */
  private drawBars(
    ctx: CanvasRenderingContext2D,
    peaks: { min: number; max: number }[],
    w: number,
    h: number,
    midY: number
  ) {
    const barW = Math.max(1, w / peaks.length);
    ctx.fillStyle = this.color;
    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i].max;
      const barH = Math.max(1, amp * midY * 1.2);
      ctx.fillRect(i * barW, midY - barH / 2, barW - 0.5, barH);
    }
  }

  /** Envelope outline (like most DAWs). */
  private drawEnvelope(
    ctx: CanvasRenderingContext2D,
    peaks: { min: number; max: number }[],
    w: number,
    h: number,
    midY: number
  ) {
    const barW = Math.max(1, w / peaks.length);

    // Top envelope
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW + barW / 2;
      const y = midY - peaks[i].max * midY * 0.9;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, midY);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bottom envelope (mirrored)
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW + barW / 2;
      const y = midY + Math.abs(peaks[i].min) * midY * 0.9;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, midY);
    ctx.closePath();
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
  }

  /** Mirrored bars (like Pioneer CDJ waveform). */
  private drawMirrored(
    ctx: CanvasRenderingContext2D,
    peaks: { min: number; max: number }[],
    w: number,
    h: number,
    midY: number
  ) {
    const barW = Math.max(1, w / peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      const { min, max } = peaks[i];
      const topH = Math.max(1, max * midY * 0.95);
      const botH = Math.max(1, Math.abs(min) * midY * 0.95);
      ctx.fillStyle = this.color;
      ctx.fillRect(i * barW, midY - topH, barW - 0.5, topH);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(i * barW, midY, barW - 0.5, botH);
      ctx.globalAlpha = 1;
    }
  }
}
