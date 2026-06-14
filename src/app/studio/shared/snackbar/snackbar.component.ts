import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SnackbarConfig = {
  message: string;
  action?: string;
  duration?: number;
  type?: 'info' | 'success' | 'error' | 'warning';
};

@Component({
  selector: 'app-snackbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './snackbar.component.html',
  styleUrls: ['./snackbar.component.css']
})
export class SnackbarComponent {
  visible = signal(false);
  message = signal('');
  action = signal<string | undefined>(undefined);
  type = signal<'info' | 'success' | 'error' | 'warning'>('info');
  private timeoutId?: number;

  show(config: SnackbarConfig) {
    this.message.set(config.message);
    this.action.set(config.action);
    this.type.set(config.type || 'info');
    this.visible.set(true);

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const duration = config.duration || 4000;
    this.timeoutId = window.setTimeout(() => {
      this.hide();
    }, duration);
  }

  hide() {
    this.visible.set(false);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  onAction() {
    this.hide();
  }
}
