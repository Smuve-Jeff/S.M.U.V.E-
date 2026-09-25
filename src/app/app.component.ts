import {
  Component,
  inject,
  effect,
  signal,
  HostListener,
  computed,
  DestroyRef,
  Injector,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, Location } from '@angular/common';
import {
  RouterLink,
  RouterOutlet,
  Router,
  NavigationEnd,
} from '@angular/router';
import { trigger, transition, style, animate, query } from '@angular/animations';
import { filter } from 'rxjs/operators';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';

import { AuthService } from './services/auth.service';
import { UIService } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { NotificationToastComponent } from './components/notification-toast/notification-toast.component';
import { SmuveAdvisorComponent } from './components/smuve-advisor/smuve-advisor.component';
import { SmuveTvPersistentPlayerComponent } from './components/smuve-tv-persistent-player/smuve-tv-persistent-player.component';
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
import { AudioEngineService } from './services/audio-engine.service';
import { ChallengeInboxService } from './services/challenge-inbox.service';
import { LoggingService } from './services/logging.service';
import { ViewConfig } from './services/workspace-registry';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

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
    SmuveTvPersistentPlayerComponent,
    CommandPaletteComponent,
    InteractionDialogComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  animations: [
    trigger('routeAnim', [
      transition('* <=> *', [
        query(
          ':enter',
          [
            style({ opacity: 0, transform: 'translateY(12px)' }),
            animate(
              '320ms cubic-bezier(0.22, 1, 0.36, 1)',
              style({ opacity: 1, transform: 'translateY(0)' })
            ),
          ],
          { optional: true }
        ),
      ]),
    ]),
  ],
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
  location = inject(Location);
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  dialog = inject(InteractionDialogService);
  inboxService = inject(ChallengeInboxService);
  swUpdate = inject(SwUpdate, { optional: true });
  router = inject(Router);
  destroyRef = inject(DestroyRef);

  isSidebarOpen = signal(true);
  isFullPageMode = signal(false);
  isMobile = signal(false);
  isAuthRoute = signal(false);
  isSyncCenterOpen = signal(false);
  isMobileWorkspaceTrayOpen = signal(false);
  installPrompt = signal<BeforeInstallPromptEvent | null>(null);

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
  unreadNotifications = this.inboxService.unreadCount;
  pendingChallenges = this.inboxService.pendingCount;
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
    this.breakIframeLoop();
    this.applyMobileDefaultPerformanceMode();
    this.checkMobile();
    this.setupPwaListeners();
    this.setupAppUpdateNotifications();
    this.updateShellFromUrl(this.router.url);
    this.armAudioOnFirstUserGesture();

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.updateShellFromUrl(this.router.url);
      });

    effect(() => {
      if (!this.uiService.isOnline()) {
        this.notificationService.show('System Offline', 'error', 3000);
      }
    });
  }

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: BeforeInstallPromptEvent) {
    event.preventDefault();
    this.installPrompt.set(event);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    this.commandPalette.handleGlobalKey(event);
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  /** ESC closes the drawer on phones with external keyboards. */
  @HostListener('window:keydown.escape')
  onEscapeKey() {
    if (this.isMobile() && this.isSidebarOpen() && !this.isFullPageMode()) {
      this.isSidebarOpen.set(false);
    }
    if (this.isMobileWorkspaceTrayOpen()) {
      this.isMobileWorkspaceTrayOpen.set(false);
    }
  }

  /**
   * Native drawer feel on touch: swipe left anywhere on the open drawer to
   * close it, or swipe right from the screen's left edge to open it — the
   * standard Android drawer pair.
   */
  /** Left-edge strip that arms an open swipe (px from the screen edge). */
  private readonly sidebarEdgeOpenPx = 32;
  private sidebarTouchStart: {
    x: number;
    y: number;
    fromSidebar: boolean;
  } | null = null;

  @HostListener('window:touchstart', ['$event'])
  onSidebarTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;
    const target = event.target as HTMLElement | null;
    const fromSidebar = !!target?.closest('.sidebar');
    // Only arm a gesture when it begins on the open drawer (close) or
    // inside the left-edge strip (open); everything else belongs to content.
    if (!fromSidebar && touch.clientX > this.sidebarEdgeOpenPx) return;
    this.sidebarTouchStart = {
      x: touch.clientX,
      y: touch.clientY,
      fromSidebar,
    };
  }

  @HostListener('window:touchend', ['$event'])
  onSidebarTouchEnd(event: TouchEvent) {
    const start = this.sidebarTouchStart;
    this.sidebarTouchStart = null;
    if (!start || !this.isMobile()) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Horizontal and committed: vertical content scrolling never toggles.
    if (Math.abs(dx) <= Math.abs(dy) * 1.4) return;
    if (start.fromSidebar) {
      // Leftward swipe on the open drawer closes it.
      if (this.isSidebarOpen() && dx < -56) {
        this.isSidebarOpen.set(false);
      }
    } else if (
      // Rightward swipe from the edge opens it — but full-page routes own
      // the whole viewport (DJ decks, timeline gestures), so never fight them.
      !this.isFullPageMode() &&
      !this.isSidebarOpen() &&
      dx > 56
    ) {
      this.isSidebarOpen.set(true);
    }
  }

  /**
   * One-time init: mobile devices default to performance mode because
   * heavy blur/particle effects cost real frames on mid-range GPUs. This
   * is a DEFAULT, not a law — a persisted user OFF (Settings) wins, and
   * unlike the previous checkMobile() placement, resizes never re-force
   * it back on over the user's explicit choice.
   */
  private applyMobileDefaultPerformanceMode() {
    if (typeof navigator === 'undefined') return;
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    if (this.uiService.performanceMode()) return;
    const saved = (
      this.profileService.profile() as
        | { settings?: { ui?: { performanceMode?: boolean } } }
        | null
    )?.settings?.ui?.performanceMode;
    if (saved === false) return;
    this.uiService.togglePerformanceMode();
  }

  private checkMobile() {
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
    this.activeRoutePath.set(url.split(/[?#]/)[0].replace(/^\/+/, ''));
    this.isAuthRoute.set(path === 'login');
    this.isFullPageMode.set(
      this.isAuthRoute() ||
        [
          'dj',
          'piano-roll',
          'tha-spot',
          'networking',
          'mixer',
          'drum-machine',
          'performance',
          'mastering',
        ].includes(path) ||
        (path === 'studio' && this.isMobile())
    );
  }

  /**
   * Audio is a protected capability, not a login prerequisite. The previous
   * shell injection created the full Web Audio graph while the auth route was
   * still rendering, which produced autoplay warnings and could take down the
   * entire app in embedded browsers without AudioContext. Defer the first
   * engine lookup until a real gesture on an authenticated surface; audio-aware
   * route components still inject the service normally when they load.
   */
  private armAudioOnFirstUserGesture(): void {
    if (typeof document === 'undefined' || !document.body) return;

    const body = document.body;
    const events = ['click', 'touchstart', 'keydown'];
    const cleanup = () =>
      events.forEach((event) =>
        body.removeEventListener(event, arm, { capture: true })
      );
    const arm = () => {
      // Keep the listener installed while the user is signing in. This avoids
      // constructing audio on the login page and still arms the engine as soon
      // as the first authenticated interaction arrives.
      if (this.isAuthRoute()) return;
      cleanup();
      try {
        this.injector.get(AudioEngineService).armOnFirstUserGesture();
      } catch (error) {
        // An unavailable audio implementation must not become a global anomaly
        // or prevent the rest of the workspace from rendering.
        this.logger.warn('Audio engine unavailable; continuing without audio.', error);
      }
    };

    events.forEach((event) =>
      body.addEventListener(event, arm, { capture: true })
    );
  }

  private setupPwaListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('appinstalled', () => {
      this.installPrompt.set(null);
      this.notificationService.show(
        'S.M.U.V.E. successfully installed!',
        'success'
      );
    });
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
      .pipe(
        filter((event) => this.isVersionReadyEvent(event)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        // Activate the new service worker immediately and reload.
        // No dialog — returning users always get the latest build.
        this.swUpdate!.activateUpdate().then(() => {
          window.location.reload();
        });
      });
  }

  private breakIframeLoop() {
    if (typeof window === 'undefined' || window.self === window.top) return;

    const path = window.location.pathname;
    const isGameAsset = path.includes('/assets/games/');

    // If the iframe is pointed at a static game asset path we should NOT
    // immediately break the frame — many games are served as plain HTML
    // under /assets/games/*. However, the Service Worker or hosting may
    // accidentally return the SPA index (the Angular app) for a missing
    // asset, causing the full application to load inside the game's iframe.
    // That is the situation we DO want to detect and break. We can detect
    // this by checking for an <app-root> element which is present only when
    // the SPA was served.
    const appRootPresent =
      typeof document !== 'undefined' && !!document.querySelector('app-root');

    if (isGameAsset && appRootPresent) {
      console.error(
        '[AppComponent] Missing game asset detected (fallback to app) for path: ' +
          path +
          '. Breaking loop.'
      );
      window.location.replace('about:blank');
      return;
    }

    const isAppRoute = [
      '/',
      '/hub',
      '/tha-spot',
      '/studio',
      '/networking',
    ].some((r) => path === r || path.startsWith(r + '/'));
    if (isAppRoute) {
      console.error(
        '[AppComponent] App route detected in iframe: ' +
          path +
          '. Breaking loop.'
      );
      window.location.replace('about:blank');
    }
  }

  private getPrimaryRoute(url: string): string {
    const normalizedPath = url.split(/[?#]/)[0].replace(/^\/+/, '');
    return normalizedPath.split('/')[0] ?? '';
  }

  /**
   * The full route path, kept in a signal so the route animation has a value
   * that is already settled when change detection reads it.
   */
  private readonly activeRoutePath = signal('');

  toggleSidebar() {
    this.isSidebarOpen.update((v) => !v);
  }

  goBack() {
    this.location.back();
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

  async promptPwaInstall() {
    const prompt = this.installPrompt();
    if (!prompt) {
      this.notificationService.show(
        'Installation is not available at this moment.',
        'warning'
      );
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      this.notificationService.show(
        'Beginning S.M.U.V.E. installation...',
        'info'
      );
    }
    this.installPrompt.set(null);
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

  /**
   * The route key the animation switches on.
   *
   * Read from the shell's own navigation signal rather than from the outlet's
   * activation state. `RouterOutlet.isActivated` flips *after* the current
   * change-detection pass, so binding to it made the value change between the
   * checked pass and the verification pass — Angular reported that as
   * NG0100 (ExpressionChangedAfterItHasBeenCheckedError) on every cold start,
   * including the login screen, where the shell is the very first thing to
   * render. The navigation signal updates from the router event, which runs
   * before change detection, so the binding is stable within a pass.
   */
  routeAnimState(): string {
    return this.activeRoutePath();
  }
}
