import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AppComponent } from './app.component';
import { AuthService } from './services/auth.service';
import { UIService } from './services/ui.service';
import { NotificationService } from './services/notification.service';
import { AiService } from './services/ai.service';
import { SettingsIntegrationService } from './services/settings-integration.service';
import { DatabaseService } from './services/database.service';
import { AutoSaveService } from './services/auto-save.service';
import { CommandPaletteService } from './services/command-palette.service';
import { UserProfileService } from './services/user-profile.service';
import { OfflineSyncService } from './services/offline-sync.service';
import { InteractionDialogService } from './services/interaction-dialog.service';

describe('AppComponent', () => {
  const createComponent = async (routerUrl = '/hub') => {
    const routerEvents$ = new Subject<any>();
    const uiService = {
      mainViewMode: signal<'hub' | 'strategy'>('hub'),
      activeTheme: signal({ name: 'Light' }),
      performanceMode: signal(false),
      showScanlines: signal(false),
      isOnline: signal(true),
      isChatbotOpen: signal(false),
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
    const commandPalette = {
      handleGlobalKey: jest.fn(),
      togglePalette: jest.fn(),
      openGuide: jest.fn(),
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
        {
          provide: AuthService,
          useValue: { isAuthenticated: jest.fn().mockReturnValue(false) },
        },
        { provide: UIService, useValue: uiService },
        { provide: NotificationService, useValue: { show: jest.fn() } },
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
        {
          provide: InteractionDialogService,
          useValue: { confirm: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: Router,
          useValue: {
            url: routerUrl,
            events: routerEvents$.asObservable(),
            navigateByUrl: jest.fn(),
          },
        },
      ],
    })
      .overrideComponent(AppComponent, { set: { template: '<div></div>' } })
      .compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return { component, uiService, commandPalette, routerEvents$ };
  };

  it('should create the app', async () => {
    const { component } = await createComponent();
    expect(component).toBeTruthy();
  });

  it('groups navigation for the shared shell', async () => {
    const { component } = await createComponent();

    expect(component.navigationGroups).toEqual([
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

  it('marks tha-spot as full-page mode', async () => {
    const { component } = await createComponent('/tha-spot');

    expect(component.isFullPageMode()).toBe(true);
  });

  it('treats login as an auth-only full-page route', async () => {
    const { component } = await createComponent('/login');

    expect(component.isAuthRoute()).toBe(true);
    expect(component.isFullPageMode()).toBe(true);
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

  it('treats studio as full-page on mobile but not on desktop', async () => {
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
    expect(component.isFullPageMode()).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
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
});
