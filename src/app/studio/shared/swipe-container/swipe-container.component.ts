import { Component, output, input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-swipe-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './swipe-container.component.html',
  styleUrls: ['./swipe-container.component.css']
})
export class SwipeContainerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: false }) container!: ElementRef<HTMLDivElement>;
  
  swipeLeft = output<void>();
  swipeRight = output<void>();
  swipeUp = output<void>();
  swipeDown = output<void>();
  
  threshold = input<number>(50);
  
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  
  ngAfterViewInit() {
    const el = this.container.nativeElement;
    el.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
    el.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });
  }
  
  ngOnDestroy() {
    const el = this.container?.nativeElement;
    if (el) {
      el.removeEventListener('touchstart', this.onTouchStart.bind(this));
      el.removeEventListener('touchend', this.onTouchEnd.bind(this));
    }
  }
  
  private onTouchStart(e: TouchEvent) {
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.startTime = Date.now();
  }
  
  private onTouchEnd(e: TouchEvent) {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - this.startX;
    const deltaY = endY - this.startY;
    const deltaTime = Date.now() - this.startTime;
    
    // Only trigger if swipe is fast enough (< 300ms)
    if (deltaTime > 300) return;
    
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const thresh = this.threshold();
    
    // Horizontal swipe
    if (absX > absY && absX > thresh) {
      if (deltaX > 0) {
        this.swipeRight.emit();
      } else {
        this.swipeLeft.emit();
      }
    }
    // Vertical swipe
    else if (absY > absX && absY > thresh) {
      if (deltaY > 0) {
        this.swipeDown.emit();
      } else {
        this.swipeUp.emit();
      }
    }
  }
}
