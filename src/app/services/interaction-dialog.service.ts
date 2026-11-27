import { Injectable, signal } from '@angular/core';

interface DialogBase {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional third action for a confirm dialog, shown before the confirm. */
  alternateLabel?: string;
  tone?: 'default' | 'danger';
}

export interface ConfirmDialogRequest extends DialogBase {
  type: 'confirm';
}

export interface PromptDialogRequest extends DialogBase {
  type: 'prompt';
  initialValue?: string;
  placeholder?: string;
}

export interface AlertDialogRequest extends DialogBase {
  type: 'alert';
}

export type InteractionDialogRequest =
  | ConfirmDialogRequest
  | PromptDialogRequest
  | AlertDialogRequest;

type ConfirmActiveDialog = ConfirmDialogRequest & {
  id: number;
  resolve: (value: boolean | 'alternate') => void;
};

type PromptActiveDialog = PromptDialogRequest & {
  id: number;
  resolve: (value: string | null) => void;
};

type AlertActiveDialog = AlertDialogRequest & {
  id: number;
  resolve: () => void;
};

type ActiveDialog =
  | ConfirmActiveDialog
  | PromptActiveDialog
  | AlertActiveDialog;

@Injectable({
  providedIn: 'root',
})
export class InteractionDialogService {
  private nextId = 0;
  readonly activeDialog = signal<ActiveDialog | null>(null);
  /**
   * Requests that arrived while another dialog was open. The old signal-only
   * implementation replaced activeDialog and left the earlier Promise forever
   * pending; a second destructive action could therefore suspend the first.
   */
  private readonly pending: ActiveDialog[] = [];

  confirm(request: Omit<ConfirmDialogRequest, 'type'>): Promise<boolean> {
    return new Promise((resolve) => {
      this.enqueue({
        ...request,
        type: 'confirm',
        id: ++this.nextId,
        resolve: (value) => resolve(value === true),
      });
    });
  }

  /**
   * Confirm dialog with two outcomes plus cancel. Used where discarding is a
   * real choice the artist must be able to make explicitly (save and leave vs
   * leave without saving), not something to infer from a boolean.
   */
  confirmWithAlternate(
    request: Omit<ConfirmDialogRequest, 'type'>,
  ): Promise<'confirm' | 'alternate' | 'cancel'> {
    return new Promise((resolve) => {
      this.enqueue({
        ...request,
        type: 'confirm',
        id: ++this.nextId,
        resolve: (value) =>
          resolve(
            value === true
              ? 'confirm'
              : value === 'alternate'
                ? 'alternate'
                : 'cancel',
          ),
      });
    });
  }

  prompt(request: Omit<PromptDialogRequest, 'type'>): Promise<string | null> {
    return new Promise((resolve) => {
      this.enqueue({
        ...request,
        type: 'prompt',
        id: ++this.nextId,
        resolve: (value) => resolve(typeof value === 'string' ? value : null),
      });
    });
  }

  alert(request: Omit<AlertDialogRequest, 'type'>): Promise<void> {
    return new Promise((resolve) => {
      this.enqueue({
        ...request,
        type: 'alert',
        id: ++this.nextId,
        resolve: () => resolve(),
      });
    });
  }

  private enqueue(dialog: ActiveDialog): void {
    this.pending.push(dialog);
    if (!this.activeDialog()) this.activateNext();
  }

  private activateNext(): void {
    this.activeDialog.set(this.pending.shift() ?? null);
  }

  /** Clear the active request and immediately surface the next queued one. */
  private advance(): ActiveDialog | null {
    const dialog = this.activeDialog();
    if (!dialog) return null;
    this.activeDialog.set(null);
    this.activateNext();
    return dialog;
  }

  settle(result?: boolean | string | null): void {
    const dialog = this.advance();
    if (!dialog) {
      return;
    }

    if (dialog.type === 'confirm') {
      // `alternate` is its own outcome; everything else keeps the legacy
      // boolean mapping so existing confirm() callers are unchanged.
      dialog.resolve(result === 'alternate' ? 'alternate' : Boolean(result));
      return;
    }

    if (dialog.type === 'prompt') {
      dialog.resolve(typeof result === 'string' ? result : null);
      return;
    }

    dialog.resolve();
  }

  cancel(): void {
    const dialog = this.advance();
    if (!dialog) {
      return;
    }

    if (dialog.type === 'confirm') {
      dialog.resolve(false);
      return;
    }

    if (dialog.type === 'prompt') {
      dialog.resolve(null);
      return;
    }

    dialog.resolve();
  }
}
