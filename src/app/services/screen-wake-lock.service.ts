import { Injectable, OnDestroy, signal } from '@angular/core';

/**
 * Screen Wake Lock — the professional mobile DAW pattern.
 *
 * FL Studio Mobile, BandLab, and Cubasis all keep the display awake while the
 * transport runs: on a phone, Android's screen timeout hides the page, and
 * `AudioSessionService`'s background hygiene (which stops playback when the
 * page is hidden — see its `handleVisibilityChange`) would then abort a
 * recording mid-take. Holding a wake lock while playing/recording keeps a
 * propped-up or one-handed session alive; it is released the moment the
 * transport stops, so idle listening (Smuve Jeff Radio, Smuve TV) still lets
 * the screen sleep normally and no battery is spent on a paused session.
 *
 * Re-acquisition: browsers auto-release wake locks when the page is hidden,
 * so the lock is re-requested on `visibilitychange` while a session is wanted.
 * The API is absent on older WebViews — every method degrades to a no-op and
 * the transport behaves exactly as before.
 */
@Injectable({
  providedIn: 'root',
})
export class ScreenWakeLockService implements OnDestroy {
  /** True while a screen wake lock is actually held. */
  readonly active = signal(false);

  private sentinel: WakeLockSentinel | null = null;
  /** Whether a caller currently wants the screen kept awake. */
  private wanted = false;
  private listening = false;

  /** Screen Wake Lock API availability (absent on older WebViews). */
  get supported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.wakeLock?.request === 'function'
    );
  }

  /** Keep the screen awake until `release()` is called. Idempotent. */
  request(): void {
    this.wanted = true;
    this.ensureVisibilityListener();
    void this.acquire();
  }

  /** Let the screen sleep again. Idempotent. */
  release(): void {
    this.wanted = false;
    void this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
    this.active.set(false);
  }

  private async acquire(): Promise<void> {
    if (!this.wanted || this.sentinel || !this.supported) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // The request is async: release() may have landed while it was pending.
      if (!this.wanted) {
        void sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      this.active.set(true);
      // The OS can release the lock at any time (battery saver, page hide).
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
        this.active.set(false);
      });
    } catch {
      // Denied (battery saver, low-power mode): the transport still works.
    }
  }

  ngOnDestroy(): void {
    this.release();
    if (this.listening && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.listening = false;
    }
  }

  private onVisibilityChange = (): void => {
    if (this.wanted && document.visibilityState === 'visible') {
      void this.acquire();
    }
  };

  private ensureVisibilityListener(): void {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }
}
