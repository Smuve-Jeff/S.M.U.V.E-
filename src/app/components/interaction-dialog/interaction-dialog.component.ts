import {
  Component,
  ElementRef,
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
        class="w-full max-w-lg rounded-3xl border border-border bg-surface/95 shadow-v42-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'dialog-title-' + active.id"
        (click)="$event.stopPropagation()"
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
              class="w-10 h-10 rounded-xl border border-border text-text-dim hover:text-text-main transition-all"
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
            class="px-4 py-3 rounded-2xl border border-border text-[11px] font-bold uppercase tracking-[0.2em] text-text-main hover:border-brand-primary transition-all"
            (click)="dialog.cancel()"
          >
            {{ active.cancelLabel || 'Cancel' }}
          </button>
          <button
            type="button"
            class="px-4 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] transition-all"
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

  constructor() {
    effect(() => {
      const active = this.dialog.activeDialog();
      this.validationError.set('');
      this.promptValue =
        active?.type === 'prompt' ? active.initialValue || '' : '';

      if (active?.type === 'prompt') {
        setTimeout(() => this.promptInput?.nativeElement?.focus());
      }
    });
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
