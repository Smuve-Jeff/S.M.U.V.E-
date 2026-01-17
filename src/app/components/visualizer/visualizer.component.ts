import {
  Component,
  OnInit,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';

@Component({
  selector: 'app-visualizer',
  standalone: true,
  imports: [],
  templateUrl: './visualizer.component.html',
  styleUrls: ['./visualizer.component.css'],
})
export class VisualizerComponent implements OnInit, AfterViewInit {
  @ViewChild('visualizerCanvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.animate();
  }

  private animate(): void {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  private draw(): void {
    if (!this.ctx) {
      return;
    }
    this.ctx.clearRect(
      0,
      0,
      this.canvasRef.nativeElement.width,
      this.canvasRef.nativeElement.height
    );
    this.ctx.fillStyle = 'red';
    this.ctx.beginPath();
    this.ctx.arc(
      this.canvasRef.nativeElement.width / 2,
      this.canvasRef.nativeElement.height / 2,
      50 * Math.sin(Date.now() / 200) + 100,
      0,
      2 * Math.PI
    );
    this.ctx.fill();
  }
}
