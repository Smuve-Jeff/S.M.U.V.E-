import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CommandPaletteService } from '../command-palette.service';
import { UIService } from '../ui.service';
import { DeckService } from '../deck.service';
import { AiService } from '../ai.service';
import { NotificationService } from '../notification.service';
import { StudioOrchestrationService } from '../studio-orchestration.service';

describe('CommandPaletteService', () => {
  let service: CommandPaletteService;
  let uiService: any;
  let deckService: any;
  let aiService: any;
  let notificationService: any;
  let orchestrationService: any;

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
    deckService = {
      togglePlay: jest.fn(),
    };
    aiService = {
      performExecutiveAudit: jest.fn(),
    };
    notificationService = {
      show: jest.fn(),
    };
    orchestrationService = {
      paletteActions: signal([
        {
          id: 'studio-preview-ai',
          label: 'Preview AI Fix',
          description:
            'Preview the primary AI fix for the current studio view.',
          category: 'Studio AI',
          keywords: ['studio', 'ai', 'preview'],
          run: jest.fn(),
        },
      ]),
    };

    TestBed.configureTestingModule({
      providers: [
        CommandPaletteService,
        { provide: UIService, useValue: uiService },
        { provide: DeckService, useValue: deckService },
        { provide: AiService, useValue: aiService },
        { provide: NotificationService, useValue: notificationService },
        { provide: StudioOrchestrationService, useValue: orchestrationService },
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

  it('includes orchestration-driven studio actions', () => {
    const action = service
      .actions()
      .find((candidate) => candidate.id === 'studio-preview-ai');

    expect(action?.label).toBe('Preview AI Fix');
    action?.run();
    expect(orchestrationService.paletteActions()[0].run).toHaveBeenCalled();
  });

  it('executeCommandById runs the matching action by id', () => {
    service.openPalette();
    const executed = service.executeCommandById('toggle-playback');
    expect(executed).toBe(true);
    expect(deckService.togglePlay).toHaveBeenCalledWith('A');
    expect(service.isOpen()).toBe(false);
  });

  it('executeCommandById reports false for unknown ids', () => {
    expect(service.executeCommandById('no-such-command')).toBe(false);
    expect(deckService.togglePlay).not.toHaveBeenCalled();
  });

  describe('Space ownership', () => {
    /** A keydown whose target is a real element, so `event.target` is set. */
    const pressOn = (tag: string, key = ' ') => {
      const el = document.createElement(tag);
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      return event;
    };

    it('still toggles playback when no control owns the key', () => {
      const event = pressOn('div');
      expect(service.handleGlobalKey(event)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(deckService.togglePlay).toHaveBeenCalledWith('A');
    });

    it.each(['button', 'a', 'select'])(
      'yields Space to a focused <%s> so it activates itself',
      (tag) => {
        const event = pressOn(tag);
        expect(service.handleGlobalKey(event)).toBe(false);
        expect(event.defaultPrevented).toBe(false);
        expect(deckService.togglePlay).not.toHaveBeenCalled();
      }
    );

    it('yields Space to a tabindex or role=button surface', () => {
      const tabbed = document.createElement('div');
      tabbed.setAttribute('tabindex', '0');
      const first = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      });
      tabbed.dispatchEvent(first);
      expect(service.handleGlobalKey(first)).toBe(false);

      const roleButton = document.createElement('div');
      roleButton.setAttribute('role', 'button');
      const second = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      });
      roleButton.dispatchEvent(second);
      expect(service.handleGlobalKey(second)).toBe(false);

      expect(deckService.togglePlay).not.toHaveBeenCalled();
    });

    it('yields Space to a handler that already claimed the key', () => {
      const event = pressOn('div');
      event.preventDefault();
      expect(service.handleGlobalKey(event)).toBe(false);
      expect(deckService.togglePlay).not.toHaveBeenCalled();
    });
  });
});
