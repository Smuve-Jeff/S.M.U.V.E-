import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-microphone-visualizer',
  standalone: true,
  imports: [CommonModule],
  template: `<canvas #canvasRef style="width:100%; height:100%;"></canvas>`,
})
export class MicrophoneVisualizerComponent implements AfterViewInit, OnDestroy {
  @Input() analyserNode: AnalyserNode | undefined;
  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLCanvasElement>;

  private animationFrameId: number | null = null;
  private dataArray: Uint8Array = new Uint8Array(0);

  constructor() {}

  ngAfterViewInit() {
    if (this.analyserNode) {
      this.dataArray = new Uint8Array(
        Number(this.analyserNode.frequencyBinCount)
      );
      this.draw();
    }
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private draw() {
    if (!this.analyserNode || !this.canvasRef) {
      return;
    }

    if (
      !this.dataArray ||
      this.dataArray.length !== this.analyserNode.frequencyBinCount
    ) {
      this.dataArray = new Uint8Array(
        Number(this.analyserNode.frequencyBinCount)
      );
    }

    this.animationFrameId = requestAnimationFrame(() => this.draw());

    this.analyserNode.getByteFrequencyData(this.dataArray as any);
    const canvas = this.canvasRef.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);

    const barWidth = (width / this.dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const barHeight = this.dataArray[i];
      context.fillStyle = `rgb(50, ${barHeight + 100}, 50)`;
      context.fillRect(x, height - barHeight / 2, barWidth, barHeight / 2);
      x += barWidth + 1;
    }
  }
}
