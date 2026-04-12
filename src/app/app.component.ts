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
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';

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
import { UserProfileService } from './services/user-profile.service';
import { OfflineSyncService } from './services/offline-sync.service';
import { InteractionDialogComponent } from './components/interaction-dialog/interaction-dialog.component';
import { InteractionDialogService } from './services/interaction-dialog.service';
import { ViewConfig } from './services/workspace-registry';

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
    InteractionDialogComponent,
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
  profileService = inject(UserProfileService);
  offlineSync = inject(OfflineSyncService);
  dialog = inject(InteractionDialogService);
  swUpdate = inject(SwUpdate, { optional: true });
  router = inject(Router);

  isSidebarOpen = signal(true);
  isFullPageMode = signal(false);
  isMobile = signal(false);
  isAuthRoute = signal(false);
  isSyncCenterOpen = signal(false);
  isMobileWorkspaceTrayOpen = signal(false);
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
  pinnedViews = computed(() => this.uiService.getPinnedViewConfigs());
  recentViews = computed(() => this.uiService.getRecentViewConfigs());
  relatedViews = computed(() =>
    this.uiService
      .getRelatedViewConfigs(this.uiService.mainViewMode())
      .slice(0, 4)
  );
  mobilePrimaryViews = computed(() =>
    this.uiService.getPrimaryMobileViewConfigs()
  );
  mobileOverflowViews = computed(() =>
    this.uiService.getOverflowMobileViewConfigs()
  );
  spotlightTips = computed(() => this.commandPalette.activeTips().slice(0, 3));
  syncSummary = computed(() => ({
    autoSaveBusy: this.autoSaveService.isSaving(),
    lastSavedAt: this.autoSaveService.lastSavedAt(),
    lastError: this.autoSaveService.lastError(),
    isCloudSyncing: this.databaseService.isSyncing(),
    lastCloudSync: this.databaseService.lastSyncTime(),
    pending: this.offlineSync.pendingCount(),
    deadLetter: this.offlineSync.deadLetterCount(),
    offline: this.offlineSync.networkStatus() === 'offline',
  }));

  constructor() {
    this.checkMobile();
    this.setupAppUpdateNotifications();
    this.updateShellFromUrl(this.router.url);

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateShellFromUrl(this.router.url);
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
    if (
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ) {
      if (!this.uiService.performanceMode()) {
        this.uiService.togglePerformanceMode();
      }
    }

    const isNowMobile = window.innerWidth <= 1024;
    if (isNowMobile !== this.isMobile()) {
      this.isMobile.set(isNowMobile);
      if (isNowMobile) {
        this.isSidebarOpen.set(false);
      } else {
        this.isSidebarOpen.set(true);
        this.isMobileWorkspaceTrayOpen.set(false);
      }
    }
    this.updateFullPageMode(this.router.url);
  }

  private updateShellFromUrl(url: string) {
    const path = this.getPrimaryRoute(url);
    if (path && this.uiService.getViewModes().includes(path as MainViewMode)) {
      this.uiService.setActiveViewFromRoute(path as MainViewMode);
    }
    this.updateFullPageMode(url);
  }

  private updateFullPageMode(url: string) {
    const path = this.getPrimaryRoute(url);
    this.isAuthRoute.set(path === 'login');
    this.isFullPageMode.set(
      this.isAuthRoute() ||
        ['piano-roll', 'tha-spot', 'networking'].includes(path) ||
        (path === 'studio' && this.isMobile())
    );
  }

  private isVersionReadyEvent(event: unknown): event is VersionReadyEvent {
    return (
      !!event &&
      typeof event === 'object' &&
      'type' in event &&
      (event as { type?: unknown }).type === 'VERSION_READY'
    );
  }

  private setupAppUpdateNotifications() {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((event) => this.isVersionReadyEvent(event)))
      .subscribe(() => {
        void this.dialog
          .confirm({
            title: 'Update Ready',
            message:
              'A new version of S.M.U.V.E. is available. Refresh now to load the latest workspace updates?',
            confirmLabel: 'Refresh now',
            cancelLabel: 'Later',
          })
          .then((shouldRefresh) => {
            if (shouldRefresh) {
              window.location.reload();
              return;
            }

            this.notificationService.show(
              'Update staged. Refresh when ready.',
              'info',
              8000
            );
          });
      });
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

  toggleSyncCenter() {
    this.isSyncCenterOpen.update((value) => !value);
  }

  toggleMobileWorkspaceTray() {
    this.isMobileWorkspaceTrayOpen.update((value) => !value);
  }

  togglePinnedView(mode: MainViewMode) {
    this.uiService.togglePinnedView(mode);
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
    if (this.isMobile()) {
      this.isSidebarOpen.set(false);
      this.isMobileWorkspaceTrayOpen.set(false);
    }
  }
}
