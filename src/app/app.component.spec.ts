import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AppComponent } from './app.component';
import { AuthService } from './services/auth.service';
import { UIService } from './services/ui.service';
import { NotificationService } from './services/notification.service';
import { SessionSafetyService } from './services/session-safety.service';
import { AiService } from './services/ai.service';
import { SettingsIntegrationService } from './services/settings-integration.service';
import { DatabaseService } from './services/database.service';
import { AutoSaveService } from './services/auto-save.service';
import { CommandPaletteService } from './services/command-palette.service';
import { UserProfileService } from './services/user-profile.service';
import { ArtistPathwayService } from './services/artist-pathway.service';
import { ArtistToolkitService } from './services/artist-toolkit.service';
import { OfflineSyncService } from './services/offline-sync.service';
import { InteractionDialogService } from './services/interaction-dialog.service';

describe('AppComponent', () => {
  const createComponent = async (routerUrl = '/hub', swUpdate?: unknown) => {
    localStorage.clear();
    const routerEvents$ = new Subject<any>();
    const uiService = {
      mainViewMode: signal<'hub' | 'strategy'>('hub'),
      activeTheme: signal({ name: 'Light' }),
      performanceMode: signal(false),
      showScanlines: signal(false),
      isOnline: signal(true),
      showMobileNav: signal(false),
      isChatbotOpen: signal(false),
      openChatbot: jest.fn(() => uiService.isChatbotOpen.set(true)),
      closeChatbot: jest.fn(() => uiService.isChatbotOpen.set(false)),
      getViewModes: jest.fn().mockReturnValue(['hub', 'strategy']),
      getViewConfigs: jest.fn().mockReturnValue([
        {
          mode: 'hub',
          label: 'Label Hub',
          description:
            'Coordinate releases, assets, and day-to-day executive moves.',
          icon: 'grid_view',
          category: 'CORE',
        },
        {
          mode: 'strategy',
          label: 'Intel Lab',
          description:
            'Activate AI strategy, market intelligence, and audit flows.',
          icon: 'analytics',
          category: 'STRATEGY',
        },
      ]),
      getViewConfig: jest.fn((mode: 'hub' | 'strategy') =>
        uiService.getViewConfigs().find((view: any) => view.mode === mode)
      ),
      getViewLabel: jest.fn((mode: string) =>
        mode === 'strategy' ? 'Intel Lab' : 'Label Hub'
      ),
      getViewDescription: jest.fn((mode: string) =>
        mode === 'strategy'
          ? 'Activate AI strategy, market intelligence, and audit flows.'
          : 'Coordinate releases, assets, and day-to-day executive moves.'
      ),
      getRelatedViewConfigs: jest.fn().mockReturnValue([]),
      getPrimaryMobileViewConfigs: jest.fn().mockReturnValue([
        {
          mode: 'hub',
          label: 'Label Hub',
          description:
            'Coordinate releases, assets, and day-to-day executive moves.',
          icon: 'grid_view',
          category: 'CORE',
        },
      ]),
      getOverflowMobileViewConfigs: jest.fn().mockReturnValue([]),
      getPinnedViewConfigs: jest.fn().mockReturnValue([]),
      getRecentViewConfigs: jest.fn().mockReturnValue([]),
      setActiveViewFromRoute: jest.fn(),
      togglePinnedView: jest.fn(),
      isPinned: jest.fn().mockReturnValue(false),
      navigateToView: jest.fn(),
      toggleChatbot: jest.fn(),
      toggleTheme: jest.fn(),
      toggleScanlines: jest.fn(),
      togglePerformanceMode: jest.fn(),
    };
    const router = {
      url: routerUrl,
      events: routerEvents$.asObservable(),
      navigateByUrl: jest.fn(),
      navigate: jest.fn(),
    };
    const notificationService = { show: jest.fn() };
    const authService = {
      isAuthenticated: jest.fn().mockReturnValue(false),
      isGuest: jest.fn().mockReturnValue(false),
      logout: jest.fn(),
    };
    const dialog = {
      confirm: jest.fn().mockResolvedValue(false),
      confirmWithAlternate: jest.fn().mockResolvedValue('cancel'),
    };
    const commandPalette = {
      handleGlobalKey: jest.fn(),
      togglePalette: jest.fn(),
      openGuide: jest.fn(),
      // AppComponent now injects ArtistCoachCommandIntegrationService, whose
      // constructor publishes coach actions through this palette method.
      setExtensionActions: jest.fn(),
      activeTips: signal([
        {
          id: 'global-guide',
          title: 'Interaction Guide',
          description:
            'Press ? to reveal contextual controls for the active view.',
        },
        {
          id: 'global-palette',
          title: 'Command Palette',
          description:
            'Press Ctrl + K (or ⌘ + K) to launch rapid actions across every module.',
        },
      ]),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        ...(swUpdate ? [{ provide: SwUpdate, useValue: swUpdate }] : []),
        { provide: AuthService, useValue: authService },
        { provide: UIService, useValue: uiService },
        { provide: NotificationService, useValue: notificationService },
        {
          provide: AiService,
          useValue: {
            systemStatus: signal({ latency: 42 }),
            performExecutiveAudit: jest.fn(),
          },
        },
        { provide: SettingsIntegrationService, useValue: {} },
        {
          provide: DatabaseService,
          useValue: { isSyncing: signal(false), lastSyncTime: signal(null) },
        },
        {
          provide: AutoSaveService,
          useValue: {
            isSaving: signal(false),
            lastSavedAt: signal(null),
            lastError: signal(null),
          },
        },
        { provide: CommandPaletteService, useValue: commandPalette },
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({ knowledgeBase: { strategicHealthScore: 0 } }),
          },
        },
        {
          provide: OfflineSyncService,
          useValue: {
            pendingCount: signal(0),
            deadLetterCount: signal(0),
            networkStatus: signal<'online' | 'offline'>('online'),
          },
        },
        { provide: InteractionDialogService, useValue: dialog },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(AppComponent, { set: { template: '<div></div>' } })
      .compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return {
      component,
      uiService,
      commandPalette,
      routerEvents$,
      router,
      notificationService,
      authService,
      dialog,
    };
  };

  it('should create the app', async () => {
    const { component } = await createComponent();
    expect(component).toBeTruthy();
  });

  it('groups navigation for the shared shell', async () => {
    const { component } = await createComponent();

    expect(component.navigationGroups()).toEqual([
      expect.objectContaining({
        category: 'CORE',
        label: 'Core Systems',
        items: [
          expect.objectContaining({
            mode: 'hub',
            description:
              'Coordinate releases, assets, and day-to-day executive moves.',
          }),
        ],
      }),
      expect.objectContaining({
        category: 'STRATEGY',
        label: 'AI Strategy',
        items: [
          expect.objectContaining({
            mode: 'strategy',
            description:
              'Activate AI strategy, market intelligence, and audit flows.',
          }),
        ],
      }),
    ]);
  });

  it('exposes active view metadata and spotlight tips', async () => {
    const { component, uiService } = await createComponent();

    uiService.mainViewMode.set('strategy');

    expect(component.activeViewConfig().label).toBe('Intel Lab');
    expect(component.spotlightTips()).toHaveLength(2);
  });

  it('resolves the current workspace to a real Masterclass lesson', async () => {
    const { component } = await createComponent('/studio?view=mixer');

    expect(component.teachTarget()).not.toBeNull();
    expect(component.teachTarget()!.lessonId.length).toBeGreaterThan(3);
    expect(component.teachTarget()!.track.length).toBeGreaterThan(3);
  });

  it('opens the Masterclass at the current screen lesson', async () => {
    const { component, router } = await createComponent('/songwriting/pad');
    const target = component.teachTarget()!;

    component.openTeachScreen();

    expect(router.navigate).toHaveBeenCalledWith(['/masterclass'], {
      queryParams: { guide: target.track, lesson: target.lessonId },
    });
  });

  it('does not advertise the teaching action on auth routes', async () => {
    const { component } = await createComponent('/login');

    expect(component.teachTarget()).toBeNull();
  });

  it('does not advertise the teaching action on the Masterclass itself', async () => {
    const { component } = await createComponent('/masterclass?guide=atlas');

    expect(component.teachTarget()).toBeNull();
  });

  it('opens the interaction guide from the shell', async () => {
    const { component, commandPalette } = await createComponent();

    component.openInteractionGuide();

    expect(commandPalette.openGuide).toHaveBeenCalled();
  });

  it('should toggle the chatbot', async () => {
    const { component, uiService } = await createComponent();

    component.toggleChatbot();

    expect(uiService.toggleChatbot).toHaveBeenCalled();
  });

  it('offers the combined pathway, release, and rights queue in the mobile tray', async () => {
    const { component } = await createComponent();
    const queue = component.mobileMoveQueue();

    // The pathway still leads, exactly as it does in the Hub and palette.
    const ranked = TestBed.inject(ArtistPathwayService).readout(
      TestBed.inject(UserProfileService).profile()
    ).nextAction?.step;
    expect(queue[0].source).toBe('pathway');
    expect(queue[0].title).toBe(ranked?.title);
    expect(queue.some((move) => move.source === 'release')).toBe(true);
    expect(queue.some((move) => move.source === 'rights')).toBe(true);
    expect(component.mobileQueueSummary()).toContain('release milestones');
  });

  it('opens pathway and toolkit items from the mobile tray', async () => {
    const { component, router, uiService } = await createComponent();
    const queue = component.mobileMoveQueue();

    component.isMobile.set(true);
    component.isMobileWorkspaceTrayOpen.set(true);
    component.openMobileQueueMove(queue[0]);

    expect(uiService.navigateToView).toHaveBeenCalledWith('artist-development');
    expect(component.isMobileWorkspaceTrayOpen()).toBe(false);

    const release = queue.find((move) => move.source === 'release')!;
    component.isMobileWorkspaceTrayOpen.set(true);
    component.openMobileQueueMove(release);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/toolkit?tab=blueprint');
    expect(component.isMobileWorkspaceTrayOpen()).toBe(false);

    const rights = queue.find((move) => move.source === 'rights')!;
    component.isMobileWorkspaceTrayOpen.set(true);
    component.openMobileQueueMove(rights);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/toolkit?tab=rights');
  });

  it('completes a toolkit step from the mobile tray', async () => {
    const { component } = await createComponent();
    const toolkit = TestBed.inject(ArtistToolkitService);
    const firstRightsMove = component
      .mobileMoveQueue()
      .find((move) => move.source === 'rights')!;

    component.completeMobileQueueMove(firstRightsMove);

    expect(toolkit.isRightsTaskDone(firstRightsMove.toolkitId!)).toBe(true);
    expect(
      component
        .mobileMoveQueue()
        .find((move) => move.source === 'rights')?.toolkitId
    ).not.toBe(firstRightsMove.toolkitId);
  });

  it('returns directly to the Hub and closes workspace overlays from any route', async () => {
    const { component, router, uiService } = await createComponent('/tha-spot/game/modern-polytrack');
    component.isMobile.set(true);
    component.isSidebarOpen.set(true);
    component.isMobileWorkspaceTrayOpen.set(true);
    component.isSyncCenterOpen.set(true);
    component.navigateHome();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/hub');
    expect(component.isSidebarOpen()).toBe(false);
    expect(component.isMobileWorkspaceTrayOpen()).toBe(false);
    expect(component.isSyncCenterOpen()).toBe(false);
    expect(uiService.closeChatbot).toHaveBeenCalled();
  });

  it('uses the Hub as a back fallback on a cold deep link', async () => {
    const { component, router } = await createComponent('/mixer');
    const originalState = window.history.state;
    window.history.replaceState({ navigationId: 1 }, '');
    component.goBack();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/hub');
    window.history.replaceState(originalState, '');
  });

  it('treats password recovery as an auth route without workspace overlays', async () => {
    const { component } = await createComponent('/reset-password?token=fixture');
    expect(component.isAuthRoute()).toBe(true);
    expect(component.isFullPageMode()).toBe(true);
  });

  it('marks tha-spot as full-page mode', async () => {
    const { component } = await createComponent('/tha-spot');

    expect(component.isFullPageMode()).toBe(true);
  });

  it('treats login as an auth-only full-page route', async () => {
    const { component, uiService } = await createComponent('/login');

    expect(component.isAuthRoute()).toBe(true);
    expect(component.isFullPageMode()).toBe(true);
    expect(uiService.closeChatbot).toHaveBeenCalled();
  });

  it('closes the shared assistant drawer when navigating to login', async () => {
    const { uiService, routerEvents$, router } = await createComponent('/hub');
    uiService.openChatbot();
    expect(uiService.isChatbotOpen()).toBe(true);

    router.url = '/login';
    routerEvents$.next(new NavigationEnd(1, '/hub', '/login'));

    expect(uiService.isChatbotOpen()).toBe(false);
    expect(uiService.closeChatbot).toHaveBeenCalledTimes(1);
  });

  /*
   * The login screen used to report a System Anomaly on arrival. Two causes,
   * both in the shell rather than the login form itself:
   *
   *  1. The route animation was bound to `RouterOutlet.isActivated`, which
   *     flips *after* the checked pass, so Angular reported NG0100 on every
   *     cold start.
   *  2. The persistent TV player rendered on the auth route, where there is
   *     no TV and no session to keep.
   */
  describe('login surface', () => {
    const template = readFileSync(
      join(__dirname, 'app.component.html'),
      'utf8'
    );
    const source = readFileSync(join(__dirname, 'app.component.ts'), 'utf8');

    it('drives the route animation from a signal settled before change detection', () => {
      // Reading the outlet's activation state is what made the binding change
      // mid-pass; the animation now reads the shell's own navigation signal.
      expect(source).not.toContain('outlet.isActivated');
      expect(source).toContain('activeRoutePath');
      expect(template).toContain('routeAnimState()');
      expect(template).not.toContain('routeAnimState(outlet)');
    });

    it('keeps the persistent TV player off the auth route', () => {
      // Every other shell overlay is gated the same way; the player was the
      // one surface that mounted on login.
      expect(template).toContain(
        '<app-smuve-tv-persistent-player *ngIf="!isAuthRoute()">'
      );
      expect(template).not.toContain(
        '<app-smuve-tv-persistent-player></app-smuve-tv-persistent-player>'
      );
    });
  });

  it('updates mobile shell state when the viewport changes', async () => {
    const { component } = await createComponent('/hub');
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
    });
    component.onResize();

    expect(component.isMobile()).toBe(true);
    expect(component.isSidebarOpen()).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    component.onResize();

    expect(component.isMobile()).toBe(false);
    expect(component.isSidebarOpen()).toBe(true);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  });

  it('stops reacting to router events after the shell is destroyed', async () => {
    const { uiService, routerEvents$ } = await createComponent('/hub');

    uiService.setActiveViewFromRoute.mockClear();

    TestBed.resetTestingModule();
    routerEvents$.next(new NavigationEnd(1, '/strategy', '/strategy'));

    expect(uiService.setActiveViewFromRoute).not.toHaveBeenCalled();
  });

  /**
   * The Studio is a full-window DAW on every device. It used to be full-page
   * only on a phone, which left the desktop shell inside the Hub frame: at
   * 1440x900 that frame took 195px (the shell measured 705px tall) and the
   * timeline was left with 49% of the viewport, while duplicating the
   * navigation the Studio's own rail already provides. A resize must not move
   * the Studio in or out of that mode.
   */
  it('treats studio as full-page at every viewport width', async () => {
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
    });
    const { component } = await createComponent('/studio');

    expect(component.isMobile()).toBe(true);
    expect(component.isFullPageMode()).toBe(true);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    component.onResize();

    expect(component.isMobile()).toBe(false);
    expect(component.isFullPageMode()).toBe(true);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  });

  /**
   * `studio-classic` is the same Studio component behind a legacy alias. It was
   * matched against `studio` only, so it rendered inside the Hub frame: on an
   * Android phone that meant 64px of app chrome in portrait and 159px in
   * landscape above the DAW, with the Studio's own bottom nav pushed past the
   * bottom of the screen.
   */
  it('treats the studio-classic alias as the same full-page Studio', async () => {
    const { component } = await createComponent('/studio-classic');

    expect(component.isFullPageMode()).toBe(true);
  });

  it('hides the floating home link on the mobile Studio shell that has its own Home tab', async () => {
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
    });
    const { component, uiService } = await createComponent('/studio');
    uiService.showMobileNav.set(true);

    expect(component.isFullPageMode()).toBe(true);
    expect(component.showUniversalHomeLink()).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  });

  it('keeps the floating home link on standalone full-page workspaces', async () => {
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
    });
    const { component, uiService } = await createComponent('/mixer');
    uiService.showMobileNav.set(true);

    expect(component.isFullPageMode()).toBe(true);
    expect(component.showUniversalHomeLink()).toBe(true);
    expect(component.usesInlineHomeLink()).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  });

  it('moves the floating Home shortcut into the drum-machine header', async () => {
    const { component } = await createComponent('/drum-machine');

    expect(component.usesInlineHomeLink()).toBe(true);
  });

  it('moves the floating Home shortcut into the performance header', async () => {
    const { component } = await createComponent('/performance');

    expect(component.usesInlineHomeLink()).toBe(true);
  });

  it('hides the floating home link on the studio landscape tier that shows the rail', async () => {
    const originalWidth = window.innerWidth;

    // 769–1024 landscape: showMobileNav() is false, so the old gate let the
    // floating link through — where it parked over the piano-roll's expand
    // button and the AI-assistant FAB. The workspace rail carries Home here.
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 844,
    });
    const { component, uiService } = await createComponent('/studio');
    uiService.showMobileNav.set(false);

    expect(component.isFullPageMode()).toBe(true);
    expect(component.showUniversalHomeLink()).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  });

  it('keeps the advisor FAB off the Studio shell at mobile and desktop sizes', async () => {
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 844,
    });
    const { component } = await createComponent('/studio');

    expect(component.isMobile()).toBe(true);
    expect(component.showAdvisorFab()).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    component.onResize();

    expect(component.isMobile()).toBe(false);
    expect(component.showAdvisorFab()).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  });

  it('keeps the advisor FAB on non-studio screens', async () => {
    const { component } = await createComponent('/hub');

    expect(component.showAdvisorFab()).toBe(true);
  });

  /**
   * The shell's root scroll surface.
   *
   * `html, body { height: 100%; overflow-y: auto }` made <body> its own scroll
   * container while <html> stayed exactly viewport-sized, so every standard
   * scrolling mechanism — `window.scrollTo()`, `documentElement.scrollTop`, the
   * router's scroll handling — addressed a scroller that never moved. The
   * symptom was that opening a workspace from part-way down a long page kept
   * the previous offset, landing the opened surface mid-page.
   */
  describe('root scroll surface', () => {
    const styles = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
    const config = readFileSync(join(__dirname, 'app.config.ts'), 'utf8');

    /** Declaration bodies of every rule whose selector list mentions `sel`. */
    const blocksFor = (sel: string, source = styles): string[] =>
      [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((rule) => rule[1].includes(sel))
        .map((rule) => rule[2]);

    it('scrolls the viewport instead of making <body> the scroller', () => {
      const body = blocksFor('body').join(' ');

      expect(body).toContain('overflow: visible');
      // A stray `hidden` on either axis would recompute the other to `auto` and
      // quietly make <body> a scroll container again.
      expect(body).not.toMatch(/body\s*\{[^}]*overflow[^:]*:\s*(hidden|auto)/);

      // The root keeps the scroll: the viewport is the surface, and horizontal
      // overflow stays clipped there.
      const root = blocksFor('html').join(' ');
      expect(root).toContain('overflow-y: auto');
      expect(root).toContain('overflow-x: hidden');
      expect(root).toContain('overscroll-behavior-y: none');
    });

    it('restores scroll position through the router', () => {
      expect(config).toContain('withInMemoryScrolling');
      expect(config).toContain("scrollPositionRestoration: 'enabled'");
    });
  });

  describe('sidebar drawer UX (mobile + desktop sweep)', () => {
    /** Touch helper matching the window-level listeners the shell uses. */
    const touchEvent = (x: number, y: number, sidebarTarget = true): TouchEvent =>
      ({
        touches: [{ clientX: x, clientY: y }],
        changedTouches: [{ clientX: x, clientY: y }],
        target: sidebarTarget
          ? { closest: (sel: string) => (sel === '.sidebar' ? {} : null) }
          : { closest: () => null },
      } as unknown as TouchEvent);

    const goMobile = (component: AppComponent) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 500,
      });
      component.onResize();
    };

    it('closes the mobile drawer on a committed left swipe', async () => {
      const { component } = await createComponent('/hub');
      goMobile(component);
      component.isSidebarOpen.set(true);

      component.onSidebarTouchStart(touchEvent(300, 200));
      component.onSidebarTouchEnd(touchEvent(180, 205));

      expect(component.isSidebarOpen()).toBe(false);

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      component.onResize();
    });

    it('keeps the drawer open for small or vertical drags', async () => {
      const { component } = await createComponent('/hub');
      goMobile(component);
      component.isSidebarOpen.set(true);

      // Short, ambiguous nudge: must not close.
      component.onSidebarTouchStart(touchEvent(300, 200));
      component.onSidebarTouchEnd(touchEvent(270, 210));
      expect(component.isSidebarOpen()).toBe(true);

      // Vertical scroll inside the drawer: must not close.
      component.onSidebarTouchStart(touchEvent(300, 200));
      component.onSidebarTouchEnd(touchEvent(290, 320));
      expect(component.isSidebarOpen()).toBe(true);

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      component.onResize();
    });

    it('ignores swipes that start outside the drawer', async () => {
      const { component } = await createComponent('/hub');
      goMobile(component);
      component.isSidebarOpen.set(true);

      component.onSidebarTouchStart(touchEvent(300, 200, false));
      component.onSidebarTouchEnd(touchEvent(100, 200, false));

      expect(component.isSidebarOpen()).toBe(true);

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      component.onResize();
    });

    it('opens the drawer with a rightward swipe from the left edge', async () => {
      const { component } = await createComponent('/hub');
      goMobile(component);
      component.isSidebarOpen.set(false);

      // Contact inside the 32px edge strip, dragged rightward 120px.
      component.onSidebarTouchStart(touchEvent(12, 200, false));
      component.onSidebarTouchEnd(touchEvent(132, 205, false));
      expect(component.isSidebarOpen()).toBe(true);

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      component.onResize();
    });

    it('does not swipe-open when the gesture starts too far from the edge', async () => {
      const { component } = await createComponent('/hub');
      goMobile(component);
      component.isSidebarOpen.set(false);

      // Starts 300px in: content-owned gesture, not an edge swipe.
      component.onSidebarTouchStart(touchEvent(300, 200, false));
      component.onSidebarTouchEnd(touchEvent(420, 205, false));
      expect(component.isSidebarOpen()).toBe(false);

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      component.onResize();
    });

    it('never swipe-opens over a full-page route', async () => {
      const { component } = await createComponent('/dj');
      goMobile(component);
      component.isSidebarOpen.set(false);

      component.onSidebarTouchStart(touchEvent(12, 200, false));
      component.onSidebarTouchEnd(touchEvent(132, 205, false));
      expect(component.isSidebarOpen()).toBe(false);

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      component.onResize();
    });

    it('closes the mobile drawer with ESC but leaves the desktop sidebar alone', async () => {
      const { component } = await createComponent('/hub');

      // Desktop: sidebar open, ESC is a no-op.
      component.onEscapeKey();
      expect(component.isSidebarOpen()).toBe(true);

      goMobile(component);
      component.isSidebarOpen.set(true);
      component.onEscapeKey();
      expect(component.isSidebarOpen()).toBe(false);

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      component.onResize();
    });

    it('desktop collapse keeps the rail mounted and hover re-opens it', async () => {
      const { component } = await createComponent('/hub');
      expect(component.isSidebarOpen()).toBe(true);

      component.toggleSidebar();
      expect(component.isSidebarOpen()).toBe(false);
      // Rail stays in the DOM for hover re-open (CSS affordance).
      expect(component.isFullPageMode()).toBe(false);

      component.toggleSidebar();
      expect(component.isSidebarOpen()).toBe(true);
    });
  });

  describe('downloaded build', () => {
    const versionReady = { type: 'VERSION_READY' };

    it('announces a waiting build instead of reloading over a live session', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component } = await createComponent('/studio', swUpdate);

      versionUpdates$.next(versionReady);

      // A DAW must not be restarted under the artist by a deployment: the
      // take, bounce or unsaved edit in flight would be gone.
      expect(component.pendingUpdate()).toBe(true);
      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();

      const reload = jest
        .spyOn(component as any, 'reloadForUpdate')
        .mockImplementation(() => undefined);
      await component.applyPendingUpdate();

      expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('lets the artist postpone the reload', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component } = await createComponent('/studio', swUpdate);

      versionUpdates$.next(versionReady);
      component.dismissPendingUpdate();

      expect(component.pendingUpdate()).toBe(false);
      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    });

    it('refuses to reload over a live take and explains why', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component, notificationService } = await createComponent(
        '/studio',
        swUpdate,
      );
      TestBed.inject(SessionSafetyService).isRecording.set(true);
      versionUpdates$.next(versionReady);

      expect(component.reloadBlockedReason()).toContain('recording');

      await component.applyPendingUpdate();

      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
      expect(component.pendingUpdate()).toBe(true);
      expect(notificationService.show).toHaveBeenCalledWith(
        expect.stringContaining('recording'),
        'warning',
      );
    });

    it('refuses while the set has unsaved changes and allows it after saving', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component } = await createComponent('/studio', swUpdate);
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      versionUpdates$.next(versionReady);

      expect(component.reloadBlockedReason()).toContain('unsaved');
      await component.applyPendingUpdate();
      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();

      // A save must clear the block; otherwise the update could never land.
      safety.hasUnsavedChanges.set(false);
      expect(component.reloadBlockedReason()).toBeNull();

      jest
        .spyOn(component as any, 'reloadForUpdate')
        .mockImplementation(() => undefined);
      await component.applyPendingUpdate();
      expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
    });

    it('refuses while a save is finishing or a take is armed', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component } = await createComponent('/studio', swUpdate);
      const safety = TestBed.inject(SessionSafetyService);

      safety.isProjectSaving.set(true);
      expect(component.reloadBlockedReason()).toContain('save is finishing');

      safety.isProjectSaving.set(false);
      safety.armedTakeCount.set(2);
      expect(component.reloadBlockedReason()).toContain('armed');

      await component.applyPendingUpdate();
      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    });

    it('saves first and applies the update only after the save succeeds', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component } = await createComponent('/studio', swUpdate);
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      const save = jest.fn(async () => {
        safety.hasUnsavedChanges.set(false);
        return { ok: true };
      });
      safety.registerSaveHandler(save);
      versionUpdates$.next(versionReady);
      const reload = jest
        .spyOn(component as any, 'reloadForUpdate')
        .mockImplementation(() => undefined);

      expect(component.canSaveAndReload()).toBe(true);
      await component.saveAndReload();

      expect(save).toHaveBeenCalledTimes(1);
      expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('keeps the update waiting when the save is refused', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component, notificationService } = await createComponent(
        '/studio',
        swUpdate,
      );
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      safety.registerSaveHandler(
        jest.fn(async () => ({
          ok: false,
          message: 'Guest sessions are not saved.',
        })),
      );
      versionUpdates$.next(versionReady);

      await component.saveAndReload();

      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
      expect(component.pendingUpdate()).toBe(true);
      expect(notificationService.show).toHaveBeenCalledWith(
        'Guest sessions are not saved.',
        'error',
      );
    });

    it('does not reload if a take starts while the save is writing', async () => {
      const versionUpdates$ = new Subject<any>();
      const swUpdate = {
        isEnabled: true,
        versionUpdates: versionUpdates$.asObservable(),
        activateUpdate: jest.fn().mockResolvedValue(undefined),
      };
      const { component, notificationService } = await createComponent(
        '/studio',
        swUpdate,
      );
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      safety.registerSaveHandler(
        jest.fn(async () => {
          safety.isRecording.set(true);
          safety.hasUnsavedChanges.set(false);
          return { ok: true };
        }),
      );
      versionUpdates$.next(versionReady);

      await component.saveAndReload();

      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
      expect(notificationService.show).toHaveBeenCalledWith(
        expect.stringContaining('recording'),
        'warning',
      );
    });
  });

  describe('sign out', () => {
    it('signs out immediately when nothing is at risk', async () => {
      const { component, authService, dialog } = await createComponent();

      await component.signOut();

      expect(dialog.confirm).not.toHaveBeenCalled();
      expect(dialog.confirmWithAlternate).not.toHaveBeenCalled();
      expect(authService.logout).toHaveBeenCalledTimes(1);
    });

    it('offers save-and-sign-out for unsaved work', async () => {
      const { component, authService, dialog, notificationService } =
        await createComponent();
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      const save = jest.fn(async () => {
        safety.hasUnsavedChanges.set(false);
        return { ok: true };
      });
      safety.registerSaveHandler(save);
      dialog.confirmWithAlternate.mockResolvedValueOnce('confirm');

      await component.signOut();

      expect(dialog.confirm).not.toHaveBeenCalled();
      expect(dialog.confirmWithAlternate).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmLabel: 'Save & sign out',
          alternateLabel: 'Sign out without saving',
          tone: 'danger',
          message: expect.stringContaining('unsaved changes'),
        }),
      );
      expect(save).toHaveBeenCalledTimes(1);
      expect(authService.logout).toHaveBeenCalledTimes(1);
      expect(notificationService.show).not.toHaveBeenCalled();
    });

    it('signs out without saving when the artist chooses to discard', async () => {
      const { component, authService, dialog } = await createComponent();
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      const save = jest.fn(async () => ({ ok: true }));
      safety.registerSaveHandler(save);
      dialog.confirmWithAlternate.mockResolvedValueOnce('alternate');

      await component.signOut();

      expect(save).not.toHaveBeenCalled();
      expect(authService.logout).toHaveBeenCalledTimes(1);
    });

    it('stays signed in and explains when the save fails', async () => {
      const { component, authService, dialog, notificationService } =
        await createComponent();
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      safety.registerSaveHandler(
        jest.fn(async () => ({
          ok: false,
          message: 'Guest sessions are not saved.',
        })),
      );
      dialog.confirmWithAlternate.mockResolvedValueOnce('confirm');

      await component.signOut();

      expect(authService.logout).not.toHaveBeenCalled();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Guest sessions are not saved.',
        'error',
      );
    });

    it('honours a cancelled exit', async () => {
      const { component, authService, dialog } = await createComponent();
      TestBed.inject(SessionSafetyService).hasUnsavedChanges.set(true);
      dialog.confirmWithAlternate.mockResolvedValueOnce('cancel');

      await component.signOut();

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('uses the two-way warning for a live take, without offering a save', async () => {
      const { component, authService, dialog } = await createComponent();
      const safety = TestBed.inject(SessionSafetyService);
      safety.hasUnsavedChanges.set(true);
      safety.isRecording.set(true);
      dialog.confirm.mockResolvedValueOnce(false);

      await component.signOut();

      expect(dialog.confirmWithAlternate).not.toHaveBeenCalled();
      expect(dialog.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('take is recording'),
        }),
      );
      expect(authService.logout).not.toHaveBeenCalled();
    });
  });
});
