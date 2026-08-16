import {
  Injectable,
  signal,
  inject,
  effect,
  computed,
  DestroyRef,
} from '@angular/core';
import { Router } from '@angular/router';

import { MainViewMode, AppTheme } from './user-context.service';
import { UserProfileService } from './user-profile.service';
import {
  ViewConfig,
  WorkspaceConfig,
  WORKSPACE_INDEX,
  WORKSPACE_REGISTRY,
} from './workspace-registry';

const THEMES: AppTheme[] = [
  {
    name: 'Dark',
    primary: '#10b981',
    accent: '#38bdf8',
    neutral: '#020617',
    purple: '#6366f1',
    red: '#f43f5e',
    blue: '#3b82f6',
  },
  {
    name: 'Light',
    primary: '#10b981',
    accent: '#f59e0b',
    neutral: '#f8fafc',
    purple: '#6366f1',
    red: '#ef4444',
    blue: '#3b82f6',
  },
];

const MAX_RECENT_WORKSPACES = 6;
const MAX_PINNED_WORKSPACES = 6;

@Injectable({
  providedIn: 'root',
})
export class UIService {
  private router = inject(Router);
  private profileService = inject(UserProfileService);
  private destroyRef = inject(DestroyRef);
  private readonly pinnedKey = 'smuve_pinned_workspaces';
  private readonly recentKey = 'smuve_recent_workspaces';
  private readonly handleOnline = () => this.updateOnlineStatus(true);
  private readonly handleOffline = () => this.updateOnlineStatus(false);
  private readonly handleResize = () => this.applyBreakpoints();

  mainViewMode = signal<MainViewMode>('hub');
  activeTheme = signal<AppTheme>(THEMES[0]);
  showEqPanel = signal(false);
  showChatbot = signal(false);
  isChatbotOpen = signal(false);
  visualIntensity = signal(0);
  isCompactMobile = signal(false);
  /** Portrait tablets (769–1024px, taller than wide) get the mobile shell. */
  isPortraitTablet = signal(false);
  holographicMode = signal(false);

  isOnline = signal(true);
  performanceMode = signal(false);
  showScanlines = signal(false);
  autoPianoRoll = signal(false);

  /**
   * Studio beginner mode (simplified controls + tips). Cross-app signal:
   * the Studio writes it here, the Hub and mobile quick-start lanes read
   * it, and the profile is the durable store (localStorage mirrors it for
   * pre-auth sessions). Defaults to ON for new artists.
   */
  beginnerMode = signal<boolean>(this.readBeginnerMode());
  recentViewModes = signal<MainViewMode[]>(this.readModes(this.recentKey));
  pinnedViewModes = signal<MainViewMode[]>(this.readModes(this.pinnedKey));
  subtleGlow = signal<string | null>(null);

  // Derived signals for UI state
  isLowPower = computed(() => this.performanceMode());
  isUplinkActive = computed(() => this.isOnline());
  /** Phones + portrait tablets use the bottom nav / drawer shell. */
  showMobileNav = computed(
    () => this.isCompactMobile() || this.isPortraitTablet()
  );

