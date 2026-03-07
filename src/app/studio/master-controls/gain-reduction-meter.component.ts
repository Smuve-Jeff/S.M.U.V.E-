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
  template: `
    <div class="meter-wrapper">
      <div class="meter-container">
        <div class="meter-bar" [style.height.%]="reductionPercent"></div>
        <!-- Scale Markings -->
        <div class="markings">
          <span style="top: 0%">0</span>
          <span style="top: 25%">3</span>
          <span style="top: 50%">6</span>
          <span style="top: 75%">12</span>
          <span style="top: 100%">20</span>
        </div>
      </div>
      <div class="meter-value" [class.active]="reductionDb > 0">
        {{ reductionDb.toFixed(1) }} dB
      </div>
    </div>
  `,
  styles: [
    `
      .meter-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .meter-container {
        width: 12px;
        height: 60px;
        background: #020617;
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 2px;
        position: relative;
        overflow: hidden;
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.8);
      }
      .meter-bar {
        background: linear-gradient(to bottom, #ef4444, #f97316);
        width: 100%;
        position: absolute;
        top: 0;
        transition: height 0.05s ease-out;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
      }
      .markings {
        position: absolute;
        right: -14px;
        top: 0;
        bottom: 0;
        width: 10px;
        pointer-events: none;
      }
      .markings span {
        position: absolute;
        font-size: 6px;
        font-family: monospace;
        color: #475569;
        transform: translateY(-50%);
      }
      .meter-value {
        font-size: 8px;
        font-family: 'JetBrains Mono', monospace;
        color: #475569;
        transition: color 0.2s;
      }
      .meter-value.active {
        color: #ef4444;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GainReductionMeterComponent implements AfterViewInit, OnDestroy {
  @Input() compressor?: DynamicsCompressorNode;

  reductionDb = 0;
  reductionPercent = 0;
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
          // Map 0-20dB to 0-100%
          this.reductionPercent = Math.min((this.reductionDb / 20) * 100, 100);
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
