import { Component, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { AuthService } from './services/auth.service';
import { UIService } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { NotificationToastComponent } from './components/notification-toast/notification-toast.component';
import { NotificationService } from './services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ChatbotComponent, NotificationToastComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  authService = inject(AuthService);
  uiService = inject(UIService);
  notificationService = inject(NotificationService);

  isSidebarOpen = signal(true);
  isToolsDropdownOpen = signal(false);

  constructor() {
    effect(() => {
      const isOnline = this.uiService.isOnline();
      if (isOnline) {
        this.notificationService.show('System Online: All features available', 'success', 3000);
      } else {
        this.notificationService.show('System Offline: Some features restricted', 'warning', 0);
      }
    });
  }

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  toggleToolsDropdown() {
    this.isToolsDropdownOpen.update(v => !v);
  }

  toggleChatbot() {
    this.uiService.toggleChatbot();
  }
}
