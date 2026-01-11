import { Component, signal, computed, effect, OnDestroy, OnInit } from '@angular/core';
import { GameService } from './game.service';
import { ProfileService, ShowcaseItem } from './profile/profile.service';
import { Game } from './game';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-hub',
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule]
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
  genres = ['Shooter', 'Arcade', 'Puzzle', 'Arena', 'Runner', 'Rhythm', 'Music Battle'];
  sortModes: ('Popular' | 'Rating' | 'Newest')[] = ['Popular', 'Rating', 'Newest'];
  activeFilters = signal<{ genre?: string; tag?: string; query?: string; }>({});
  sortMode = signal<'Popular' | 'Rating' | 'Newest'>('Popular');
  
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  // "Tha Battlefield" lobby state
  musicShowcases = computed(() => 
    this.profileService.myProfile()?.showcases.filter(s => s.type === 'music' && s.visibility === 'public') || []
  );
  battleConfig = signal({
    track: null as ShowcaseItem | null,
    mode: 'duel' as 'duel' | 'team',
    roundLength: 60 as 30 | 60 | 90,
    rounds: 1 as 1 | 2 | 3,
    matchType: 'public' as 'public' | 'private',
  });

  constructor(
    private gameService: GameService, 
    public profileService: ProfileService
  ) {
    // Effect to refetch games when filters or sort change
    effect(() => {
      this.gameService.listGames(this.activeFilters(), this.sortMode())
        .subscribe(games => this.games.set(games));
    });
  }

  ngOnInit() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.activeFilters.update(filters => ({ ...filters, query }));
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  // Method to handle game selection
  selectGame(game: Game) {
    if (game.id === '14') { // 'Tha Battlefield'
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
    this.activeFilters.update(filters => ({ ...filters, genre: this.activeFilters().genre === genre ? undefined : genre }));
  }

  setSort(mode: 'Popular' | 'Rating' | 'Newest') {
    this.sortMode.set(mode);
  }

  // "Tha Battlefield" lobby methods
  updateBattleConfig<K extends keyof typeof this.battleConfig.prototype>(field: K, value: any) {
    if (field === 'track' && typeof value === 'string') {
        const track = this.musicShowcases().find(t => t.url === value);
        this.battleConfig.update(config => ({ ...config, track: track || null }));
    } else {
        this.battleConfig.update(config => ({ ...config, [field]: value }));
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
