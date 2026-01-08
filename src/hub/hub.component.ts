import { Component, OnInit, signal, computed } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Game } from './game';
import { GameService } from './game.service';

@Component({
  selector: 'app-hub',
  templateUrl: './hub.html',
  styleUrls: ['./hub.css']
})
export class HubComponent implements OnInit {
  // Signals for state management
  filteredGames = signal<Game[]>([]); // This now holds the games loaded from the service
  activityFeed = signal<string[]>([]);
  hoveredGame = signal<Game | null>(null);
  activeGame = signal<Game | null>(null);
  activeGameUrl = computed(() => {
    const game = this.activeGame();
    return game ? this.sanitizer.bypassSecurityTrustResourceUrl(game.url) : null;
  });

  // Filter and sort states
  filterQuery = signal('');
  filterGenre = signal('');
  filterSort = signal<'Popular' | 'Rating' | 'Newest'>('Popular');

  constructor(private gameService: GameService, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.loadGames();
    this.setupActivityFeed();
  }

  // Fetches games from the service based on current filter & sort selections
  loadGames() {
    const filters = {
      query: this.filterQuery() || undefined,
      genre: this.filterGenre() || undefined,
    };
    const sort = this.filterSort();

    this.gameService.listGames(filters, sort).subscribe(games => {
      this.filteredGames.set(games);
    });
  }
  
  // This is called by the template when a filter value changes
  applyFilters() {
    this.loadGames();
  }

  setupActivityFeed() {
    this.activityFeed.set([
      "Player <strong>N00bM4ster</strong> challenged <strong>xX_Slayer_Xx</strong> to a duel in <em>Neon Arena</em>.",
      "Team <strong>Vortex</strong> is recruiting skilled players for <em>Rhythm Rumble</em>.",
      "Your friend <strong>CyberGamer</strong> just came online.",
      "A new high score has been set in <em>Grid Runner</em>!",
    ]);
  }

  playGame(game: Game) {
    if (game.url) {
      this.activeGame.set(game);
    }
  }

  closeGame() {
    this.activeGame.set(null);
  }
}
