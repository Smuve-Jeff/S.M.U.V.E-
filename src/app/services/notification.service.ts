import { Injectable, OnDestroy, signal } from '@angular/core';

import { onStorageNotice } from './storage-notice';

export interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService implements OnDestroy {
  notifications = signal<Notification[]>([]);
  private nextId = 0;

  // A store that could not be read is still being protected from overwrites,
  // but the artist must know this session's changes are not being saved.
  private readonly stopStorageNotices = onStorageNotice((message) =>
    this.show(message, 'warning', 8000)
  );

  ngOnDestroy(): void {
    this.stopStorageNotices();
  }

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
