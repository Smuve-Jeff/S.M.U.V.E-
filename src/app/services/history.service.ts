import { Injectable, signal } from '@angular/core';

export interface Command {
  execute(): void;
  undo(): void;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class HistoryService {
  private past: Command[] = [];
  private future: Command[] = [];

  canUndo = signal(false);
  canRedo = signal(false);
  lastActionName = signal('');

  add(command: Command) { this.execute(command); }
  execute(command: Command) {
    command.execute();
    this.past.push(command);
    this.future = []; // Clear redo stack on new action
    this.updateSignals();
  }

  undo() {
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

  redo() {
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

  private updateSignals() {
    this.canUndo.set(this.past.length > 0);
    this.canRedo.set(this.future.length > 0);
    this.lastActionName.set(this.past.length > 0 ? this.past[this.past.length - 1].name : '');
  }

  clear() {
    this.past = [];
    this.future = [];
    this.updateSignals();
  }
}
