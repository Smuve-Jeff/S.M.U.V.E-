import { Injectable, Injector, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UIService } from './ui.service';
import { DeckService } from './deck.service';
import { NotificationService } from './notification.service';
import { MainViewMode } from './user-context.service';
import {
  GLOBAL_KEYBOARD_SHORTCUT_NOTE,
  GLOBAL_KEYBOARD_SHORTCUTS,
  GLOBAL_SHORTCUT_KEYS,
} from './global-keyboard-shortcuts';
import { masterclassRouteTarget } from '../studio/studio-guide/masterclass-route-guide';
import type { CompositionCoreService } from '../composer/composition-core.service';
import type { ComponentKind } from '../composer/composer.types';

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

/** Steps an artist reaches for mid-session, written straight from their genre. */
const COMPOSE_ACTIONS: Array<{
  component: ComponentKind;
  label: string;
  description: string;
  keywords: string[];
}> = [
  {
    component: 'full-song',
    label: 'Compose: Complete Song',
    description: 'Write a full genre-locked arrangement from the committed artist profile.',
    keywords: ['full song', 'instrumental', 'beat', 'arrangement'],
  },
  {
    component: 'bassline',
    label: 'Compose: Bassline',
    description: 'Write a bassline in the profile genre, key and pocket.',
    keywords: ['bass', '808', 'low end'],
  },
  {
    component: 'melody',
    label: 'Compose: Melody',
    description: 'Write a lead melody with motif development in the profile genre.',
    keywords: ['hook', 'topline', 'lead'],
  },
  {
    component: 'drums',
    label: 'Compose: Drum Pattern',
    description: 'Build a full kit pattern from the genre groove atlas.',
    keywords: ['drums', 'groove', 'beat'],
  },
  {
    component: 'chords',
    label: 'Compose: Chord Progression',
    description: 'Write a diatonic progression and comping part.',
    keywords: ['chords', 'harmony', 'progression'],
  },
  {
    component: 'kick',
    label: 'Compose: Kick Pattern',
    description: 'Write the kick foundation for the profile genre.',
    keywords: ['kick', '808', 'low end'],
  },
  {
    component: 'loop',
    label: 'Compose: 8-Bar Loop',
    description: 'Write a releasable loop pass in the profile genre.',
    keywords: ['loop', '8 bar', 'idea'],
  },
  {
    component: 'transition',
    label: 'Compose: Transition',
    description: 'Write a riser, fill or turnaround into the next section.',
    keywords: ['transition', 'riser', 'fill'],
  },
];

