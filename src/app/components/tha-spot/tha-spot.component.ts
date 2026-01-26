import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VisualizerComponent } from '../visualizer/visualizer.component';
import { AiService } from '../../services/ai.service';
import { GameService } from '../../hub/game.service';
import { UserProfileService } from '../../services/user-profile.service';
import { Game } from '../../hub/hub.models';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule, VisualizerComponent],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
})
export class ThaSpotComponent implements OnInit {
  private aiService = inject(AiService);
  private gameService = inject(GameService);
  public profileService = inject(UserProfileService);

  // AI Jam State
  isAIBassistEnabled = false;
  isAIDrummerEnabled = false;
  isAIKeyboardistEnabled = false;

  // Gaming Hub State
  games = signal<Game[]>([]);
  selectedGame = signal<Game | undefined>(undefined);
  activeFilters = signal<{ genre?: string; query?: string }>({});
  sortMode = signal<'Popular' | 'Rating' | 'Newest'>('Popular');

  genres = [
    'Shooter',
    'Arcade',
    'Puzzle',
    'Arena',
    'Runner',
    'Rhythm',
    'Music Battle',
  ];

  private searchSubject = new Subject<string>();

  ngOnInit() {
    this.fetchGames();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.activeFilters.update((filters) => ({ ...filters, query }));
        this.fetchGames();
      });
  }

  fetchGames() {
    this.gameService
      .listGames(this.activeFilters(), this.sortMode())
      .subscribe((games) => this.games.set(games));
  }

  selectGame(game: Game) {
    this.selectedGame.set(game);
  }

  onSearch(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.searchSubject.next(query);
  }

  setGenre(genre?: string) {
    this.activeFilters.update((filters) => ({
      ...filters,
      genre: this.activeFilters().genre === genre ? undefined : genre,
    }));
    this.fetchGames();
  }

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
}
