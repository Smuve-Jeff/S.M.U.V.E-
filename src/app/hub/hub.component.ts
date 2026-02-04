import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Game, Challenge, CommunityPost, BattleConfig } from './hub.models';
import { GameService } from './game.service';
import { UserProfileService, UserProfile } from '../services/user-profile.service';
import { DeckService } from '../services/deck.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { UIService } from '../services/ui.service';
import { AiService } from '../services/ai.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
})
export class HubComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  public uiService = inject(UIService);
  public deckService = inject(DeckService);
  public profileService = inject(UserProfileService);
  public gameService = inject(GameService);
  private aiService = inject(AiService);

  // Quick Start Form
  quickProfile = signal({
    artistName: '',
    primaryGenre: 'Hip Hop'
  });

  // Radio State
  isRadioPlaying = computed(() => this.deckService.deckA().isPlaying);
  radioTrackName = computed(() => this.deckService.deckA().track?.name || 'S.M.U.V.E Radio');

  // AI Jam State (Shared with Tha Spot)
  isAIBassistEnabled = false;
  isAIDrummerEnabled = false;
  isAIKeyboardistEnabled = false;

  // Signals for UI state
  showChat = signal(false);
  showProfile = signal(false);
  showBattlefieldLobby = signal(false);
  selectedGame = signal<Game | undefined>(undefined);
  selectedUserId = signal<string | undefined>(undefined);

  // Game list and filtering
  games = signal<Game[]>([]);
  challenges = signal<Challenge[]>([
    {
      id: '1',
      title: 'Remix Master',
      description: 'Create the best remix of "Aurora"',
      prize: '$100',
    },
    {
      id: '2',
      title: 'Top Producer',
      description: 'Most liked beat this month',
      prize: 'Pro Membership',
    },
  ]);
  communityPosts = signal<CommunityPost[]>([
    {
      id: '1',
      author: 'Dr. Dre',
      content: 'New studio session starts now!',
      timestamp: new Date(),
    },
    {
      id: '2',
      author: 'Kanye',
      content: 'Vultures 2 out now.',
      timestamp: new Date(),
    },
  ]);

  genres = [
    'Hip Hop',
    'R&B',
    'Pop',
    'Electronic',
    'Rock',
    'Jazz',
    'Classical'
  ];

  gameGenres = [
    'Shooter',
    'Arcade',
    'Puzzle',
    'Arena',
    'Runner',
    'Rhythm',
    'Music Battle',
  ];

  sortModes: ('Popular' | 'Rating' | 'Newest')[] = [
    'Popular',
    'Rating',
    'Newest',
  ];
  activeFilters = signal<{ genre?: string; tag?: string; query?: string }>({});
  sortMode = signal<'Popular' | 'Rating' | 'Newest'>('Popular');

  private searchSubject = new Subject<string>();
  private filterOrSortSubject = new Subject<void>();
  private destroy$ = new Subject<void>();

  // "Tha Battlefield" lobby state
  musicShowcases = computed(
    () =>
      this.profileService
        .profile()
        ?.showcases.filter(
          (s) => s.type === 'music' && s.visibility === 'public'
        ) || []
  );

  battleConfig = signal<BattleConfig>({
    track: null,
    mode: 'duel',
    roundLength: 60,
    rounds: 1,
    matchType: 'public',
  });

  constructor() {}

  ngOnInit() {
    this.fetchGames();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        this.activeFilters.update((filters) => ({ ...filters, query }));
        this.fetchGames();
      });

    this.filterOrSortSubject
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        this.fetchGames();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchGames() {
    this.gameService
      .listGames(this.activeFilters(), this.sortMode())
      .subscribe((games) => this.games.set(games));
  }

  // Method to handle game selection
  selectGame(game: Game) {
    if (game.id === '14') {
      // 'Tha Battlefield'
      this.showBattlefieldLobby.set(true);
      this.selectedGame.set(game);
    } else {
      this.selectedGame.set(game);
    }
  }

  deselectGame() {
    this.selectedGame.set(undefined);
  }

  // Filter and sort methods
  onSearch(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.searchSubject.next(query);
  }

  setGenre(genre?: string) {
    this.activeFilters.update((filters) => ({
      ...filters,
      genre: this.activeFilters().genre === genre ? undefined : genre,
    }));
    this.filterOrSortSubject.next();
  }

  setSort(mode: 'Popular' | 'Rating' | 'Newest') {
    this.sortMode.set(mode);
    this.filterOrSortSubject.next();
  }

  // "Tha Battlefield" lobby methods
  updateBattleConfig<K extends keyof BattleConfig>(
    field: K,
    value: BattleConfig[K] | string
  ) {
    if (field === 'track' && typeof value === 'string') {
      const track = this.musicShowcases().find((t) => t.url === value);
      this.battleConfig.update((config) => ({
        ...config,
        track: track || null,
      }));
    } else {
      this.battleConfig.update((config) => ({
        ...config,
        [field]: value as BattleConfig[K],
      }));
    }
  }

  startBattle() {
    if (!this.battleConfig().track) {
      alert('Please select a track to battle with!');
      return;
    }
    console.log('Starting battle with config:', this.battleConfig());
    // Future: Call a service to start the match
    this.showBattlefieldLobby.set(false);
  }

  // Quick Start Actions
  onQuickStart() {
    if (!this.quickProfile().artistName) {
      alert('Please enter your Artist Name to begin!');
      return;
    }

    const current = this.profileService.profile();
    this.profileService.updateProfile({
      ...current,
      artistName: this.quickProfile().artistName,
      primaryGenre: this.quickProfile().primaryGenre
    });

    // Smooth transition to full profile
    this.router.navigate(['/profile']);
  }

  // Radio Actions
  toggleRadio() {
    this.deckService.togglePlay('A');
  }

  // AI Jam Actions
  toggleAIBassist() {
    this.isAIBassistEnabled = !this.isAIBassistEnabled;
    if (this.isAIBassistEnabled) {
      this.aiService.startAIBassist();
    } else {
      this.aiService.stopAIBassist();
    }
  }

  toggleAIDrummer() {
    this.isAIDrummerEnabled = !this.isAIDrummerEnabled;
    if (this.isAIDrummerEnabled) {
      this.aiService.startAIDrummer();
    } else {
      this.aiService.stopAIDrummer();
    }
  }

  toggleAIKeyboardist() {
    this.isAIKeyboardistEnabled = !this.isAIKeyboardistEnabled;
    if (this.isAIKeyboardistEnabled) {
      this.aiService.startAIKeyboardist();
    } else {
      this.aiService.stopAIKeyboardist();
    }
  }

  // Navigation Helpers
  goToStudio() {
    this.router.navigate(['/studio']);
  }

  goToThaSpot() {
    this.router.navigate(['/tha-spot']);
  }

  // General UI toggles
  toggleChat(visible: boolean) {
    this.showChat.set(visible);
  }

  toggleProfile(visible: boolean) {
    this.showProfile.set(visible);
  }
}
