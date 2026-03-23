import { Injectable, signal, inject, effect, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MainViewMode, AppTheme } from './user-context.service';
import { UserProfileService } from './user-profile.service';

const THEMES: AppTheme[] = [
  {
    name: 'Light',
    primary: '#10b981',
    accent: '#f59e0b',
    neutral: '#f8fafc',
    purple: '#6366f1',
    red: '#ef4444',
    blue: '#3b82f6',
  },
  {
    name: 'Dark',
    primary: '#10b981',
    accent: '#38bdf8',
    neutral: '#020617',
    purple: '#6366f1',
    red: '#f43f5e',
    blue: '#3b82f6',
  },
];

export interface ViewConfig {
  mode: MainViewMode;
  label: string;
  icon: string;
  category: 'CORE' | 'STRATEGY' | 'CREATIVE' | 'COMMUNITY' | 'UTILITY';
}

@Injectable({
  providedIn: 'root',
})
export class UIService {
  private router = inject(Router);
  private profileService = inject(UserProfileService);

  mainViewMode = signal<MainViewMode>('hub');
  activeTheme = signal<AppTheme>(THEMES[0]);
  showEqPanel = signal(false);
  showChatbot = signal(false);
  isChatbotOpen = signal(false);
  visualIntensity = signal(0);

  isOnline = signal(true);
  performanceMode = signal(false);
  showScanlines = signal(false);

  // Derived signals for UI state
  isLowPower = computed(() => this.performanceMode());
  isUplinkActive = computed(() => this.isOnline());

  private viewConfigs: ViewConfig[] = [
    { mode: 'hub', label: 'HUB', icon: 'grid_view', category: 'CORE' },
    { mode: 'studio', label: 'STUDIO', icon: 'token', category: 'CORE' },
    { mode: 'vocal-suite', label: 'VOCALS', icon: 'neurology', category: 'CORE' },
    { mode: 'strategy', label: 'INTEL', icon: 'analytics', category: 'STRATEGY' },
    { mode: 'career', label: 'CAREER', icon: 'business_center', category: 'STRATEGY' },
    { mode: 'profile', label: 'IDENTITY', icon: 'person', category: 'CORE' },
    { mode: 'tha-spot', label: 'SPOT', icon: 'bolt', category: 'COMMUNITY' },
    { mode: 'settings', label: 'CONFIG', icon: 'settings', category: 'UTILITY' },
  ];

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.updateOnlineStatus(true));
      window.addEventListener('offline', () => this.updateOnlineStatus(false));

      // Sync from Profile Settings
      effect(() => {
        const profile = this.profileService.profile();
        if (profile && profile.settings) {
            const settings = profile.settings.ui;
            this.performanceMode.set(settings.performanceMode || false);
            this.showScanlines.set(settings.showScanlines || false);
            this.setTheme(settings.theme || 'Light');
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

  private updateSetting(key: string, value: any) {
    const currentProfile = this.profileService.profile();
    if (!currentProfile) return;

    this.profileService.updateProfile({
      ...currentProfile,
      settings: {
        ...currentProfile.settings,
        ui: { ...currentProfile.settings.ui, [key]: value }
      }
    });
  }

  private updateOnlineStatus(status: boolean) {
    this.isOnline.set(status);
  }

  getViewConfigs(): ViewConfig[] {
    return [...this.viewConfigs];
  }

  getViewModes(): MainViewMode[] {
    return this.viewConfigs.map(v => v.mode);
  }

  navigateToView(mode: MainViewMode) {
    this.mainViewMode.set(mode);
    const route = '/' + mode;
    this.router.navigate([route]);
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
