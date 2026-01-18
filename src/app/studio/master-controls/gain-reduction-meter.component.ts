import {
  Component,
  Input,
  ChangeDetectionStrategy,
  ElementRef,
  OnDestroy,
  ChangeDetectorRef,
  NgZone,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-gain-reduction-meter',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="meter-container">
    <div class="meter-bar" [style.height.%]="reductionDb"></div>
  </div>`,
  styles: [
    `
      .meter-container {
        width: 20px;
        height: 100px;
        background-color: #333;
        border: 1px solid #555;
        position: relative;
        overflow: hidden;
      }
      .meter-bar {
        background-color: #ff4500;
        width: 100%;
        position: absolute;
        bottom: 0;
        transition: height 0.1s ease-out;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GainReductionMeterComponent implements AfterViewInit, OnDestroy {
  @Input() compressor?: DynamicsCompressorNode;

  reductionDb = 0;
  private animationFrameId?: number;

  constructor(
    private readonly el: ElementRef,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone
  ) {}

  ngAfterViewInit(): void {
    if (this.compressor) {
      this.zone.runOutsideAngular(() => this.startMonitoring());
    }
  }

  ngOnDestroy(): void {
    this.stopMonitoring();
  }

  private startMonitoring(): void {
    const updateMeter = () => {
      if (this.compressor) {
        const reduction = this.compressor.reduction;
        // Ensure reduction is a finite number before updating
        if (isFinite(reduction)) {
          this.reductionDb = Math.abs(reduction);
          this.cdr.detectChanges();
        }
      }
      this.animationFrameId = requestAnimationFrame(updateMeter);
    };
    this.animationFrameId = requestAnimationFrame(updateMeter);
  }

  private stopMonitoring(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}
