import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sound-pad',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sound-pad.component.html',
  styleUrls: ['./sound-pad.component.css', '../shared/platform-ux.css'],
})
export class SoundPadComponent {
  @Input() name: string = '';
  @Input() active: boolean = false;
  /**
   * Optional per-pad tint — applied as --pad-color CSS variable so
   * the surrounding grid can color each pad independently while
   * this component stays color-agnostic.
   */
  @Input() color: string = '#00E5FF';
  @Output() padTriggered = new EventEmitter<void>();
  /** Fired when the pad is held (long-press) — used to open the assign menu. */
  @Output() padLongPressed = new EventEmitter<void>();

  /** Hold duration that counts as a long-press (ms). */
  private static readonly LONG_PRESS_MS = 500;

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Set once the long-press fires. Reset on the next pointerdown, NOT on
   * the trailing click/contextmenu: on Android both events can trail a
   * single hold (in either order), and the parent's menu toggle must fire
   * exactly once per gesture.
   */
  private longPressFired = false;

  triggerPad(): void {
    // Releasing a long-press must not audition the instrument.
    if (this.longPressFired) return;
    this.padTriggered.emit();
  }

  onPointerDown(): void {
    this.longPressFired = false;
    this.clearTimer();
    this.pressTimer = setTimeout(() => {
      this.longPressFired = true;
      this.padLongPressed.emit();
    }, SoundPadComponent.LONG_PRESS_MS);
  }

  onPointerUp(): void {
    this.clearTimer();
  }

  onContextMenu(event: MouseEvent): void {
    // A pad is an instrument surface, never a document — no native menu.
    event.preventDefault();
    this.clearTimer();
    if (this.longPressFired) {
      // The long-press already opened the parent's menu; swallow the
      // trailing native contextmenu so its toggle doesn't close it again.
      event.stopPropagation();
    }
    // else: desktop right-click bubbles to the grid, which owns the menu.
  }

  private clearTimer(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }
}
