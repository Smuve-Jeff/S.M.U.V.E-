import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-waveform-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './waveform-renderer.component.html',
  styleUrls: ['./waveform-renderer.component.css'],
  host: {
    // Only an interactive waveform may claim the gesture; a display-only
    // waveform must stay scrollable on a phone.
    '[class.wr-interactive]': 'loopInteractive',
  },
})
export class WaveformRendererComponent implements AfterViewInit, OnChanges, OnDestroy {
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

  // Stored bound handlers so they can be removed in ngOnDestroy
  private readonly _onMouseDown = this.onCanvasMouseDown.bind(this);
  private readonly _onMouseMove = this.onCanvasMouseMove.bind(this);
  private readonly _onMouseUp = this.onCanvasMouseUp.bind(this);
  private readonly _onPointerDown = this.onCanvasPointerDown.bind(this);
  private readonly _onPointerMove = this.onCanvasPointerMove.bind(this);
  private readonly _onPointerUp = this.onCanvasPointerUp.bind(this);

  /**
   * Pointer Events unify mouse, touch and pen, so the loop handles stay
   * draggable on a touchscreen. Detected at registration: engines without
   * PointerEvent (jsdom, legacy) keep the mouse-only path.
   */
  private usesPointerEvents = false;

  /** Finger-sized hit slop (px) for the loop handles on coarse pointers. */
  private static readonly TOUCH_HANDLE_RADIUS = 22;
  private static readonly MOUSE_HANDLE_RADIUS = 10;

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.draw();

    if (this.loopInteractive) {
      this.usesPointerEvents =
        typeof window !== 'undefined' && 'PointerEvent' in window;

      if (this.usesPointerEvents) {
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('pointercancel', this._onPointerUp);
      } else {
        canvas.addEventListener('mousedown', this._onMouseDown);
        canvas.addEventListener('mousemove', this._onMouseMove);
        canvas.addEventListener('mouseup', this._onMouseUp);
        canvas.addEventListener('mouseleave', this._onMouseUp);
      }
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.ctx) this.draw();
  }

  ngOnDestroy() {
    if (this.loopInteractive) {
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        canvas.removeEventListener('pointerdown', this._onPointerDown);
        canvas.removeEventListener('pointermove', this._onPointerMove);
        canvas.removeEventListener('pointerup', this._onPointerUp);
        canvas.removeEventListener('pointercancel', this._onPointerUp);
        canvas.removeEventListener('mousedown', this._onMouseDown);
        canvas.removeEventListener('mousemove', this._onMouseMove);
        canvas.removeEventListener('mouseup', this._onMouseUp);
        canvas.removeEventListener('mouseleave', this._onMouseUp);
      }
    }
  }

  // ── Draggable loop handle interaction ─────────────

  /**
   * Touch drag entry point. A finger covers far more than the 10px mouse hit
   * slop, so the radius widens for coarse pointers; otherwise tapping the
   * handle would need pixel precision and the gesture would be lost to the
   * browser's pan/zoom instead of reaching the canvas.
   */
  private onCanvasPointerDown(event: PointerEvent): void {
    const radius =
      event.pointerType === 'touch' || event.pointerType === 'pen'
        ? WaveformRendererComponent.TOUCH_HANDLE_RADIUS
        : WaveformRendererComponent.MOUSE_HANDLE_RADIUS;
    const handle = this.hitTestLoopHandle(event.clientX, radius);
    if (!handle) return;

    this.draggingHandle = handle;
    // Capture keeps pointermove flowing once the finger slides off the canvas,
    // and preventDefault stops the browser from promoting the drag to a scroll
    // gesture or from emitting a click alongside it.
    this.canvasRef.nativeElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private onCanvasPointerMove(event: PointerEvent): void {
    if (!this.draggingHandle) return;
    event.preventDefault();
    this.applyLoopDrag(event.clientX);
  }

  private onCanvasPointerUp(event: PointerEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (this.draggingHandle && canvas?.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    this.draggingHandle = null;
  }

  private onCanvasMouseDown(event: MouseEvent): void {
    const handle = this.hitTestLoopHandle(
      event.clientX,
      WaveformRendererComponent.MOUSE_HANDLE_RADIUS,
    );
    if (handle) this.draggingHandle = handle;
  }

  private onCanvasMouseMove(event: MouseEvent): void {
    if (!this.draggingHandle) return;
    this.applyLoopDrag(event.clientX);
  }

  private onCanvasMouseUp(_event: MouseEvent): void {
    this.draggingHandle = null;
  }

  /** Which loop handle, if any, sits within `radiusCss` px of `clientX`.
   *  Worked in CSS pixels: the canvas keeps an 800px backing store that CSS
   *  stretches to the container, so an internal-pixel radius would shrink with
   *  the display and turn the handles into ungrabbable slivers on a phone. */
  private hitTestLoopHandle(
    clientX: number,
    radiusCss: number,
  ): 'start' | 'end' | null {
    if (this.loopStart === null || this.loopEnd === null) return null;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    if (!rect.width) return null;

    const x = clientX - rect.left;
    const distToStart = Math.abs(x - this.loopStart * rect.width);
    const distToEnd = Math.abs(x - this.loopEnd * rect.width);

    if (distToStart <= radiusCss && distToStart <= distToEnd) return 'start';
    if (distToEnd <= radiusCss) return 'end';
    return null;
  }

  /** Move the captured handle to `clientX`, keeping start < end. */
  private applyLoopDrag(clientX: number): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );

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

      // Interactive handle markers. Sized against the real display scale so a
      // finger gets roughly a 20px target once the 800px backing store is
      // stretched down to a phone-width container.
      if (this.loopInteractive) {
        const displayScale =
          canvas.clientWidth > 0 ? canvas.clientWidth / canvas.width : 1;
        const halfW = Math.min(
          Math.max(6, Math.round(10 / displayScale)),
          Math.round(h / 4),
        );
        const halfH = Math.round(halfW * 1.3);

        // Start handle diamond
        ctx.fillStyle = '#2BA09C';
        ctx.beginPath();
        ctx.moveTo(lx, h / 2 - halfH);
        ctx.lineTo(lx + halfW, h / 2);
        ctx.lineTo(lx, h / 2 + halfH);
        ctx.lineTo(lx - halfW, h / 2);
        ctx.closePath();
        ctx.fill();

        // End handle diamond
        ctx.fillStyle = '#E8A838';
        ctx.beginPath();
        ctx.moveTo(rx, h / 2 - halfH);
        ctx.lineTo(rx + halfW, h / 2);
        ctx.lineTo(rx, h / 2 + halfH);
        ctx.lineTo(rx - halfW, h / 2);
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
