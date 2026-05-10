import { Injectable, signal } from '@angular/core';

export interface HistoryAction {
  undo: () => void;
  redo: () => void;
  description: string;
}

/**
 * Represents the serializable state of the history service.
 * Note: The 'undo' and 'redo' functions from HistoryAction are not serialized.
 * A mechanism to rebuild actions from descriptions would be needed to fully restore state.
 */
export interface SerializableHistoryState {
  undoStack: string[]; // Array of descriptions
  redoStack: string[]; // Array of descriptions
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

  /**
   * Pushes a new action onto the history stack.
   * This will clear the redo stack.
   * @param action The action to record.
   */
  pushAction(action: HistoryAction): void {
    this.undoStack.push(action);
    this.redoStack = []; // Clear redo stack on new action

    // Enforce the maximum history size
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }

    this.updateSignals();
  }

  /**
   * Undoes the most recent action.
   */
  undo(): void {
    const action = this.undoStack.pop();
    if (action) {
      action.undo();
      this.redoStack.push(action);
      this.updateSignals();
    }
  }

  /**
   * Redoes the most recently undone action.
   */
  redo(): void {
    const action = this.redoStack.pop();
    if (action) {
      action.redo();
      this.undoStack.push(action);
      this.updateSignals();
    }
  }

  /**
   * Clears the entire history (both undo and redo stacks).
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateSignals();
  }

  /**
   * Updates the 'canUndo' and 'canRedo' signals based on stack sizes.
   */
  private updateSignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  /**
   * Gets the description of the next action to be undone.
   * @returns The description string, or null if there is nothing to undo.
   */
  getUndoDescription(): string | null {
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1].description
      : null;
  }

  /**
   * Gets the description of the next action to be redone.
   * @returns The description string, or null if there is nothing to redo.
   */
  getRedoDescription(): string | null {
    return this.redoStack.length > 0
      ? this.redoStack[this.redoStack.length - 1].description
      : null;
  }

  /**
   * Serializes the history stacks to a JSON-compatible object.
   * Note: This only saves the descriptions of the actions, not the actions themselves.
   * @returns A serializable representation of the history state.
   */
  toJSON(): SerializableHistoryState {
    return {
      undoStack: this.undoStack.map(action => action.description),
      redoStack: this.redoStack.map(action => action.description),
    };
  }

  /**
   * Deserializes the history state from a JSON-compatible object.
   * Note: This only restores the descriptions. The undo/redo functionality
   * will be lost as the actions cannot be reconstituted from this data alone.
   * A more advanced implementation would be needed to map descriptions back to actions.
   * @param json The serialized history state.
   */
  fromJSON(json: SerializableHistoryState): void {
    // This is a simplified restoration. We lose the actual undo/redo capabilities
    // because the functions can't be serialized. We're just restoring the text.
    // In a real-world application, you'd need a factory or a mapping to
    // recreate the action objects from the descriptions or an action ID.
    this.undoStack = json.undoStack.map(description => ({
      description,
      undo: () => console.warn(`Cannot undo '${description}': action was restored from serialized state.`),
      redo: () => console.warn(`Cannot redo '${description}': action was restored from serialized state.`),
    }));
    this.redoStack = json.redoStack.map(description => ({
      description,
      undo: () => console.warn(`Cannot undo '${description}': action was restored from serialized state.`),
      redo: () => console.warn(`Cannot redo '${description}': action was restored from serialized state.`),
    }));
    this.updateSignals();
  }
}
