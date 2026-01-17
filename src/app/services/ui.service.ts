import { Injectable, signal, inject } from '@angular/core';
import { MainViewMode, AppTheme } from './user-context.service';
import { AudioEngineService } from './audio-engine.service';
import { ReputationService } from './reputation.service';

const THEMES: AppTheme[] = [
  { name: 'Cyberpunk', primary: 'cyan', accent: 'pink', neutral: 'gray', purple: 'purple', red: 'red', blue: 'blue' },
  { name: 'Vintage', primary: 'orange', accent: 'teal', neutral: 'stone', purple: 'purple', red: 'red', blue: 'blue' },
  { name: '8-Bit', primary: 'lime', accent: 'yellow', neutral: 'slate', purple: 'purple', red: 'red', blue: 'blue' },
];

@Injectable({
  providedIn: 'root'
})
export class UIService {
  mainViewMode = signal<MainViewMode>('tha-spot');
  activeTheme = signal<AppTheme>(THEMES[0]);
  showEqPanel = signal(false);
  showChatbot = signal(false);
  isChatbotOpen = signal(false);
  visualIntensity = signal(0);

  private viewModes: MainViewMode[] = ['hub', 'studio', 'player', 'dj', 'piano-roll', 'image-editor', 'video-editor', 'networking', 'profile', 'projects', 'remix-arena', 'tha-spot', 'image-video-lab'];
  private currentViewIndex = 0;
  private engine = inject(AudioEngineService);
  private reputation = inject(ReputationService);

  reputationTitle = computed(() => this.reputation.state().title);
  reputationLevel = computed(() => this.reputation.state().level);
  reputationProgress = computed(() => (this.reputation.state().xp / 1000) * 100);

  constructor() {
    this.startVisualizerLoop();
  }

  private startVisualizerLoop() {
    const update = () => {
      // Safely poll the engine's visual intensity
      try {
        const intensity = this.engine.getVisualIntensity();
        this.visualIntensity.set(intensity);
      } catch (e) {
        // Audio Engine might not be ready yet
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  toggleMainViewMode() {
    this.currentViewIndex = (this.currentViewIndex + 1) % this.viewModes.length;
    this.mainViewMode.set(this.viewModes[this.currentViewIndex]);
  }

  toggleChatbot() {
    this.isChatbotOpen.update(isOpen => !isOpen);
  }

  randomizeTheme() {
    const newTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
    this.activeTheme.set(newTheme);
  }
  
  setTheme(themeName: string) {
    const theme = THEMES.find(t => t.name.toLowerCase() === themeName.toLowerCase());
    if (theme) {
      this.activeTheme.set(theme);
    }
  }
}
