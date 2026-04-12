import { Injectable, signal, inject, effect, computed } from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
export class UIService {
  private router = inject(Router);
  private profileService = inject(UserProfileService);
  private readonly pinnedKey = 'smuve_pinned_workspaces';
  private readonly recentKey = 'smuve_recent_workspaces';

  mainViewMode = signal<MainViewMode>('hub');
  activeTheme = signal<AppTheme>(THEMES[0]);
  showEqPanel = signal(false);
  showChatbot = signal(false);
  isChatbotOpen = signal(false);
  visualIntensity = signal(0);

  isOnline = signal(true);
  performanceMode = signal(false);
  showScanlines = signal(false);
  autoPianoRoll = signal(false);
  recentViewModes = signal<MainViewMode[]>(this.readModes(this.recentKey));
  pinnedViewModes = signal<MainViewMode[]>(this.readModes(this.pinnedKey));

  // Derived signals for UI state
  isLowPower = computed(() => this.performanceMode());
  isUplinkActive = computed(() => this.isOnline());

  private viewConfigs: ViewConfig[] = WORKSPACE_REGISTRY.filter(
    (workspace) => !workspace.hidden && !workspace.aliasOf
  );

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.updateOnlineStatus(true));
      window.addEventListener('offline', () => this.updateOnlineStatus(false));

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
    }
  }

  togglePerformanceMode() {
    const newVal = !this.performanceMode();
    this.updateSetting('performanceMode', newVal);
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
      ].slice(0, 6);
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
        : [...current, workspace.mode].slice(0, 6);
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
