import { Injectable, signal, inject, effect } from '@angular/core';
import { Router } from '@angular/router';
import { MainViewMode, AppTheme } from './user-context.service';

const THEMES: AppTheme[] = [
  {
    name: 'Modern Professional',
    primary: 'emerald',
    accent: 'violet',
    neutral: 'slate',
    purple: 'purple',
    red: 'red',
    blue: 'blue',
  },
  {
    name: 'pro-gradepunk',
    primary: 'cyan',
    accent: 'pink',
    neutral: 'gray',
    purple: 'purple',
    red: 'red',
    blue: 'blue',
  },
  {
    name: 'Vintage',
    primary: 'orange',
    accent: 'teal',
    neutral: 'stone',
    purple: 'purple',
    red: 'red',
    blue: 'blue',
  },
  {
    name: 'v4 Extreme',
    primary: 'orange',
    accent: 'magenta',
    neutral: 'slate',
    purple: 'purple',
    red: 'red',
    blue: 'blue',
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

  mainViewMode = signal<MainViewMode>('hub');
  activeTheme = signal<AppTheme>(THEMES[0]);
  showEqPanel = signal(false);
  showChatbot = signal(false);
  isChatbotOpen = signal(false);
  visualIntensity = signal(0);

  isOnline = signal(true);
  performanceMode = signal(false);

  private viewConfigs: ViewConfig[] = [
    { mode: 'hub', label: 'Hub Dashboard', icon: 'fa-th-large', category: 'CORE' },
    { mode: 'studio', label: 'Studio DAW', icon: 'fa-music', category: 'CORE' },
    { mode: 'vocal-suite', label: 'Vocal Suite', icon: 'fa-microphone-lines', category: 'CORE' },
    { mode: 'profile', label: 'Artist Profile', icon: 'fa-user-circle', category: 'CORE' },
    { mode: 'strategy', label: 'Strategy Hub', icon: 'fa-chess', category: 'STRATEGY' },
    { mode: 'career', label: 'Career Hub', icon: 'fa-briefcase', category: 'STRATEGY' },
    { mode: 'analytics', label: 'Analytics', icon: 'fa-chart-line', category: 'STRATEGY' },
    { mode: 'image-video-lab', label: 'Cinema Engine', icon: 'fa-video', category: 'CREATIVE' },
    { mode: 'practice', label: 'Practice Space', icon: 'fa-microphone-alt', category: 'CORE' },
    { mode: 'projects', label: 'Projects', icon: 'fa-project-diagram', category: 'STRATEGY' },
    { mode: 'remix-arena', label: 'Remix Arena', icon: 'fa-compact-disc', category: 'COMMUNITY' },
    { mode: 'tha-spot', label: 'Tha Spot', icon: 'fa-bolt', category: 'COMMUNITY' },
    { mode: 'networking', label: 'Networking', icon: 'fa-users', category: 'COMMUNITY' },
    { mode: 'player', label: 'Global Player', icon: 'fa-play-circle', category: 'UTILITY' },
    { mode: 'dj', label: 'DJ Booth', icon: 'fa-headphones', category: 'CORE' },
    { mode: 'piano-roll', label: 'Piano Roll', icon: 'fa-keyboard', category: 'UTILITY' },
    { mode: 'image-editor', label: 'Image Editor', icon: 'fa-image', category: 'CREATIVE' },
    { mode: 'video-editor', label: 'Video Editor', icon: 'fa-film', category: 'CREATIVE' },
  ];

  private currentViewIndex = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.updateOnlineStatus(true));
      window.addEventListener('offline', () => this.updateOnlineStatus(false));

      const savedPerfMode = localStorage.getItem('smuve_perf_mode');
      if (savedPerfMode) {
        this.performanceMode.set(savedPerfMode === 'true');
      }

      effect(() => {
        const isPerf = this.performanceMode();
        if (isPerf) {
          document.body.classList.add('perf-mode-active');
        } else {
          document.body.classList.remove('perf-mode-active');
        }
      });
    }
  }

  togglePerformanceMode() {
    this.performanceMode.update(v => {
      const newVal = !v;
      localStorage.setItem('smuve_perf_mode', String(newVal));
      return newVal;
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

  toggleMainViewMode() {
    const modes = this.getViewModes();
    this.currentViewIndex = (this.currentViewIndex + 1) % modes.length;
    const nextMode = modes[this.currentViewIndex];
    this.navigateToView(nextMode);
  }

  toggleChatbot() {
    this.isChatbotOpen.update((isOpen) => !isOpen);
  }

  randomizeTheme() {
    const newTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
    this.activeTheme.set(newTheme);
  }

  setTheme(themeName: string) {
    const theme = THEMES.find(
      (t) => t.name.toLowerCase() === themeName.toLowerCase()
    );
    if (theme) {
      this.activeTheme.set(theme);
    }
  }
}
