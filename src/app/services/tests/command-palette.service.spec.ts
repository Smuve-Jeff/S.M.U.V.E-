import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommandPaletteService } from '../command-palette.service';
import { UIService } from '../ui.service';
import { DeckService } from '../deck.service';
import { AiService } from '../ai.service';
import { NotificationService } from '../notification.service';

describe('CommandPaletteService', () => {
  let service: CommandPaletteService;
  let uiService: any;
  let deckService: any;
  let aiService: any;
  let notificationService: any;
  let router: { url: string; navigate: jest.Mock };

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
    router = {
      url: '/lyric-editor',
      navigate: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CommandPaletteService,
        { provide: UIService, useValue: uiService },
        { provide: DeckService, useValue: deckService },
        { provide: AiService, useValue: aiService },
        { provide: NotificationService, useValue: notificationService },
        { provide: Router, useValue: router },
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

  it('opens the interaction guide from the ? shortcut', () => {
    const event = new KeyboardEvent('keydown', {
      key: '?',
      cancelable: true,
    });

    expect(service.handleGlobalKey(event)).toBe(true);
    expect(service.showGuide()).toBe(true);
  });

  it('offers a route-aware Teach This Screen command', () => {
    const action = service
      .actions()
      .find((candidate) => candidate.id === 'teach-this-screen');

    expect(action?.label).toBe('Teach This Screen');
    expect(action?.category).toBe('Masterclass');
    expect(action?.shortcut).toBe('Alt + L');
    expect(action?.keywords).toContain('lesson');
  });

  it('offers one discovery command per Academy career discipline', () => {
    const actions = service.actions();
    for (const program of [
      'acting',
      'directing',
      'music-business-legal',
      'marketing-promotion',
      'entertainment-industry',
    ]) {
      const action = actions.find(
        (candidate) => candidate.id === `learn-${program}`
      );
      expect(action?.category).toBe('Music Academy');
      expect(action?.keywords).toContain('academy');
    }

    service.updateQuery('marketing');
    expect(
      service.filteredActions().map((action) => action.id)
    ).toContain('learn-marketing-promotion');
  });

  it('deep links an Academy discipline command to its program', () => {
    service.openPalette();

    expect(service.executeCommandById('learn-acting')).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/academy'], {
      queryParams: { program: 'acting' },
    });
    expect(service.isOpen()).toBe(false);
  });

  it('teaches the current screen from the Alt+L shortcut', () => {
    router.url = '/lyric-editor';
    const event = new KeyboardEvent('keydown', {
      key: 'l',
      altKey: true,
      cancelable: true,
    });

    expect(service.handleGlobalKey(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/masterclass'],
      expect.objectContaining({
        queryParams: expect.objectContaining({
          guide: expect.any(String),
          lesson: expect.any(String),
        }),
      })
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

  it('includes actions registered by the Studio orchestration layer', () => {
    const run = jest.fn();
    service.setExtensionActions('studio-orchestration', [
      {
        id: 'studio-preview-ai',
        label: 'Preview AI Fix',
        description:
          'Preview the primary AI fix for the current studio view.',
        category: 'Studio AI',
        keywords: ['studio', 'ai', 'preview'],
        run,
      },
    ]);

    const action = service
      .actions()
      .find((candidate) => candidate.id === 'studio-preview-ai');

    expect(action?.label).toBe('Preview AI Fix');
    action?.run();
    expect(run).toHaveBeenCalled();
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
  it('replaces reactive extension actions without duplicate or stale commands', () => {
    const run = jest.fn();
    service.setExtensionActions('coach', [{ id: 'coach-old', label: 'Old', description: '', category: 'Artist', run }]);
    service.setExtensionActions('coach', [{ id: 'coach-new', label: 'New', description: '', category: 'Artist', run }]);
    expect(service.actions().filter((a) => a.id.startsWith('coach-')).map((a) => a.id)).toEqual(['coach-new']);
    expect(service.executeCommandById('coach-new')).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

});