/** Direct links into each career discipline of the Music Academy. */
const ACADEMY_PROGRAM_ACTIONS: Array<{
  program: string;
  label: string;
  description: string;
  keywords: string[];
}> = [
  {
    program: 'acting',
    label: 'Learn: Acting',
    description: 'Open the Academy acting program: objectives, voice, camera truth and auditions.',
    keywords: ['acting', 'actor', 'audition', 'self tape', 'monologue', 'scene'],
  },
  {
    program: 'directing',
    label: 'Learn: Directing',
    description: 'Open the Academy directing program: shot language, coverage and leading a shoot.',
    keywords: ['directing', 'director', 'film', 'video', 'shot', 'coverage', 'music video'],
  },
  {
    program: 'music-business-legal',
    label: 'Learn: Music Business & Legal',
    description: 'Open the Academy business program: ownership, splits, contracts and release money.',
    keywords: ['business', 'legal', 'splits', 'publishing', 'contracts', 'royalties', 'rights'],
  },
  {
    program: 'marketing-promotion',
    label: 'Learn: Marketing & Promotion',
    description: 'Open the Academy marketing program: positioning, hooks, rollouts and measurement.',
    keywords: ['marketing', 'promotion', 'audience', 'hooks', 'release', 'campaign', 'growth'],
  },
  {
    program: 'entertainment-industry',
    label: 'Learn: Entertainment Industry Foundations',
    description: 'Open the Academy industry program: roles, revenue paths and career design.',
    keywords: ['industry', 'entertainment', 'career', 'revenue', 'team', 'conduct'],
  },
];

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
  executeCommandById(id: string): boolean {
    const action = this.actions().find((candidate) => candidate.id === id);
    if (!action) {
      return false;
    }
    this.runAction(action);
    return true;
  }
  private uiService = inject(UIService);
  private deckService = inject(DeckService);
  private notificationService = inject(NotificationService);
  private injector = inject(Injector);
  /** Optional so isolated command-palette tests do not need a router. */
  private readonly router = inject(Router, { optional: true });

  private async performExecutiveAudit(): Promise<void> {
    try {
      const { AiService } = await import('./ai.service');
      this.injector.get(AiService).performExecutiveAudit();
      this.notificationService.show('Manual Audit Triggered', 'info', 2000);
    } catch {
      this.notificationService.show('AI audit is unavailable in this build.', 'warning', 2200);
    }
  }

  /**
   * Writes a genre-locked pass, then puts the artist in front of it. The
   * composition engine is imported on demand so its atlas stays out of the
   * initial bundle.
   */
  private async composeStep(component: ComponentKind): Promise<void> {
    let core: CompositionCoreService | null = null;
    try {
      const module = await import('../composer/composition-core.service');
      core = this.injector.get(module.CompositionCoreService, null);
    } catch {
      core = null;
    }
    if (!core) {
      this.notificationService.show('Composition Core is offline in this build.', 'warning', 2600);
      return;
    }
    const gate = core.gate();
    if (!gate.ready) {
      const blocker = gate.blockers[0]?.label ?? 'complete your artist profile';
      this.notificationService.show(`Composition locked — ${blocker}.`, 'warning', 3200);
      this.uiService.navigateToView('profile');
      return;
    }
    core.ensureGenreSelected();
    const composition = core.generateStep(component);
    if (!composition) {
      this.notificationService.show(core.error() ?? 'Composition failed to generate.', 'warning', 3200);
      return;
    }
    this.notificationService.show(
      `Composed “${composition.title}” — ${composition.genreLabel} at ${composition.bpm} BPM.`,
      'success',
      2400
    );
    this.uiService.navigateToView('composer');
  }

  isOpen = signal(false);
  showGuide = signal(false);
  keyboardShortcuts = GLOBAL_KEYBOARD_SHORTCUTS;
  keyboardShortcutNote = GLOBAL_KEYBOARD_SHORTCUT_NOTE;
  query = signal('');
  activeIndex = signal(0);

  private extensionActions = signal<Record<string, CommandPaletteAction[]>>({});

  setExtensionActions(source: string, actions: CommandPaletteAction[]): void {
    this.extensionActions.update((current) => ({ ...current, [source]: actions }));
  }

  actions = computed<CommandPaletteAction[]>(() => {
    const navigationActions = this.uiService.getViewConfigs().map((view) => ({
      id: `nav-${view.mode}`,
      label: `Open ${view.label}`,
      description: view.description,
      category: view.category,
      keywords: [
        view.mode,
        view.label.toLowerCase(),
        view.description.toLowerCase(),
      ],
      run: () => this.uiService.navigateToView(view.mode),
    }));
    const recentActions = this.uiService.getRecentViewConfigs().map((view) => ({
      id: `recent-${view.mode}`,
      label: `Resume ${view.label}`,
      description: `Return to ${view.label.toLowerCase()} from your recent workflow trail.`,
      category: 'Recent',
      keywords: [view.mode, 'recent', 'resume'],
      run: () => this.uiService.navigateToView(view.mode),
    }));
    const pinnedActions = this.uiService.getPinnedViewConfigs().map((view) => ({
      id: `pinned-${view.mode}`,
      label: `Pinned ${view.label}`,
      description: `Jump back to pinned workspace ${view.label}.`,
      category: 'Pinned',
      keywords: [view.mode, 'pinned', 'favorite'],
      run: () => this.uiService.navigateToView(view.mode),
    }));

    return [
      {
        id: 'toggle-playback',
        label: 'Toggle Playback',
        description: 'Play or pause the master deck.',
        category: 'Playback',
        shortcut: GLOBAL_SHORTCUT_KEYS.playback,
        run: () => {
          this.deckService.togglePlay('A');
          this.notificationService.show('Playback Toggled', 'info', 1800);
        },
      },
      {
        id: 'executive-audit',
        label: 'Executive AI Audit',
        description: 'Trigger a full executive AI audit.',
        category: 'AI',
        shortcut: GLOBAL_SHORTCUT_KEYS.executiveAudit,
        run: () => void this.performExecutiveAudit(),
      },
      {
        id: 'toggle-performance',
        label: 'Toggle Performance Mode',
        description: 'Switch high-voltage performance mode on/off.',
        category: 'System',
        shortcut: GLOBAL_SHORTCUT_KEYS.performanceMode,
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
        shortcut: GLOBAL_SHORTCUT_KEYS.theme,
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
        shortcut: GLOBAL_SHORTCUT_KEYS.advisor,
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
        shortcut: GLOBAL_SHORTCUT_KEYS.scanlines,
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
        id: 'teach-this-screen',
        label: 'Teach This Screen',
        description:
          'Open the Masterclass lesson for the workspace or Studio surface in front of you.',
        category: 'Masterclass',
        shortcut: GLOBAL_SHORTCUT_KEYS.teachScreen,
        keywords: [
          'teach',
          'learn',
          'masterclass',
          'tutorial',
          'lesson',
          'help',
          'screen',
          'guide',
        ],
        run: () => this.teachScreen(),
      },
      {
        id: 'open-guide',
        label: 'Interaction Guide',
        description:
          'Reveal all interactive capabilities for the current view.',
        category: 'System',
        shortcut: GLOBAL_SHORTCUT_KEYS.interactionGuide,
        keepOpen: true,
        run: () => this.openGuide(),
      },
      ...COMPOSE_ACTIONS.map((action) => ({
        id: `compose-${action.component}`,
        label: action.label,
        description: action.description,
        category: 'Composition',
        keywords: ['compose', 'write', 'generate', 'song', 'score', ...action.keywords],
        run: () => this.composeStep(action.component),
      })),
      ...ACADEMY_PROGRAM_ACTIONS.map((action) => ({
        id: `learn-${action.program}`,
        label: action.label,
        description: action.description,
        category: 'Music Academy',
        keywords: ['academy', 'learn', 'lesson', 'program', action.program, ...action.keywords],
        run: () => this.openAcademyProgram(action.program, action.label),
      })),
      ...recentActions,
      ...pinnedActions,
      ...navigationActions,
      ...Object.values(this.extensionActions()).flat(),
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

  /** Deep link straight into one Academy discipline. */
  private openAcademyProgram(programId: string, label: string): void {
    if (!this.router) {
      this.notificationService.show(
        `${label} needs navigation, which is unavailable in this build.`,
        'warning',
        2200
      );
      return;
    }
    void this.router.navigate(['/academy'], {
      queryParams: { program: programId },
    });
  }

  /** Route-aware entry point shared by the command and the Alt+L shortcut. */
  private teachScreen(): void {
    const target = masterclassRouteTarget(this.router?.url ?? '');
    if (!target || !this.router) {
      this.notificationService.show(
        'The Masterclass is already open.',
        'info',
        2200
      );
      return;
    }

    void this.router.navigate(['/masterclass'], {
      queryParams: { guide: target.track, lesson: target.lessonId },
    });
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
      /*
       * Space belongs to whoever is actually holding it. Claiming it
       * unconditionally cancelled native activation app-wide — measured in
       * Chromium: pressing Space on a focused transport button left the
       * button unclicked while this handler started the Studio's master
       * playback off-screen. Two cases yield instead:
       *
       *  - a control that Space natively activates (button, link, select,
       *    [tabindex], role="button"), exactly as the Transport Bar and the
       *    S.M.U.V.E TV surface already yield;
       *  - a handler that already claimed the key and called preventDefault —
       *    the S.M.U.V.E TV surface toggles its own playback that way, and
       *    without this the Studio would start playing underneath it.
       *
       * Everywhere else the shortcut is unchanged.
       */
      if (event.defaultPrevented || this.ownsSpaceKey(event.target)) {
        return false;
      }
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

    if (lowerKey === 'l' && event.altKey) {
      event.preventDefault();
      this.triggerById('teach-this-screen');
      return true;
    }

    return false;
  }

  /**
   * True when the focused element activates itself with Space, so the
   * palette's Space shortcut must leave the key alone. Mirrors the guard the
   * Transport Bar uses for the same reason.
   */
  private ownsSpaceKey(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.tagName === 'SELECT' ||
      target.hasAttribute('tabindex') ||
      target.getAttribute('role') === 'button'
    );
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
