/**
 * Single source of truth for the shortcuts the application listens for
 * globally. Keep this list aligned with CommandPaletteService.handleGlobalKey.
 */
/** Platform note shown beside the reference in both help surfaces. */
export const GLOBAL_KEYBOARD_SHORTCUT_NOTE =
  'Ctrl = ⌘ · Alt = ⌥ on Mac · shortcuts pause while typing.';

export const GLOBAL_SHORTCUT_KEYS = {
  commandPalette: 'Ctrl / ⌘ + K',
  teachScreen: 'Alt + L',
  playback: 'Space',
  executiveAudit: 'Alt + A',
  performanceMode: 'Alt + P',
  theme: 'Alt + T',
  advisor: 'Alt + C',
  scanlines: 'Alt + S',
  interactionGuide: '?',
  closeOverlay: 'Esc',
} as const;

export interface GlobalKeyboardShortcut {
  id: string;
  keys: string;
  label: string;
  description: string;
}

export const GLOBAL_KEYBOARD_SHORTCUTS: readonly GlobalKeyboardShortcut[] = [
  {
    id: 'command-palette',
    keys: GLOBAL_SHORTCUT_KEYS.commandPalette,
    label: 'Command palette',
    description: 'Search every workspace, command, and action.',
  },
  {
    id: 'teach-this-screen',
    keys: GLOBAL_SHORTCUT_KEYS.teachScreen,
    label: 'Teach this screen',
    description: 'Open the Masterclass lesson for the screen you are on.',
  },
  {
    id: 'toggle-playback',
    keys: GLOBAL_SHORTCUT_KEYS.playback,
    label: 'Toggle playback',
    description:
      'Play or pause the master deck when a control is not focused.',
  },
  {
    id: 'executive-audit',
    keys: GLOBAL_SHORTCUT_KEYS.executiveAudit,
    label: 'Executive AI audit',
    description: 'Run the executive AI audit.',
  },
  {
    id: 'performance-mode',
    keys: GLOBAL_SHORTCUT_KEYS.performanceMode,
    label: 'Performance mode',
    description: 'Toggle performance mode.',
  },
  {
    id: 'theme',
    keys: GLOBAL_SHORTCUT_KEYS.theme,
    label: 'Theme',
    description: 'Cycle the command theme.',
  },
  {
    id: 'neural-advisor',
    keys: GLOBAL_SHORTCUT_KEYS.advisor,
    label: 'Neural advisor',
    description: 'Show or hide the Neural Advisor.',
  },
  {
    id: 'scanlines',
    keys: GLOBAL_SHORTCUT_KEYS.scanlines,
    label: 'Scanlines',
    description: 'Toggle the scanline overlay.',
  },
  {
    id: 'interaction-guide',
    keys: GLOBAL_SHORTCUT_KEYS.interactionGuide,
    label: 'Interaction guide',
    description: 'Open the interaction guide for the current workspace.',
  },
  {
    id: 'close-overlay',
    keys: GLOBAL_SHORTCUT_KEYS.closeOverlay,
    label: 'Close overlay',
    description: 'Dismiss the active palette, guide, drawer, or advisor.',
  },
];
