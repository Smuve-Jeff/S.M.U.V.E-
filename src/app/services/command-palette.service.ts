import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { UIService } from './ui.service';
import { PlayerService } from './player.service';
import { AiService } from './ai.service';
import { NotificationService } from './notification.service';
import { MainViewMode } from './user-context.service';

export interface CommandPaletteAction {
  id: string;
  label: string;
  description: string;
  category: string;
  keywords?: string[];
  shortcut?: string;
  context?: MainViewMode[];
  keepOpen?: boolean;
  run: () => void;
}

export interface InteractionTip {
  id: string;
  title: string;
  description: string;
  modes?: MainViewMode[];
}

const INTERACTION_TIPS: InteractionTip[] = [
  {
    id: 'global-palette',
    title: 'Command Palette',
    description:
      'Press Ctrl + K (or ⌘ + K) to launch rapid actions across every module.',
  },
  {
    id: 'global-guide',
    title: 'Interaction Guide',
    description: 'Press ? to reveal contextual controls for the active view.',
  },
  {
    id: 'global-playback',
    title: 'Playback Control',
    description: 'Tap Space to toggle the master playback stream.',
  },
  {
    id: 'studio-dj',
    title: 'DJ Deck Control',
    description:
      'Drag platters to scratch, tap BPM, and blend with the crossfader.',
    modes: ['studio', 'dj'],
  },
  {
    id: 'studio-piano-roll',
    title: 'Piano Roll Precision',
    description:
      'Click the grid to add notes, Shift + click to multi-select, and use chord mode for stacks.',
    modes: ['piano-roll', 'studio'],
  },
  {
    id: 'vocal-suite-pipeline',
    title: 'Vocal Suite Pipeline',
    description:
      'Advance through setup → record → edit → master to refine vocal takes.',
    modes: ['vocal-suite'],
  },
  {
    id: 'tha-spot-floor',
    title: 'Tha Spot Floor',
    description: 'Drag the isometric floor to reposition the command deck.',
    modes: ['tha-spot'],
  },
  {
    id: 'strategy-terminal',
    title: 'Strategy Terminal',
    description: 'Issue commands in the terminal to trigger AI directives.',
    modes: ['strategy', 'career'],
  },
];

@Injectable({
  providedIn: 'root',
})
export class CommandPaletteService {
  private uiService = inject(UIService);
  private playerService = inject(PlayerService);
  private aiService = inject(AiService);
  private notificationService = inject(NotificationService);

  isOpen = signal(false);
  showGuide = signal(false);
  query = signal('');
  activeIndex = signal(0);

  actions = computed<CommandPaletteAction[]>(() => {
    const navigationActions = this.uiService.getViewConfigs().map((view) => ({
      id: `nav-${view.mode}`,
      label: `Open ${view.label}`,
      description: `Jump to ${view.label} operations`,
      category: view.category,
      keywords: [view.mode, view.label.toLowerCase()],
      run: () => this.uiService.navigateToView(view.mode),
    }));

    return [
      {
        id: 'toggle-playback',
        label: 'Toggle Playback',
        description: 'Play or pause the master deck.',
        category: 'Playback',
        shortcut: 'Space',
        run: () => {
          this.playerService.togglePlay();
          this.notificationService.show('Playback Toggled', 'info', 1800);
        },
      },
      {
        id: 'executive-audit',
        label: 'Executive AI Audit',
        description: 'Trigger a full executive AI audit.',
        category: 'AI',
        shortcut: 'Alt + A',
        run: () => {
          this.aiService.performExecutiveAudit();
          this.notificationService.show('Manual Audit Triggered', 'info', 2000);
        },
      },
      {
        id: 'toggle-performance',
        label: 'Toggle Performance Mode',
        description: 'Switch high-voltage performance mode on/off.',
        category: 'System',
        shortcut: 'Alt + P',
        run: () => {
          this.uiService.togglePerformanceMode();
          this.notificationService.show(
            this.uiService.performanceMode()
              ? 'Performance Mode Active'
              : 'Performance Mode Disabled',
            'info',
            2000
          );
        },
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Theme',
        description: 'Cycle between Light and Dark command themes.',
        category: 'System',
        shortcut: 'Alt + T',
        run: () => {
          this.uiService.toggleTheme();
          this.notificationService.show(
            'Theme Shift Deployed',
            'success',
            2000
          );
        },
      },
      {
        id: 'toggle-chatbot',
        label: 'Toggle Neural Advisor',
        description: 'Show or hide the AI assistant.',
        category: 'System',
        shortcut: 'Alt + C',
        run: () => {
          this.uiService.toggleChatbot();
          this.notificationService.show(
            'Advisor Visibility Updated',
            'info',
            1800
          );
        },
      },
      {
        id: 'toggle-scanlines',
        label: 'Toggle Scanlines',
        description: 'Enable or disable the scanline overlay.',
        category: 'System',
        shortcut: 'Alt + S',
        run: () => {
          this.uiService.toggleScanlines();
          this.notificationService.show(
            'Scanline Overlay Updated',
            'info',
            1800
          );
        },
      },
      {
        id: 'open-guide',
        label: 'Interaction Guide',
        description:
          'Reveal all interactive capabilities for the current view.',
        category: 'System',
        shortcut: '?',
        keepOpen: true,
        run: () => this.openGuide(),
      },
      ...navigationActions,
    ];
  });

