import { Injectable, signal, computed } from '@angular/core';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeEvent {
  direction: SwipeDirection;
  distance: number;
  velocity: number;
  duration: number;
}

export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
  force: number; // 3D Touch / Force Touch pressure (0..1 fallback)
}

export interface PinchState {
  scale: number;
  center: { x: number; y: number };
  velocity: number;
  angle: number; // rotation angle in degrees
}

export interface LongPressEvent {
  x: number;
  y: number;
  duration: number;
  target: EventTarget | null;
}

export type GestureMode = 'normal' | 'precision' | 'momentum';

@Injectable({
  providedIn: 'root',
})
export class EnhancedTouchGestureService {
  // ── Configuration ─────────────────────────────────────
  readonly minZoom = 0.25;
  readonly maxZoom = 8.0;
  readonly swipeThreshold = 30;
  readonly swipeVelocityThreshold = 0.15;
  readonly longPressMs = 500;
  readonly doubleTapMs = 280;
  readonly precisionModeSensitivity = 0.3; // 30% of normal
  readonly momentumFriction = 0.92;
  readonly pinchDeadZone = 0.02;

  // ── Public signals ────────────────────────────────────
  zoomLevel = signal(1.0);
  verticalZoomLevel = signal(1.0);
  scrollOffsetX = signal(0);
  scrollOffsetY = signal(0);
  isSwipeActive = signal(false);
  isPinching = signal(false);
  isDragging = signal(false);
  isLongPressing = signal(false);
  gestureMode = signal<GestureMode>('normal');
  lastSwipe = signal<SwipeEvent | null>(null);
  lastPinch = signal<PinchState | null>(null);
  lastLongPress = signal<LongPressEvent | null>(null);
  activeTouchCount = signal(0);

