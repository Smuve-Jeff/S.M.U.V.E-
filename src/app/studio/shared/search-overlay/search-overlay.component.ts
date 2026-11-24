import { Component, output, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { removeStore, writeJsonStore } from "../../../services/guarded-storage";
import { reportUnreadableStore } from "../../../services/storage-notice";

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: "preset" | "track" | "effect" | "action";
  icon: string;
}

@Component({
  selector: "app-search-overlay",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./search-overlay.component.html",
  styleUrls: ["./search-overlay.component.css", "../platform-ux.css"],
})
export class SearchOverlayComponent implements OnInit {
  visible = signal(false);
  query = signal("");
  results = signal<SearchResult[]>([]);
  recentSearches = signal<string[]>([]);

  close = output<void>();
  select = output<SearchResult>();

  private readonly RECENT_SEARCHES_KEY = "smuve_recent_searches";
  /** False when the stored recents could not be read; then never rewrite them. */
  private recentsReadable = true;

  ngOnInit() {
    this.loadRecentSearches();
  }

  show() {
    this.visible.set(true);
    this.query.set("");
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
        id: "1",
        title: "Deep Bass Synth",
        subtitle: "Synth Preset",
        type: "preset" as const,
        icon: "settings_input_component",
      },
      {
        id: "2",
        title: "Reverb Hall",
        subtitle: "Effect",
        type: "effect" as const,
        icon: "graphic_eq",
      },
      {
        id: "3",
        title: "Add New Track",
        subtitle: "Action",
        type: "action" as const,
        icon: "add",
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
    if (!this.recentsReadable) return;
    removeStore("Your recent searches", this.RECENT_SEARCHES_KEY);
  }

  private loadRecentSearches() {
    try {
      if (typeof localStorage === "undefined") return;
      const stored = localStorage.getItem(this.RECENT_SEARCHES_KEY);
      if (stored) this.recentSearches.set(JSON.parse(stored));
    } catch {
      // An unreadable list is not an empty one: keep it and say so.
      this.recentsReadable = false;
      reportUnreadableStore("Your recent searches");
    }
  }

  private addToRecentSearches(search: string) {
    const current = this.recentSearches();
    const updated = [search, ...current.filter((s) => s !== search)].slice(
      0,
      5,
    );
    this.recentSearches.set(updated);
    if (!this.recentsReadable) return;

    writeJsonStore("Your recent searches", this.RECENT_SEARCHES_KEY, updated);
  }
}
