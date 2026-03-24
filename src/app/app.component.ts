import { Component, inject, effect, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RouterLink,
  RouterOutlet,
  RouterLinkActive,
  Router,
  NavigationEnd,
} from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { UIService } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { NotificationToastComponent } from './components/notification-toast/notification-toast.component';
import { SmuveAdvisorComponent } from './components/smuve-advisor/smuve-advisor.component';
import { NotificationService } from './services/notification.service';
import { MainViewMode } from './services/user-context.service';
import { AiService } from './services/ai.service';
import { SettingsIntegrationService } from './services/settings-integration.service';
import { DatabaseService } from './services/database.service';
import { AutoSaveService } from './services/auto-save.service';
import { CommandPaletteComponent } from './components/command-palette/command-palette.component';
import { CommandPaletteService } from './services/command-palette.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ChatbotComponent,
    NotificationToastComponent,
    SmuveAdvisorComponent,
    CommandPaletteComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  authService = inject(AuthService);
  uiService = inject(UIService);
  aiService = inject(AiService);
  notificationService = inject(NotificationService);
  settingsIntegration = inject(SettingsIntegrationService);
  databaseService = inject(DatabaseService);
  autoSaveService = inject(AutoSaveService);
  commandPalette = inject(CommandPaletteService);
  router = inject(Router);

  isSidebarOpen = signal(true);
  isFullPageMode = signal(false);
  isMobile = signal(false);

  constructor() {
    this.checkMobile();
    this.isFullPageMode.set(this.router.url === '/piano-roll');

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
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

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    this.commandPalette.handleGlobalKey(event);
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    const isNowMobile = window.innerWidth <= 1024;
    if (isNowMobile !== this.isMobile()) {
      this.isMobile.set(isNowMobile);
      if (isNowMobile) this.isSidebarOpen.set(false);
      else this.isSidebarOpen.set(true);
    }
  }

  toggleSidebar() {
    this.isSidebarOpen.update((v) => !v);
  }
  toggleChatbot() {
    this.uiService.toggleChatbot();
  }

  navigateToView(mode: MainViewMode) {
    this.uiService.navigateToView(mode);
    if (this.isMobile()) this.isSidebarOpen.set(false);
  }
}
