import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-12 right-12 z-[9999] flex flex-col gap-6 pointer-events-none">
      <div
        *ngFor="let n of notificationService.notifications()"
        class="pointer-events-auto px-8 py-4 rounded-2xl shadow-2xl border-2 flex items-center gap-6 animate-slide-in-right glass-panel-elite"
        [ngClass]="{
          'border-primary text-primary bg-primary/5': n.type === 'success',
          'border-red-500 text-red-500 bg-red-500/5': n.type === 'error',
          'border-silver text-silver bg-silver/5': n.type === 'info',
          'border-gold text-gold bg-gold/5': n.type === 'warning'
        }"
      >
        <span class="material-symbols-outlined text-3xl" [class.animate-pulse]="n.type === 'success'">
          {{ n.type === 'success' ? 'verified' : (n.type === 'error' ? 'report' : (n.type === 'warning' ? 'warning' : 'info')) }}
        </span>
        <div class="flex flex-col">
           <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 italic">System Transmission</span>
           <span class="font-black tracking-tighter uppercase text-sm italic">{{ n.message }}</span>
        </div>
        <button (click)="notificationService.remove(n.id)" class="ml-4 hover:scale-125 transition-transform opacity-30 hover:opacity-100">
          <span class="material-symbols-outlined text-base">close</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    @keyframes slideIn {
      from { transform: translateX(100%) scale(0.9); opacity: 0; }
      to { transform: translateX(0) scale(1); opacity: 1; }
    }
    .animate-slide-in-right {
      animation: slideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
  `]
})
export class NotificationToastComponent {
  notificationService = inject(NotificationService);
}
