import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { UserContextService, AppTheme, MainViewMode } from './user-context.service';

@Injectable({
  providedIn: 'root'
})
export class UIService {
  // Dependency Injection
  private userContextService = inject(UserContextService);

  // Theming
  readonly THEMES: AppTheme[] = [
    { name: 'Soft Sage', primary: '#9fb8ad', accent: '#c9d6cf', neutral: '#0f172a', purple: '#c7b9ff', red: '#f4b6c2', blue: '#9ad0ec' },
    { name: 'Dusky Lavender', primary: '#b8a3c2', accent: '#d8c7df', neutral: '#101828', purple: '#c5a6ff', red: '#f2c6c2', blue: '#a1c4fd' },
    { name: 'Midnight Sand', primary: '#c8b6a6', accent: '#e6d5c3', neutral: '#111827', purple: '#b4a1ff', red: '#f0a8a0', blue: '#8dc5d6' },
  ];
  currentTheme = this.userContextService.lastUsedTheme;

  private VIEW_THEMES: Record<string, AppTheme> = {
    dj: { name: 'DJ Neon', primary: '#00e5ff', accent: '#ff3ec8', neutral: '#0b0e14', purple: '#7a5cff', red: '#ff4d4d', blue: '#00e5ff' },
    remix: { name: 'Gaming Green', primary: '#39ff14', accent: '#daff00', neutral: '#0f0f0f', purple: '#b100cd', red: '#ff003c', blue: '#00c4ff' },
  };

  activeTheme = computed<AppTheme>(() => {
    const mode = this.mainViewMode();
    const override = this.VIEW_THEMES[mode];
    return override || this.currentTheme() || this.THEMES[0];
  });

  // Main View Management
  mainViewMode = this.userContextService.mainViewMode;

  // UI State
  showEqPanel = signal(false);
  showChatbot = signal(true);

  constructor() {
    effect(() => {
      const theme = this.activeTheme();
      Object.entries(theme).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    });
  }

  randomizeTheme() {
    const aRandomTheme = this.THEMES[Math.floor(Math.random() * this.THEMES.length)];
    this.currentTheme.set(aRandomTheme);
  }

  toggleMainViewMode() {
    this.mainViewMode.update(current => {
      const modes: MainViewMode[] = ['player', 'dj', 'studio', 'remix-arena', 'projects', 'profile'];
      const nextIndex = (modes.indexOf(current) + 1) % modes.length;
      return modes[nextIndex];
    });
  }
}
