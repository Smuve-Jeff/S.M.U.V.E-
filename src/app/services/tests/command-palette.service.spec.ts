import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CommandPaletteService } from '../command-palette.service';
import { UIService } from '../ui.service';
import { PlayerService } from '../player.service';
import { AiService } from '../ai.service';
import { NotificationService } from '../notification.service';

describe('CommandPaletteService', () => {
  let service: CommandPaletteService;
  let uiService: any;
  let playerService: any;
  let aiService: any;
  let notificationService: any;

  beforeEach(() => {
    uiService = {
      mainViewMode: signal('hub'),
      getViewConfigs: jest.fn().mockReturnValue([
        {
          mode: 'hub',
          label: 'HUB',
          description:
            'Coordinate releases, assets, and day-to-day executive moves.',
          icon: 'grid_view',
          category: 'CORE',
        },
      ]),
      getRecentViewConfigs: jest.fn().mockReturnValue([]),
      getPinnedViewConfigs: jest.fn().mockReturnValue([]),
      navigateToView: jest.fn(),
      togglePerformanceMode: jest.fn(),
      toggleTheme: jest.fn(),
      toggleChatbot: jest.fn(),
      toggleScanlines: jest.fn(),
      performanceMode: signal(false),
    };
    playerService = {
      togglePlay: jest.fn(),
    };
    aiService = {
      performExecutiveAudit: jest.fn(),
    };
    notificationService = {
      show: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CommandPaletteService,
        { provide: UIService, useValue: uiService },
        { provide: PlayerService, useValue: playerService },
        { provide: AiService, useValue: aiService },
        { provide: NotificationService, useValue: notificationService },
      ],
    });

    service = TestBed.inject(CommandPaletteService);
  });

  it('should open the palette with Ctrl+K', () => {
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    service.handleGlobalKey(event);
    expect(service.isOpen()).toBe(true);
  });

  it('should filter actions by query', () => {
    service.updateQuery('hub');
    const ids = service.filteredActions().map((action) => action.id);
    expect(ids).toContain('nav-hub');
  });

  it('uses module descriptions in navigation actions', () => {
    const action = service
      .actions()
      .find((candidate) => candidate.id === 'nav-hub');

    expect(action?.description).toBe(
      'Coordinate releases, assets, and day-to-day executive moves.'
    );
  });

  it('should execute actions and close the palette', () => {
    const action = service
      .actions()
      .find((candidate) => candidate.id === 'toggle-theme');
    expect(action).toBeTruthy();
    service.openPalette();
    service.runAction(action!);
    expect(uiService.toggleTheme).toHaveBeenCalled();
    expect(service.isOpen()).toBe(false);
  });
});
