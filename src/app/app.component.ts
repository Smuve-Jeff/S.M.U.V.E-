import {
  Component,
  inject,
  effect,
  signal,
  HostListener,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RouterLink,
  RouterOutlet,
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
import { ViewConfig } from './services/ui.service';

interface NavigationGroup {
  category: ViewConfig['category'];
  label: string;
  description: string;
  items: ViewConfig[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
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
  navigationGroups: NavigationGroup[] = this.buildNavigationGroups();
  activeViewConfig = computed(
    () =>
      this.uiService.getViewConfig(this.uiService.mainViewMode()) ?? {
        mode: this.uiService.mainViewMode(),
        label: this.uiService.getViewLabel(this.uiService.mainViewMode()),
        description: this.uiService.getViewDescription(
          this.uiService.mainViewMode()
        ),
        icon: 'token',
        category: 'CORE' as const,
      }
  );
  spotlightTips = computed(() => this.commandPalette.activeTips().slice(0, 3));

  constructor() {
    this.checkMobile();
    this.updateFullPageMode(this.router.url);

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        const path = this.router.url.split('/')[1];
        if (path && this.uiService.getViewModes().includes(path as any)) {
          this.uiService.mainViewMode.set(path as any);
        }
        this.updateFullPageMode(this.router.url);
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
    this.updateFullPageMode(this.router.url);
  }

  private updateFullPageMode(url: string) {
    const path = this.getPrimaryRoute(url);
    this.isFullPageMode.set(
      ['piano-roll', 'tha-spot', 'networking'].includes(path) ||
        (path === 'studio' && this.isMobile())
    );
  }

  private getPrimaryRoute(url: string): string {
    const normalizedPath = url.split(/[?#]/)[0].replace(/^\/+/, '');
    return normalizedPath.split('/')[0] ?? '';
  }

  toggleSidebar() {
    this.isSidebarOpen.update((v) => !v);
  }
  toggleChatbot() {
    this.uiService.toggleChatbot();
  }

  openInteractionGuide() {
    this.commandPalette.openGuide();
  }

  private buildNavigationGroups(): NavigationGroup[] {
    const categoryMeta: Record<
      ViewConfig['category'],
      { label: string; description: string }
    > = {
      CORE: {
        label: 'Core Systems',
        description:
          'Primary production, identity, and release control surfaces.',
      },
      STRATEGY: {
        label: 'AI Strategy',
        description:
          'High-level insight, planning, and executive intelligence.',
      },
      CREATIVE: {
        label: 'Creative Labs',
        description: 'Experimental tools and asset generation workspaces.',
      },
      COMMUNITY: {
        label: 'Community',
        description:
          'Audience-facing spaces and collaborative engagement modules.',
      },
      UTILITY: {
        label: 'System Utilities',
        description: 'Visual, performance, and environment command settings.',
      },
    };

    return (Object.keys(categoryMeta) as ViewConfig['category'][])
      .map((category) => ({
        category,
        ...categoryMeta[category],
        items: this.uiService
          .getViewConfigs()
          .filter((view) => view.category === category),
      }))
      .filter((group) => group.items.length > 0);
  }

  navigateToView(mode: MainViewMode) {
    if (!mode) return;
    this.uiService.navigateToView(mode);
    if (this.isMobile()) this.isSidebarOpen.set(false);
  }
}
