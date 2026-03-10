import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MainViewMode, AppTheme } from './user-context.service';

export type { MainViewMode };

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
  activeTheme = signal<AppTheme | null>(null);
  showChatbot = signal(false);
  isChatbotOpen = signal(false);
  isOnline = signal(true);

  private viewConfigs: ViewConfig[] = [
    { mode: 'hub', label: 'Dashboard', icon: 'dashboard', category: 'CORE' },
    { mode: 'studio', label: 'Industrial Engine', icon: 'graphic_eq', category: 'CREATIVE' },
    { mode: 'player', label: 'Global Broadcast', icon: 'podcasts', category: 'CORE' },
    { mode: 'tha-spot', label: 'Neon Domain', icon: 'nightlife', category: 'COMMUNITY' },
    { mode: 'profile', label: 'Artist Identity', icon: 'account_circle', category: 'UTILITY' },
    { mode: 'strategy', label: 'Command Matrix', icon: 'terminal', category: 'STRATEGY' },
    { mode: 'analytics', label: 'Executive Suite', icon: 'monitoring', category: 'STRATEGY' },
    { mode: 'image-video-lab', label: 'Media Labs', icon: 'science', category: 'CREATIVE' },
    { mode: 'practice', label: 'Practice Space', icon: 'mic', category: 'UTILITY' },
    { mode: 'career', label: 'Career Command', icon: 'business_center', category: 'COMMUNITY' },
    { mode: 'projects', label: 'Project Manager', icon: 'account_tree', category: 'STRATEGY' },
    { mode: 'remix-arena', label: 'Remix Arena', icon: 'rebase_edit', category: 'COMMUNITY' },
    { mode: 'dj', label: 'Elite Deck', icon: 'headphones', category: 'CREATIVE' }
  ];

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  getViewConfigs(): ViewConfig[] {
    return [...this.viewConfigs];
  }

  getViewModes(): MainViewMode[] {
    return this.viewConfigs.map(v => v.mode);
  }

  navigateToView(mode: MainViewMode) {
    this.mainViewMode.set(mode);
    const route = '/' + (mode === 'profile' ? 'profile' : mode);
    this.router.navigate([route]);
  }

  toggleChatbot() {
    this.isChatbotOpen.update((isOpen) => !isOpen);
  }
}
