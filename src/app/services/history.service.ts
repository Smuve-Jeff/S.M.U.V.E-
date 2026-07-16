import { Injectable, signal } from '@angular/core';

/**
 * Reversible Command for the project history stack.
 * - `execute()` applies the mutation (may also have audio-engine side effects)
 * - `undo()` reverses the mutation (must restore audio-engine state too)
 * - `mergeKey` (optional): when set, two consecutive Commands with the same
 *   `mergeKey` will be coalesced — the first command's `undo` is preserved
 *   (so undoing rewinds to the pre-first step), while the `execute` is
 *   replaced with the newer one (so redo replays the final step).
 *   Use this for high-frequency streams like fader drags, pan tweaks, knob
 *   sweeps.
 */
export interface Command {
  name: string;
  execute(): void;
  undo(): void;
  mergeKey?: string;
}

@Injectable({
  providedIn: 'root',
})
export class HistoryService {
  private past: Command[] = [];
  private future: Command[] = [];

  /** Settable signal flags used by toolbar buttons to enable/disable Undo/Redo */
  canUndo = signal(false);
  canRedo = signal(false);
  lastActionName = signal<string>('');
  /** Live counters used by the Transport Bar undo/redo badges */
  undoCount = signal(0);
  redoCount = signal(0);

  // ---- Transaction (batch multiple commands into one undoable step) ----
  private isBatching = false;
  private batchBuffer: Command[] = [];

  startTransaction(): void {
    this.isBatching = true;
    this.batchBuffer = [];
  }

  commitTransaction(label?: string): void {
    if (!this.isBatching) return;
    this.isBatching = false;
    const cmds = [...this.batchBuffer];
    this.batchBuffer = [];
    if (cmds.length === 0) return;
    if (cmds.length === 1) {
      this.past.push(cmds[0]);
      this.updateSignals();
      return;
    }
    const name =
      label ||
      `${cmds.length} ops · ${[...new Set(cmds.map((c) => c.name))]
        .slice(0, 3)
        .join(' · ')}`;
    const composite: Command = {
      name,
      execute: () => cmds.forEach((c) => c.execute()),
      undo: () => [...cmds].reverse().forEach((c) => c.undo()),
    };
    this.past.push(composite);
    this.future = [];
    this.updateSignals();
  }

  rollbackTransaction(): void {
    if (!this.isBatching) return;
    this.isBatching = false;
    [...this.batchBuffer].reverse().forEach((c) => {
      try {
        c.undo();
      } catch (e) {
        console.error('HistoryService: failed to undo batched command', e);
      }
    });
    this.batchBuffer = [];
  }

  // ---- Public API ----

  add(command: Command): void {
    this.execute(command);
  }

  execute(command: Command): void {
    // Within a transaction: run the command but don't push to undo stack
    if (this.isBatching) {
      command.execute();
      this.batchBuffer.push(command);
      return;
    }
    command.execute();
    this.past.push(command);
    this.future = []; // any new action invalidates the redo stack
    this.updateSignals();
  }

  /**
   * Coalesce a Command into the previous one if the `mergeKey` matches.
   * Preserves the original `undo` (revert to first pre-state) and replaces
   * `execute` with the newest execute target. Pushes the new execute.
   * If no matching prev exists, falls back to `execute()`.
   */
  coalesce(command: Command): void {
    if (!command.mergeKey) {
      this.execute(command);
      return;
    }
    const prev = this.past[this.past.length - 1];
    if (prev && prev.mergeKey === command.mergeKey) {
      // Capture the original undo (rewinds to the FIRST pre-state).
      const prevUndo = prev.undo.bind(prev);
      // Replace execute with the new command — pointing at the newest target.
      prev.execute = command.execute.bind(command);
      // Keep undo pointing back to the original pre-state so Undo → prev1.
      prev.undo = prevUndo;
      // Also stamp mergeKey so a follow-up coalesce still matches.
      prev.mergeKey = command.mergeKey;
      // Apply the new mutation to live state.
      command.execute();
      this.updateSignals();
      return;
    }
    this.execute(command);
  }

  undo(): void {
    const command = this.past.pop();
    if (command) {
      try {
        command.undo();
        this.future.push(command);
      } catch (e) {
        console.error('HistoryService: Failed to undo', e);
      }
      this.updateSignals();
    }
  }

  redo(): void {
    const command = this.future.pop();
    if (command) {
      try {
        command.execute();
        this.past.push(command);
      } catch (e) {
        console.error('HistoryService: Failed to redo', e);
      }
      this.updateSignals();
    }
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.batchBuffer = [];
    this.isBatching = false;
    this.updateSignals();
  }

  private updateSignals(): void {
    this.canUndo.set(this.past.length > 0);
    this.canRedo.set(this.future.length > 0);
    this.undoCount.set(this.past.length);
    this.redoCount.set(this.future.length);
    this.lastActionName.set(
      this.past.length > 0 ? this.past[this.past.length - 1].name : ''
    );
  }
}
