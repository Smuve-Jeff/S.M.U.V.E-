import { Injectable, signal } from '@angular/core';
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
    name: 'Cyberpunk',
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
];

@Injectable({
  providedIn: 'root',
})
export class UIService {
  mainViewMode = signal<MainViewMode>('hub');
  activeTheme = signal<AppTheme>(THEMES[0]);
  showEqPanel = signal(false);
  showChatbot = signal(false);
  isChatbotOpen = signal(false);
  visualIntensity = signal(0);

  isOnline = signal(true);

  private viewModes: MainViewMode[] = [
    'hub',
    'studio',
    'player',
    'dj',
    'piano-roll',
    'image-editor',
    'video-editor',
    'networking',
    'profile',
    'projects',
    'remix-arena',
    'tha-spot',
    'image-video-lab',
  ];
  private currentViewIndex = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.updateOnlineStatus(true));
      window.addEventListener('offline', () => this.updateOnlineStatus(false));
    }
  }

  private updateOnlineStatus(status: boolean) {
    this.isOnline.set(status);
  }

  toggleMainViewMode() {
    this.currentViewIndex = (this.currentViewIndex + 1) % this.viewModes.length;
    this.mainViewMode.set(this.viewModes[this.currentViewIndex]);
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
