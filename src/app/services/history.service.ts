import { Injectable, signal } from '@angular/core';

export interface HistoryAction {
  undo: () => void;
  redo: () => void;
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class HistoryService {
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private maxHistorySize = 100;

  public canUndo = signal(false);
  public canRedo = signal(false);

  pushAction(action: HistoryAction): void {
    this.undoStack.push(action);
    this.redoStack = []; // Clear redo stack on new action

    // Limit history size
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }

    this.updateSignals();
  }

  undo(): void {
    const action = this.undoStack.pop();
    if (action) {
      action.undo();
      this.redoStack.push(action);
      this.updateSignals();
    }
  }

  redo(): void {
    const action = this.redoStack.pop();
    if (action) {
      action.redo();
      this.undoStack.push(action);
      this.updateSignals();
    }
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateSignals();
  }

  private updateSignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  getUndoDescription(): string | null {
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1].description
      : null;
  }

  getRedoDescription(): string | null {
    return this.redoStack.length > 0
      ? this.redoStack[this.redoStack.length - 1].description
      : null;
  }
}
