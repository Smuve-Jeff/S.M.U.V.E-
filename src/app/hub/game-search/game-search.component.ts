import {
  Component,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
} from '@angular/core';

export interface GameSearchFilters {
  genre: string;
  sort: string;
}

@Component({
  selector: 'app-game-search',
  templateUrl: './game-search.component.html',
  styleUrls: ['../hub.css'], // Reusing hub styles
  standalone: true,
})
export class GameSearchComponent {
  @Output() searchChange = new EventEmitter<{
    query: string;
    filters: GameSearchFilters;
  }>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('genreSelect') genreSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('sortSelect') sortSelect!: ElementRef<HTMLSelectElement>;

  onSearchChange() {
    const query = this.searchInput.nativeElement.value;
    const filters: GameSearchFilters = {
      genre: this.genreSelect.nativeElement.value,
      sort: this.sortSelect.nativeElement.value,
    };
    this.searchChange.emit({ query, filters });
  }
}
