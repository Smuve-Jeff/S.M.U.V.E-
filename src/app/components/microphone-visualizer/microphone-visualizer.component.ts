import { Component, Input, ElementRef, OnChanges, SimpleChanges, OnDestroy, ChangeDetectionStrategy, viewChild } from '@angular/core';

@Component({
  selector: 'app-microphone-visualizer',
  standalone: true,
  imports: [],
  template: `<canvas #canvas class="w-full h-full"></canvas>`,
  styles: [`:host { display: block; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MicrophoneVisualizerComponent implements OnChanges, OnDestroy {
  @Input() analyserNode?: AnalyserNode;
  @Input() color: string = '#39ff14'; // Default to gaming green

  canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private animationFrameId?: number;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['analyserNode'] && this.analyserNode) {
      this.visualize();
    } else {
      this.stopVisualization();
    }
  }

  ngOnDestroy(): void {
    this.stopVisualization();
  }

  private visualize(): void {
    if (!this.analyserNode || !this.canvas) return;

    const canvasEl = this.canvas()!.nativeElement;
    const canvasCtx = canvasEl.getContext('2d');
    if (!canvasCtx) return;

    this.analyserNode.fftSize = 256;
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.analyserNode) return;
      this.animationFrameId = requestAnimationFrame(draw);

      this.analyserNode.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      canvasCtx.fillStyle = 'transparent';
      canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);

      const barWidth = (canvasEl.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        canvasCtx.fillStyle = this.color;
        canvasCtx.fillRect(x, canvasEl.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    this.stopVisualization(); // Stop any previous animation
    draw();
  }

  private stopVisualization(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}
