import { Injectable, signal } from '@angular/core';

export interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  notifications = signal<Notification[]>([]);
  private nextId = 0;

  show(
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info',
    duration = 5000
  ) {
    const id = this.nextId++;
    const notification: Notification = { id, message, type, duration };

    this.notifications.update((prev) => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  remove(id: number) {
    this.notifications.update((prev) => prev.filter((n) => n.id !== id));
  }
}
