import { Injectable, signal } from '@angular/core';

interface DialogBase {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
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

type ActiveDialog = InteractionDialogRequest & {
  id: number;
  resolve: (value: unknown) => void;
};

@Injectable({
  providedIn: 'root',
})
export class InteractionDialogService {
  private nextId = 0;
  readonly activeDialog = signal<ActiveDialog | null>(null);

  confirm(request: Omit<ConfirmDialogRequest, 'type'>): Promise<boolean> {
    return new Promise((resolve) => {
      this.activeDialog.set({
        ...request,
        type: 'confirm',
        id: ++this.nextId,
        resolve,
      });
    });
  }

  prompt(request: Omit<PromptDialogRequest, 'type'>): Promise<string | null> {
    return new Promise((resolve) => {
      this.activeDialog.set({
        ...request,
        type: 'prompt',
        id: ++this.nextId,
        resolve,
      });
    });
  }

  alert(request: Omit<AlertDialogRequest, 'type'>): Promise<void> {
    return new Promise((resolve) => {
      this.activeDialog.set({
        ...request,
        type: 'alert',
        id: ++this.nextId,
        resolve,
      });
    });
  }

  settle(result?: boolean | string | null): void {
    const dialog = this.activeDialog();
    if (!dialog) {
      return;
    }

    this.activeDialog.set(null);
    dialog.resolve(result);
  }

  cancel(): void {
    const dialog = this.activeDialog();
    if (!dialog) {
      return;
    }

    this.activeDialog.set(null);
    dialog.resolve(dialog.type === 'confirm' ? false : null);
  }
}
