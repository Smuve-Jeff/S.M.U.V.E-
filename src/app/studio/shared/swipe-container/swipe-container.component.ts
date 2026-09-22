import {
  Component,
  output,
  input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-swipe-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './swipe-container.component.html',
  styleUrls: ['./swipe-container.component.css', '../platform-ux.css'],
})
export class SwipeContainerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: false })
  container!: ElementRef<HTMLDivElement>;

  swipeLeft = output<void>();
  swipeRight = output<void>();
  swipeUp = output<void>();
  swipeDown = output<void>();

  threshold = input<number>(50);
  disabled = input<boolean>(false);

  private startX = 0;
  private startY = 0;
  private startTime = 0;

  // Keep stable listener references so teardown actually removes the handlers.
  private readonly boundTouchStart = this.onTouchStart.bind(this);
  private readonly boundTouchEnd = this.onTouchEnd.bind(this);

  ngAfterViewInit() {
    const el = this.container.nativeElement;
    el.addEventListener('touchstart', this.boundTouchStart, {
      passive: true,
    });
    el.addEventListener('touchend', this.boundTouchEnd, {
      passive: true,
    });
  }

  ngOnDestroy() {
    const el = this.container?.nativeElement;
    if (el) {
      el.removeEventListener('touchstart', this.boundTouchStart);
      el.removeEventListener('touchend', this.boundTouchEnd);
    }
  }

  private onTouchStart(e: TouchEvent) {
    if (this.disabled()) return;
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.startTime = Date.now();
  }

  private onTouchEnd(e: TouchEvent) {
    if (this.disabled()) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - this.startX;
    const deltaY = endY - this.startY;
    const deltaTime = Date.now() - this.startTime;

    if (deltaTime > 300) return;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const thresh = this.threshold();

    if (absX > absY && absX > thresh) {
      if (deltaX > 0) {
        this.swipeRight.emit();
      } else {
        this.swipeLeft.emit();
      }
    } else if (absY > absX && absY > thresh) {
      if (deltaY > 0) {
        this.swipeDown.emit();
      } else {
        this.swipeUp.emit();
      }
    }
  }
}
