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

type ConfirmActiveDialog = ConfirmDialogRequest & {
  id: number;
  resolve: (value: boolean) => void;
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

  confirm(request: Omit<ConfirmDialogRequest, 'type'>): Promise<boolean> {
    return new Promise((resolve) => {
      this.activeDialog.set({
        ...request,
        type: 'confirm',
        id: ++this.nextId,
        resolve: (value) => resolve(Boolean(value)),
      });
    });
  }

  prompt(request: Omit<PromptDialogRequest, 'type'>): Promise<string | null> {
    return new Promise((resolve) => {
      this.activeDialog.set({
        ...request,
        type: 'prompt',
        id: ++this.nextId,
        resolve: (value) => resolve(typeof value === 'string' ? value : null),
      });
    });
  }

  alert(request: Omit<AlertDialogRequest, 'type'>): Promise<void> {
    return new Promise((resolve) => {
      this.activeDialog.set({
        ...request,
        type: 'alert',
        id: ++this.nextId,
        resolve: () => resolve(),
      });
    });
  }

  settle(result?: boolean | string | null): void {
    const dialog = this.activeDialog();
    if (!dialog) {
      return;
    }

    this.activeDialog.set(null);
    if (dialog.type === 'confirm') {
      dialog.resolve(Boolean(result));
      return;
    }

    if (dialog.type === 'prompt') {
      dialog.resolve(typeof result === 'string' ? result : null);
      return;
    }

    dialog.resolve();
  }

  cancel(): void {
    const dialog = this.activeDialog();
    if (!dialog) {
      return;
    }

    this.activeDialog.set(null);
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