  private viewConfigs: ViewConfig[] = WORKSPACE_REGISTRY.filter(
    (workspace) => !workspace.hidden && !workspace.aliasOf
  );

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline.set(navigator.onLine);
      this.applyBreakpoints();
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
      });

      effect(() => {
        const profile = this.profileService.profile();
        if (profile && profile.settings) {
          const settings = profile.settings.ui;
          this.performanceMode.set(settings.performanceMode || false);
          this.showScanlines.set(settings.showScanlines || false);
          this.autoPianoRoll.set(
            settings.autoPianoRoll !== undefined
              ? settings.autoPianoRoll
              : false
          );
          if (settings.beginnerMode !== undefined) {
            this.beginnerMode.set(settings.beginnerMode);
          }
          this.setTheme(settings.theme || 'Dark');
        }
      });

      effect(() => {
        const isPerf = this.performanceMode();
        if (isPerf) {
          document.body.classList.add('perf-mode-active');
        } else {
          document.body.classList.remove('perf-mode-active');
        }
      });

      effect(() => {
        const theme = this.activeTheme();
        if (theme.name === 'Dark') {
          document.documentElement.classList.add('dark-mode');
        } else {
          document.documentElement.classList.remove('dark-mode');
        }
      });
      effect(() => {
        const glow = this.subtleGlow();
        if (typeof document !== 'undefined') {
          if (glow) {
            document.documentElement.style.setProperty('--accent-glow', glow);
            document.body.classList.add('glow-active');
          } else {
            document.documentElement.style.removeProperty('--accent-glow');
            document.body.classList.remove('glow-active');
          }
        }
      });
    }
  }

  togglePerformanceMode() {
    const newVal = !this.performanceMode();
    this.updateSetting('performanceMode', newVal);
  }

  /** Set Studio beginner mode and persist it across the app (profile +
   *  localStorage mirror for pre-auth sessions). */
  setBeginnerMode(value: boolean) {
    this.beginnerMode.set(value);
    try {
      localStorage.setItem('smuve_beginner_mode', String(value));
    } catch {
      /* locked storage — degrade silently */
    }
    this.updateSetting('beginnerMode', value);
  }

  private readBeginnerMode(): boolean {
    if (typeof localStorage === 'undefined') return true;
    try {
      return localStorage.getItem('smuve_beginner_mode') !== 'false';
    } catch {
      return true;
    }
  }

  toggleHolographicMode() {
    this.holographicMode.update((v) => !v);
  }

  toggleTheme() {
    const nextTheme = this.activeTheme().name === 'Light' ? 'Dark' : 'Light';
    this.updateSetting('theme', nextTheme);
  }

  toggleAutoPianoRoll() {
    const nextValue = !this.autoPianoRoll();
    this.updateSetting('autoPianoRoll', nextValue);
  }

  toggleScanlines() {
    const nextValue = !this.showScanlines();
    this.updateSetting('showScanlines', nextValue);
  }

  setSubtleGlow(color: string | null) {
    this.subtleGlow.set(color);
  }

  private updateSetting(key: string, value: any) {
    const currentProfile = this.profileService.profile();
    if (!currentProfile) return;

    this.profileService.updateProfile({
      ...currentProfile,
      settings: {
        ...currentProfile.settings,
        ui: { ...currentProfile.settings.ui, [key]: value },
      },
    });
  }

  private updateOnlineStatus(status: boolean) {
    this.isOnline.set(status);
  }

  /**
   * Responsive tiering:
   *  - ≤768px → phone (compact shell)
   *  - 769–1024px in portrait → tablet (mobile nav/drawer, desktop canvas)
   *  - everything else → desktop shell
   */
  private applyBreakpoints(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.isCompactMobile.set(width <= 768);
    this.isPortraitTablet.set(width > 768 && width <= 1024 && height > width);
  }

  private readModes(key: string): MainViewMode[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as MainViewMode[];
      return parsed.filter((mode) => !!WORKSPACE_INDEX.get(mode));
    } catch {
      return [];
    }
  }

  private writeModes(key: string, modes: MainViewMode[]): void {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(key, JSON.stringify(modes));
  }

  normalizeMode(mode: MainViewMode): MainViewMode {
    const workspace = WORKSPACE_INDEX.get(mode);
    return workspace?.aliasOf ?? mode;
  }

  getViewConfigs(): ViewConfig[] {
    return [...this.viewConfigs];
  }

  getViewModes(): MainViewMode[] {
    return WORKSPACE_REGISTRY.map((workspace) => workspace.mode);
  }

  getViewConfig(mode: MainViewMode): WorkspaceConfig | undefined {
    return WORKSPACE_INDEX.get(this.normalizeMode(mode));
  }

  getViewLabel(mode: MainViewMode): string {
    const fallback = mode
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return this.getViewConfig(mode)?.label ?? fallback;
  }

  getViewDescription(mode: MainViewMode): string {
    return (
      this.getViewConfig(mode)?.description ??
      'Access this S.M.U.V.E. control surface.'
    );
  }

  navigateToView(mode: MainViewMode) {
    const normalizedMode = this.normalizeMode(mode);
    const workspace = this.getViewConfig(normalizedMode);
    this.mainViewMode.set(normalizedMode);
    this.recordRecentView(normalizedMode);
    this.router.navigateByUrl(workspace?.routePath || '/' + normalizedMode);
  }

  setActiveViewFromRoute(mode: MainViewMode) {
    const normalizedMode = this.normalizeMode(mode);
    this.mainViewMode.set(normalizedMode);
    this.recordRecentView(normalizedMode);
  }

  recordRecentView(mode: MainViewMode): void {
    const workspace = this.getViewConfig(mode);
    if (!workspace || workspace.mode === 'login') {
      return;
    }

    this.recentViewModes.update((current) => {
      const next = [
        workspace.mode,
        ...current.filter((item) => item !== workspace.mode),
      ].slice(0, MAX_RECENT_WORKSPACES);
      this.writeModes(this.recentKey, next);
      return next;
    });
  }

  togglePinnedView(mode: MainViewMode): void {
    const workspace = this.getViewConfig(mode);
    if (!workspace) {
      return;
    }

    this.pinnedViewModes.update((current) => {
      const next = current.includes(workspace.mode)
        ? current.filter((item) => item !== workspace.mode)
        : [...current, workspace.mode].slice(0, MAX_PINNED_WORKSPACES);
      this.writeModes(this.pinnedKey, next);
      return next;
    });
  }

  isPinned(mode: MainViewMode): boolean {
    return this.pinnedViewModes().includes(this.normalizeMode(mode));
  }

  getPinnedViewConfigs(): WorkspaceConfig[] {
    return this.pinnedViewModes()
      .map((mode) => this.getViewConfig(mode))
      .filter((value): value is WorkspaceConfig => Boolean(value));
  }

  getRecentViewConfigs(): WorkspaceConfig[] {
    return this.recentViewModes()
      .map((mode) => this.getViewConfig(mode))
      .filter((value): value is WorkspaceConfig => Boolean(value));
  }

  getPrimaryMobileViewConfigs(): ViewConfig[] {
    return WORKSPACE_REGISTRY.filter(
      (workspace) => workspace.mobilePrimary && !workspace.hidden
    );
  }

  getOverflowMobileViewConfigs(): ViewConfig[] {
    const primaryModes = new Set(
      this.getPrimaryMobileViewConfigs().map((workspace) => workspace.mode)
    );
    return this.getViewConfigs().filter(
      (workspace) => !primaryModes.has(workspace.mode)
    );
  }

  getRelatedViewConfigs(mode: MainViewMode): WorkspaceConfig[] {
    const workspace = WORKSPACE_INDEX.get(this.normalizeMode(mode));
    return (workspace?.related || [])
      .map((relatedMode) => this.getViewConfig(relatedMode))
      .filter((value): value is WorkspaceConfig => Boolean(value));
  }

  toggleChatbot() {
    this.isChatbotOpen.update((isOpen) => !isOpen);
  }

  setTheme(themeName: string) {
    const theme = THEMES.find(
      (t) => t.name.toLowerCase() === themeName.toLowerCase()
    );
    if (theme) {
      this.activeTheme.set(theme);
    }
  }

  getAvailableThemes() {
    return THEMES;
  }
}
