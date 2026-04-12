import { Injectable, signal, inject, effect, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MainViewMode, AppTheme } from './user-context.service';
import { UserProfileService } from './user-profile.service';

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

export interface ViewConfig {
  mode: MainViewMode;
  label: string;
  description: string;
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
  autoPianoRoll = signal(false);

  // Derived signals for UI state
  isLowPower = computed(() => this.performanceMode());
  isUplinkActive = computed(() => this.isOnline());

  private viewConfigs: ViewConfig[] = [
    {
      mode: 'hub',
      label: 'Label Hub',
      description:
        'Coordinate releases, assets, and day-to-day executive moves.',
      icon: 'grid_view',
      category: 'CORE',
    },
    {
      mode: 'studio',
      label: 'Studio',
      description:
        'Build, mix, and refine production sessions with live control.',
      icon: 'token',
      category: 'CORE',
    },
    {
      mode: 'piano-roll',
      label: 'Piano Roll',
      description:
        'Compose, edit, and route arrangements with the full rack and mix dock.',
      icon: 'piano',
      category: 'CORE',
    },
    {
      mode: 'vocal-suite',
      label: 'Vocal Suite',
      description:
        'Record, edit, and polish vocal performances through each stage.',
      icon: 'neurology',
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
    {
      mode: 'career',
      label: 'Career Board',
      description:
        'Track opportunities, growth priorities, and business momentum.',
      icon: 'business_center',
      category: 'STRATEGY',
    },
    {
      mode: 'profile',
      label: 'Profile',
      description:
        'Manage artist identity, preferences, and personalized settings.',
      icon: 'person',
      category: 'CORE',
    },
    {
      mode: 'tha-spot',
      label: 'Gaming Hub',
      description:
        'Step into Tha Spot for arcade floors, matchmaking, and community play.',
      icon: 'sports_esports',
      category: 'COMMUNITY',
    },
    {
      mode: 'settings',
      label: 'Settings',
      description: 'Tune performance, visuals, and command-deck behavior.',
      icon: 'settings',
      category: 'UTILITY',
    },
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

  getViewConfigs(): ViewConfig[] {
    return [...this.viewConfigs];
  }

  getViewModes(): MainViewMode[] {
    return this.viewConfigs.map((v) => v.mode);
  }

  getViewConfig(mode: MainViewMode): ViewConfig | undefined {
    return this.viewConfigs.find((v) => v.mode === mode);
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
