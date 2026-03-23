import { Component, inject, effect, signal, HostListener, computed, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { UIService, ViewConfig } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { NotificationToastComponent } from './components/notification-toast/notification-toast.component';
import { SmuveAdvisorComponent } from './components/smuve-advisor/smuve-advisor.component';
import { NotificationService } from './services/notification.service';
import { MainViewMode } from './services/user-context.service';
import { AiService } from './services/ai.service';
import { PlayerService } from './services/player.service';
import { SettingsIntegrationService } from './services/settings-integration.service';
import { DatabaseService } from './services/database.service';
import { AutoSaveService } from './services/auto-save.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ChatbotComponent, NotificationToastComponent, SmuveAdvisorComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  authService = inject(AuthService);
  uiService = inject(UIService);
  aiService = inject(AiService);
  playerService = inject(PlayerService);
  notificationService = inject(NotificationService);
  settingsIntegration = inject(SettingsIntegrationService);
  databaseService = inject(DatabaseService);
  autoSaveService = inject(AutoSaveService);
  router = inject(Router);

  isSidebarOpen = signal(true);
  isFullPageMode = signal(false);
  isViewSelectorOpen = signal(false);
  viewSearchQuery = signal("");
  isMobile = signal(false);

  constructor() {
    this.checkMobile();
    this.isFullPageMode.set(this.router.url === '/piano-roll');

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      const path = this.router.url.split('/')[1];
      if (path && this.uiService.getViewModes().includes(path as any)) {
        this.uiService.mainViewMode.set(path as any);
      }
      this.isFullPageMode.set(this.router.url === '/piano-roll');
    });

    effect(() => {
      if (this.uiService.isOnline()) {
        this.notificationService.show('System Online', 'success', 3000);
      }
    });
  }

  @HostListener('window:keydown', [''])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      this.playerService.togglePlay();
    } else if (key === 'a' && event.altKey) {
      this.aiService.performExecutiveAudit();
      this.notificationService.show('Manual Audit Triggered', 'info', 2000);
    } else if (key === 'p' && event.altKey) {
      this.uiService.togglePerformanceMode();
      this.notificationService.show(
        this.uiService.performanceMode() ? 'Performance Mode Active' : 'Performance Mode Disabled',
        'info',
        2000
      );
    }
  }

  @HostListener('window:resize')
  onResize() { this.checkMobile(); }

  private checkMobile() {
    const isNowMobile = window.innerWidth <= 1024;
    if (isNowMobile !== this.isMobile()) {
      this.isMobile.set(isNowMobile);
      if (isNowMobile) this.isSidebarOpen.set(false);
      else this.isSidebarOpen.set(true);
    }
  }

  toggleSidebar() { this.isSidebarOpen.update(v => !v); }
  toggleChatbot() { this.uiService.toggleChatbot(); }
  toggleViewSelector() { this.isViewSelectorOpen.update(v => !v); }
  navigateToView(mode: MainViewMode) {
    this.uiService.navigateToView(mode);
    this.isViewSelectorOpen.set(false);
    if (this.isMobile()) this.isSidebarOpen.set(false);
  }
}
