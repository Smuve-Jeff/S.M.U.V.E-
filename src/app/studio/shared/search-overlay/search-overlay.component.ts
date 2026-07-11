import { Component, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: 'preset' | 'track' | 'effect' | 'action';
  icon: string;
}

@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-overlay.component.html',
  styleUrls: ['./search-overlay.component.css'],
})
export class SearchOverlayComponent implements OnInit {
  visible = signal(false);
  query = signal('');
  results = signal<SearchResult[]>([]);
  recentSearches = signal<string[]>([]);

  close = output<void>();
  select = output<SearchResult>();

  private readonly RECENT_SEARCHES_KEY = 'smuve_recent_searches';

  ngOnInit() {
    this.loadRecentSearches();
  }

  show() {
    this.visible.set(true);
    this.query.set('');
    this.results.set([]);
  }

  hide() {
    this.visible.set(false);
    this.close.emit();
  }

  onSearch(value: string) {
    this.query.set(value);

    if (value.length < 2) {
      this.results.set([]);
      return;
    }

    const mockResults: SearchResult[] = [
      {
        id: '1',
        title: 'Deep Bass Synth',
        subtitle: 'Synth Preset',
        type: 'preset' as const,
        icon: 'settings_input_component',
      },
      {
        id: '2',
        title: 'Reverb Hall',
        subtitle: 'Effect',
        type: 'effect' as const,
        icon: 'graphic_eq',
      },
      {
        id: '3',
        title: 'Add New Track',
        subtitle: 'Action',
        type: 'action' as const,
        icon: 'add',
      },
    ].filter((r) => r.title.toLowerCase().includes(value.toLowerCase()));

    this.results.set(mockResults);
  }

  onSelectResult(result: SearchResult) {
    this.addToRecentSearches(result.title);
    this.select.emit(result);
    this.hide();
  }

  onRecentSearchClick(search: string) {
    this.query.set(search);
    this.onSearch(search);
  }

  clearRecentSearches() {
    this.recentSearches.set([]);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.RECENT_SEARCHES_KEY);
    }
  }

  private loadRecentSearches() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(this.RECENT_SEARCHES_KEY);
      if (stored) {
        try {
          this.recentSearches.set(JSON.parse(stored));
        } catch {}
      }
    }
  }

  private addToRecentSearches(search: string) {
    const current = this.recentSearches();
    const updated = [search, ...current.filter((s) => s !== search)].slice(
      0,
      5
    );
    this.recentSearches.set(updated);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.RECENT_SEARCHES_KEY, JSON.stringify(updated));
    }
  }
}
