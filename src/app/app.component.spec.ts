import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

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

    return { component, uiService, commandPalette };
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
});
