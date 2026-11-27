import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { InteractionDialogService } from '../../services/interaction-dialog.service';

@Component({
  selector: 'app-interaction-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      *ngIf="dialog.activeDialog() as active"
      class="fixed inset-0 z-[11000] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
      (click)="dialog.cancel()"
    >
      <section
        #dialogSection
        tabindex="-1"
        class="w-full max-w-lg rounded-3xl border border-border bg-surface/95 shadow-v42-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'dialog-title-' + active.id"
        (click)="$event.stopPropagation()"
        (keydown)="onDialogKeydown($event)"
      >
        <header class="px-6 py-5 border-b border-border">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p
                class="text-[10px] font-bold uppercase tracking-[0.3em]"
                [class.text-red-400]="active.tone === 'danger'"
                [class.text-brand-primary]="active.tone !== 'danger'"
              >
                {{
                  active.type === 'prompt' ? 'Input Required' : 'Confirm Action'
                }}
              </p>
              <h2
                class="text-lg font-black text-text-main uppercase tracking-wide mt-2"
                [id]="'dialog-title-' + active.id"
              >
                {{ active.title }}
              </h2>
            </div>
            <button
              type="button"
              class="w-11 h-11 shrink-0 rounded-xl border border-border text-text-dim hover:text-text-main transition-all"
              aria-label="Close dialog"
              (click)="dialog.cancel()"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <p class="text-sm text-text-dim mt-4 leading-relaxed">
            {{ active.message }}
          </p>
        </header>

        <div class="px-6 py-5 space-y-4">
          <label *ngIf="active.type === 'prompt'" class="block">
            <span
              class="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim"
            >
              Value
            </span>
            <input
              #promptInput
              type="text"
              [(ngModel)]="promptValue"
              [placeholder]="active.placeholder || 'Enter value'"
              class="mt-3 w-full rounded-2xl border border-border bg-background-alt/70 px-4 py-3 text-sm text-text-main outline-none focus:border-brand-primary"
              (keyup.enter)="submit()"
            />
          </label>

          <div
            *ngIf="validationError()"
            class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-red-400"
          >
            {{ validationError() }}
          </div>
        </div>

        <footer
          class="px-6 py-4 border-t border-border bg-background-alt/30 flex flex-col-reverse sm:flex-row sm:justify-end gap-3"
        >
          <button
            type="button"
            class="min-h-11 px-4 py-3 rounded-2xl border border-border text-[11px] font-bold uppercase tracking-[0.2em] text-text-main hover:border-brand-primary transition-all"
            (click)="dialog.cancel()"
          >
            {{ active.cancelLabel || 'Cancel' }}
          </button>
          <button
            *ngIf="active.type === 'confirm' && active.alternateLabel"
            type="button"
            class="min-h-11 px-4 py-3 rounded-2xl border border-red-500/30 text-[11px] font-bold uppercase tracking-[0.2em] text-red-400 hover:border-red-400 hover:bg-red-500/10 transition-all"
            (click)="dialog.settle('alternate')"
          >
            {{ active.alternateLabel }}
          </button>
          <button
            type="button"
            class="min-h-11 px-4 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] transition-all"
            [class.bg-red-500]="active.tone === 'danger'"
            [class.text-white]="active.tone === 'danger'"
            [class.bg-brand-primary]="active.tone !== 'danger'"
            [class.text-black]="active.tone !== 'danger'"
            (click)="submit()"
          >
            {{ active.confirmLabel || 'Continue' }}
          </button>
        </footer>
      </section>
    </div>
  `,
})
export class InteractionDialogComponent {
  readonly dialog = inject(InteractionDialogService);
  readonly validationError = signal('');
  promptValue = '';

  @ViewChild('promptInput') private promptInput?: ElementRef<HTMLInputElement>;
  @ViewChild('dialogSection') private dialogSection?: ElementRef<HTMLElement>;

  /** The last dialog id this component prepared, so queued dialogs re-focus. */
  private activeId: number | null = null;
  private previousFocus: HTMLElement | null = null;
  private readonly inerted: Array<{
    element: HTMLElement;
    hadInert: boolean;
    ariaHidden: string | null;
  }> = [];

  constructor() {
    effect(() => {
      const active = this.dialog.activeDialog();
      this.validationError.set('');
      this.promptValue =
        active?.type === 'prompt' ? active.initialValue || '' : '';

      if (!active) {
        this.finishDialogSurface();
        return;
      }

      if (this.activeId === null) {
        this.previousFocus =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        this.makeBackgroundInert();
      }
      this.activeId = active.id;

      // The prompt input is the reason the dialog opened; for a confirmation
      // the first safe action (Cancel/Close) is the useful keyboard landing
      // point. Focus is always moved into the modal, never left behind it.
      setTimeout(() => {
        const root = this.dialogSection?.nativeElement;
        if (!root) return;
        const target =
          active.type === 'prompt'
            ? this.promptInput?.nativeElement
            : root.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])');
        target?.focus();
      });
    });
  }

  /** Escape is handled at document level so it works before focus lands. */
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.dialog.activeDialog()) return;
    event.preventDefault();
    event.stopPropagation();
    this.dialog.cancel();
  }

  /** Keep Tab and Shift+Tab cycling inside the modal. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const root = this.dialogSection?.nativeElement;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && (active === last || !root.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Mark every sibling of the dialog host inert while the modal is open. */
  private makeBackgroundInert(): void {
    if (typeof document === 'undefined') return;
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (!shell) return;
    for (const child of Array.from(shell.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.tagName === 'APP-INTERACTION-DIALOG') continue;
      this.inerted.push({
        element: child,
        hadInert: child.hasAttribute('inert'),
        ariaHidden: child.getAttribute('aria-hidden'),
      });
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    }
  }

  /** Restore the page and the focus that existed before the dialog opened. */
  private finishDialogSurface(): void {
    if (this.activeId === null) return;
    this.activeId = null;
    for (const entry of this.inerted.splice(0)) {
      if (!entry.hadInert) entry.element.removeAttribute('inert');
      if (entry.ariaHidden === null) {
        entry.element.removeAttribute('aria-hidden');
      } else {
        entry.element.setAttribute('aria-hidden', entry.ariaHidden);
      }
    }
    const restore = this.previousFocus;
    this.previousFocus = null;
    if (restore?.isConnected) restore.focus();
  }

  submit(): void {
    const active = this.dialog.activeDialog();
    if (!active) {
      return;
    }

    if (active.type === 'prompt') {
      const trimmed = this.promptValue.trim();
      if (!trimmed) {
        this.validationError.set('A value is required to continue.');
        return;
      }
      this.dialog.settle(trimmed);
      return;
    }

    this.dialog.settle(true);
  }
}