  filteredActions = computed(() => {
    const query = this.query().trim().toLowerCase();
    const mode = this.uiService.mainViewMode();
    return this.actions().filter((action) => {
      if (action.context && !action.context.includes(mode)) return false;
      if (!query) return true;
      const haystack = [
        action.label,
        action.description,
        action.category,
        ...(action.keywords || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  activeTips = computed(() => {
    const mode = this.uiService.mainViewMode();
    return INTERACTION_TIPS.filter(
      (tip) => !tip.modes || tip.modes.includes(mode)
    );
  });

  constructor() {
    effect(() => {
      const count = this.filteredActions().length;
      if (count === 0) {
        this.activeIndex.set(0);
        return;
      }
      if (this.activeIndex() >= count) {
        this.activeIndex.set(0);
      }
    });
  }

  openPalette() {
    this.isOpen.set(true);
    this.showGuide.set(false);
    this.query.set('');
    this.activeIndex.set(0);
  }

  openGuide() {
    this.isOpen.set(true);
    this.showGuide.set(true);
    this.query.set('');
    this.activeIndex.set(0);
  }

  togglePalette() {
    if (this.isOpen()) {
      this.closePalette();
    } else {
      this.openPalette();
    }
  }

  toggleGuide() {
    if (!this.isOpen()) {
      this.openGuide();
      return;
    }
    this.showGuide.update((value) => !value);
  }

  closePalette() {
    this.isOpen.set(false);
    this.showGuide.set(false);
    this.query.set('');
    this.activeIndex.set(0);
  }

  updateQuery(value: string) {
    this.query.set(value);
    this.activeIndex.set(0);
    this.showGuide.set(false);
  }

  setActiveIndex(index: number) {
    const max = this.filteredActions().length - 1;
    const next = Math.max(0, Math.min(index, max));
    this.activeIndex.set(next);
  }

  moveActiveIndex(delta: number) {
    const actions = this.filteredActions();
    if (!actions.length) return;
    const next = (this.activeIndex() + delta + actions.length) % actions.length;
    this.activeIndex.set(next);
  }

  runAction(action: CommandPaletteAction) {
    action.run();
    if (!action.keepOpen) {
      this.closePalette();
    }
  }

  private triggerById(id: string) {
    const action = this.actions().find((candidate) => candidate.id === id);
    if (action) {
      this.runAction(action);
    }
  }

  handleGlobalKey(event: KeyboardEvent): boolean {
    const key = event.key;

    if (this.isOpen()) {
      if (key === 'Escape') {
        event.preventDefault();
        this.closePalette();
        return true;
      }
      if (!this.showGuide()) {
        if (key === 'ArrowDown') {
          event.preventDefault();
          this.moveActiveIndex(1);
          return true;
        }
        if (key === 'ArrowUp') {
          event.preventDefault();
          this.moveActiveIndex(-1);
          return true;
        }
        if (key === 'Enter') {
          event.preventDefault();
          const action = this.filteredActions()[this.activeIndex()];
          if (action) {
            this.runAction(action);
          }
          return true;
        }
      }
    }

    const lowerKey = key.toLowerCase();
    const isEditable = this.isEditableTarget(event.target);
    const allowInInput = (event.ctrlKey || event.metaKey) && lowerKey === 'k';

    if (isEditable && !allowInInput) {
      return false;
    }

    if ((event.ctrlKey || event.metaKey) && lowerKey === 'k') {
      event.preventDefault();
      this.togglePalette();
      return true;
    }

    if (key === '?') {
      event.preventDefault();
      this.openGuide();
      return true;
    }

    if (key === ' ') {
      event.preventDefault();
      this.triggerById('toggle-playback');
      return true;
    }

    if (lowerKey === 'a' && event.altKey) {
      event.preventDefault();
      this.triggerById('executive-audit');
      return true;
    }

    if (lowerKey === 'p' && event.altKey) {
      event.preventDefault();
      this.triggerById('toggle-performance');
      return true;
    }

    if (lowerKey === 't' && event.altKey) {
      event.preventDefault();
      this.triggerById('toggle-theme');
      return true;
    }

    if (lowerKey === 'c' && event.altKey) {
      event.preventDefault();
      this.triggerById('toggle-chatbot');
      return true;
    }

    if (lowerKey === 's' && event.altKey) {
      event.preventDefault();
      this.triggerById('toggle-scanlines');
      return true;
    }

    return false;
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT'
    );
  }
}