  /** Current touch velocity in pixels/ms */
  touchVelocity = computed(() => {
    const h = this.velocityHistory();
    if (h.length < 2) return 0;
    const recent = h.slice(-4);
    let totalDist = 0;
    let totalTime = 0;
    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].x - recent[i - 1].x;
      const dy = recent[i].y - recent[i - 1].y;
      totalDist += Math.hypot(dx, dy);
      totalTime += recent[i].timestamp - recent[i - 1].timestamp;
    }
    return totalTime > 0 ? totalDist / totalTime : 0;
  });

  /** Current touch force (0..1) — falls back to velocity-mapped value */
  touchForce = signal(0);

  // ── Private state ─────────────────────────────────────
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private lastPinchDistance = 0;
  private lastPinchAngle = 0;
  private lastPinchCenterX = 0;
  private lastPinchCenterY = 0;
  private lastPinchTime = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private doubleTapTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private velocityHistory = signal<TouchPoint[]>([]);
  private momentumRAF: number | null = null;
  private momentumVx = 0;
  private momentumVy = 0;
  private dragStartZoom = 1;
  private twoFingerStartDistance = 0;

  // ── Swipe handling ────────────────────────────────────

  handleSwipeStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchStartTime = Date.now();
      this.isSwipeActive.set(true);
      this.activeTouchCount.set(1);

      // Record force
      const force = (touch as any).force;
      this.touchForce.set(typeof force === 'number' && force > 0 ? force : 0);

      // Track velocity
      this.pushVelocityPoint(touch.clientX, touch.clientY);

      // Start long-press detection
      this.startLongPress(touch.clientX, touch.clientY, event.target);

      // Cancel momentum
      this.cancelMomentum();
    }

    if (event.touches.length === 2) {
      this.isPinching.set(true);
      this.activeTouchCount.set(2);
      this.cancelLongPress();

      const t1 = event.touches[0];
      const t2 = event.touches[1];
      this.twoFingerStartDistance = Math.hypot(
        t2.clientX - t1.clientX,
        t2.clientY - t1.clientY
      );
      this.lastPinchAngle = Math.atan2(
        t2.clientY - t1.clientY,
        t2.clientX - t1.clientX
      ) * (180 / Math.PI);
      this.lastPinchCenterX = (t1.clientX + t2.clientX) / 2;
      this.lastPinchCenterY = (t1.clientY + t2.clientY) / 2;
      this.lastPinchDistance = this.twoFingerStartDistance;
      this.lastPinchTime = Date.now();

      // Two-finger touch implies precision mode intent
      if (this.gestureMode() !== 'precision') {
        this.gestureMode.set('precision');
      }
    }
  }

  handleSwipeMove(event: TouchEvent) {
    if (event.touches.length === 1 && this.isSwipeActive()) {
      const touch = event.touches[0];
      this.pushVelocityPoint(touch.clientX, touch.clientY);
      this.cancelLongPress(); // moved too much for long press

      // Update force
      const force = (touch as any).force;
      if (typeof force === 'number' && force > 0) {
        this.touchForce.set(force);
      }
    }

    if (event.touches.length === 2) {
      this.handlePinch(event);
    }
  }

  handleSwipeEnd(event: TouchEvent): SwipeEvent | null {
    this.cancelLongPress();
    this.activeTouchCount.set(event.touches.length);

    if (event.touches.length === 0) {
      this.isPinching.set(false);
      if (this.gestureMode() === 'precision') {
        this.gestureMode.set('normal');
      }

      // Start momentum if there was velocity
      const vel = this.touchVelocity();
      if (vel > 0.3 && this.isSwipeActive()) {
        this.startMomentum();
      }
    }

    if (event.changedTouches.length !== 1) {
      this.isSwipeActive.set(false);
      return null;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    const duration = Date.now() - this.touchStartTime;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const distance = Math.max(absX, absY);
    const velocity = duration > 0 ? distance / duration : 0;

    this.isSwipeActive.set(false);

    // Double-tap detection
    this.checkDoubleTap(touch.clientX, touch.clientY);

    if (
      distance < this.swipeThreshold ||
      velocity < this.swipeVelocityThreshold
    ) {
      return null;
    }

    let direction: SwipeDirection;
    if (absX > absY) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    const swipeEvent: SwipeEvent = {
      direction,
      distance,
      velocity,
      duration,
    };

    this.lastSwipe.set(swipeEvent);
    return swipeEvent;
  }

  // ── Pinch handling ────────────────────────────────────

  handlePinch(event: TouchEvent): PinchState | null {
    if (event.touches.length !== 2) {
      this.lastPinchDistance = 0;
      return null;
    }

    const t1 = event.touches[0];
    const t2 = event.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    const distance = Math.hypot(dx, dy);
    const centerX = (t1.clientX + t2.clientX) / 2;
    const centerY = (t1.clientY + t2.clientY) / 2;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const now = Date.now();

    if (this.lastPinchDistance > 0) {
      const scale = distance / this.lastPinchDistance;
      const dt = Math.max(1, now - this.lastPinchTime);
      const velocity = Math.abs(scale - 1) / dt * 1000;

      // Apply dead zone to avoid jitter
      if (Math.abs(scale - 1) > this.pinchDeadZone) {
        const sensitivity = this.gestureMode() === 'precision'
          ? this.precisionModeSensitivity
          : 1.0;

        // Horizontal zoom
        this.adjustZoom((scale - 1) * 0.6 * sensitivity);

        // Vertical zoom if pinch is more vertical
        if (Math.abs(dy) > Math.abs(dx) * 1.5) {
          const vScale = Math.abs(dy) / (this.lastPinchDistance || 1);
          this.adjustVerticalZoom((vScale - 1) * 0.4 * sensitivity);
        }
      }

      // Rotation tracking
      const angleDelta = angle - this.lastPinchAngle;
      const normalizedAngleDelta = ((angleDelta + 180) % 360) - 180;

      const pinchState: PinchState = {
        scale: distance / this.twoFingerStartDistance,
        center: { x: centerX, y: centerY },
        velocity,
        angle: normalizedAngleDelta,
      };

      this.lastPinch.set(pinchState);
    }

    this.lastPinchDistance = distance;
    this.lastPinchAngle = angle;
    this.lastPinchCenterX = centerX;
    this.lastPinchCenterY = centerY;
    this.lastPinchTime = now;

    return this.lastPinch();
  }

  // ── Long-press handling ───────────────────────────────

  private startLongPress(x: number, y: number, target: EventTarget | null) {
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      this.isLongPressing.set(true);
      const event: LongPressEvent = {
        x,
        y,
        duration: this.longPressMs,
        target,
      };
      this.lastLongPress.set(event);
    }, this.longPressMs);
  }

  private cancelLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.isLongPressing()) {
      this.isLongPressing.set(false);
    }
  }

  // ── Double-tap handling ───────────────────────────────

  private checkDoubleTap(x: number, y: number) {
    const now = Date.now();
    const dt = now - this.lastTapTime;
    const dist = Math.hypot(x - this.lastTapX, y - this.lastTapY);

    if (dt < this.doubleTapMs && dist < 30) {
      // Double tap detected — handled by consumers via lastTapTime signal
    }

    this.lastTapTime = now;
    this.lastTapX = x;
    this.lastTapY = y;
  }

  // ── Momentum scrolling ────────────────────────────────

  private startMomentum() {
    this.cancelMomentum();

    const history = this.velocityHistory();
    if (history.length < 2) return;

    // Calculate recent velocity vector
    const recent = history.slice(-4);
    let vx = 0;
    let vy = 0;
    for (let i = 1; i < recent.length; i++) {
      const dt = Math.max(1, recent[i].timestamp - recent[i - 1].timestamp);
      vx += (recent[i].x - recent[i - 1].x) / dt;
      vy += (recent[i].y - recent[i - 1].y) / dt;
    }
    vx /= (recent.length - 1);
    vy /= (recent.length - 1);

    this.momentumVx = vx * 16; // Convert to px/frame
    this.momentumVy = vy * 16;
    this.gestureMode.set('momentum');

    const animate = () => {
      this.momentumVx *= this.momentumFriction;
      this.momentumVy *= this.momentumFriction;

      this.scrollOffsetX.update(v => v + this.momentumVx);
      this.scrollOffsetY.update(v => v + this.momentumVy);

      if (Math.abs(this.momentumVx) > 0.1 || Math.abs(this.momentumVy) > 0.1) {
        this.momentumRAF = requestAnimationFrame(animate);
      } else {
        this.gestureMode.set('normal');
        this.momentumRAF = null;
      }
    };

    this.momentumRAF = requestAnimationFrame(animate);
  }

  private cancelMomentum() {
    if (this.momentumRAF) {
      cancelAnimationFrame(this.momentumRAF);
      this.momentumRAF = null;
    }
    if (this.gestureMode() === 'momentum') {
      this.gestureMode.set('normal');
    }
  }

  // ── Velocity tracking ─────────────────────────────────

  private pushVelocityPoint(x: number, y: number) {
    this.velocityHistory.update(history => {
      const next = [...history, { x, y, timestamp: Date.now(), force: 0 }];
      // Keep last 12 points for smooth velocity calculation
      return next.length > 12 ? next.slice(-12) : next;
    });
  }

  // ── Zoom controls ─────────────────────────────────────

  setZoom(level: number) {
    this.zoomLevel.set(this.clamp(level));
  }

  adjustZoom(delta: number) {
    this.setZoom(this.zoomLevel() + delta);
  }

  adjustVerticalZoom(delta: number) {
    this.verticalZoomLevel.set(this.clamp(this.verticalZoomLevel() + delta));
  }

  resetZoom() {
    this.zoomLevel.set(1);
    this.verticalZoomLevel.set(1);
  }

  // ── Scroll offset ─────────────────────────────────────

  setScrollOffset(x: number, y: number) {
    this.scrollOffsetX.set(x);
    this.scrollOffsetY.set(y);
  }

  resetScrollOffset() {
    this.scrollOffsetX.set(0);
    this.scrollOffsetY.set(0);
  }

  // ── Gesture mode ──────────────────────────────────────

  setPrecisionMode(on: boolean) {
    this.gestureMode.set(on ? 'precision' : 'normal');
  }

  // ── Cleanup ───────────────────────────────────────────

  destroy() {
    this.cancelLongPress();
    this.cancelMomentum();
    this.velocityHistory.set([]);
  }

  private clamp(value: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, value));
  }
}
