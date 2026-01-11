import {
  Component,
  signal,
  computed,
  effect,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { GameService } from './game.service';
import {
  UserProfileService,
  ShowcaseItem,
} from '../services/user-profile.service';
import { Game } from './game';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { GameListComponent } from './game-list/game-list.component';
import { GameCardComponent } from './game-card/game-card.component';
import { GameSearchComponent } from './game-search/game-search.component';
import { ModalComponent } from './modal.component';

// Defines the configuration for a "Tha Battlefield" match
interface BattleConfig {
  track: ShowcaseItem | null;
  mode: 'duel' | 'team';
  roundLength: 30 | 60 | 90;
  rounds: 1 | 2 | 3;
  matchType: 'public' | 'private';
}

@Component({
  selector: 'app-hub',
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    GameListComponent,
    GameCardComponent,
    GameSearchComponent,
    ModalComponent,
  ],
})
export class HubComponent implements OnInit, OnDestroy {
  // Signals for UI state
  showChat = signal(false);
  showProfile = signal(false);
  showBattlefieldLobby = signal(false);
  selectedGame = signal<Game | undefined>(undefined);
  selectedUserId = signal<string | undefined>(undefined);

  // Game list and filtering
  games = signal<Game[]>([]);
  genres = [
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

  constructor(
    private gameService: GameService,
    public profileService: UserProfileService
  ) {
    // Effect to refetch games when filters or sort change
    effect(() => {
      this.gameService
        .listGames(this.activeFilters(), this.sortMode())
        .subscribe((games) => this.games.set(games));
    });
  }

  ngOnInit() {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        this.activeFilters.update((filters) => ({ ...filters, query }));
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
  }

  setSort(mode: 'Popular' | 'Rating' | 'Newest') {
    this.sortMode.set(mode);
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

  // General UI toggles
  toggleChat(visible: boolean) {
    this.showChat.set(visible);
  }

  toggleProfile(visible: boolean) {
    this.showProfile.set(visible);
  }
}
