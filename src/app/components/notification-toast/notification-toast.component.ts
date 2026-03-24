import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="fixed top-24 right-8 z-[9999] flex flex-col gap-3 pointer-events-none"
    >
      <div
        *ngFor="let n of notificationService.notifications()"
        class="pointer-events-auto px-8 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-4 animate-enter"
        [ngClass]="{
          'bg-brand-primary/10 border-brand-primary/20 text-brand-primary':
            n.type === 'success',
          'bg-brand-danger/10 border-brand-danger/20 text-brand-danger':
            n.type === 'error',
          'bg-brand-accent/10 border-brand-accent/20 text-brand-accent':
            n.type === 'info',
          'bg-brand-warning/10 border-brand-warning/20 text-brand-warning':
            n.type === 'warning',
        }"
      >
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center bg-current/10"
        >
          <i
            class="fas"
            [ngClass]="{
              'fa-check': n.type === 'success',
              'fa-times': n.type === 'error',
              'fa-info': n.type === 'info',
              'fa-exclamation': n.type === 'warning',
            }"
          ></i>
        </div>
        <span class="font-black tracking-widest uppercase text-[10px]">{{
          n.message
        }}</span>
        <button
          (click)="notificationService.remove(n.id)"
          class="ml-4 opacity-40 hover:opacity-100 transition-opacity"
        >
          <i class="fas fa-times text-xs"></i>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class NotificationToastComponent {
  notificationService = inject(NotificationService);
}
