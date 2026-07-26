import { Injectable, inject, signal, computed } from '@angular/core';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';

/** A sound preset or sample that can be tagged/searched */
export interface SoundEntry {
  id: string;
  name: string;
  category: string;
  type: 'synth' | 'sample' | 'preset' | 'drum';
  tags: string[];
  genre: string;
  mood: string;
  key: string;
  bpm: number;
  rating: number;
  favoritedAt: number | null;
  lastUsedAt: number | null;
  useCount: number;
}

@Injectable({ providedIn: 'root' })
export class SmartSoundService {
  private readonly storage = inject(LocalStorageService);
  private readonly logger = inject(LoggingService);

  /** All known sounds (presets + samples) */
  sounds = signal<SoundEntry[]>([]);
  /** Favorited sound IDs */
  favoriteIds = signal<Set<string>>(new Set());
  /** Recently used sound IDs (ordered) */
  recentIds = signal<string[]>([]);

  /** Search query */
  searchQuery = signal('');
  /** Active genre filter */
  activeGenre = signal<string | null>(null);
  /** Active mood filter */
  activeMood = signal<string | null>(null);
  /** Active key filter */
  activeKey = signal<string | null>(null);
  /** Show only favorites */
  showFavoritesOnly = signal(false);
  /** Sort mode */
  sortMode = signal<'name' | 'recent' | 'rating' | 'bpm'>('name');
  /** Last search timestamp — triggers UI updates */
  lastSearchAt = signal<number>(0);

  genres = ['all', 'neo-soul', 'trap', 'lo-fi', 'house', 'drill', 'pop', 'rnb', 'jazz', 'funk', 'ambient', 'techno', 'dnb', 'garage'];
  moods = ['all', 'dark', 'bright', 'chill', 'energetic', 'melancholic', 'aggressive', 'dreamy', 'funky', 'ambient'];
  keys = ['all', 'C', 'Cm', 'D', 'Dm', 'E', 'Em', 'F', 'Fm', 'G', 'Gm', 'A', 'Am', 'B', 'Bm'];

  /** Filtered and sorted presets */
  filteredSounds = computed(() => {
    let list = this.sounds();

    // Favorites only
    if (this.showFavoritesOnly()) {
      list = list.filter((s) => this.favoriteIds().has(s.id));
    }

    // Search query
    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          s.category.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q)
      );
    }

    // Genre filter
    const genre = this.activeGenre();
    if (genre && genre !== 'all') {
      list = list.filter((s) => s.genre === genre);
    }

    // Mood filter
    const mood = this.activeMood();
    if (mood && mood !== 'all') {
      list = list.filter((s) => s.mood === mood);
    }

    // Key filter
    const key = this.activeKey();
    if (key && key !== 'all') {
      list = list.filter((s) => s.key === key);
    }

    // Sort
    const sort = this.sortMode();
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'recent') return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'bpm') return Math.abs(a.bpm - 120) - Math.abs(b.bpm - 120);
      return 0;
    });

    return list;
  });

  /** Current favorites list */
  favorites = computed(() => {
    const favIds = this.favoriteIds();
    return this.sounds().filter((s) => favIds.has(s.id));
  });

  /** Recently used sounds */
  recentSounds = computed(() => {
    const recent = this.recentIds();
    const map = new Map(this.sounds().map((s) => [s.id, s]));
    return recent.map((id) => map.get(id)).filter(Boolean) as SoundEntry[];
  });

  /** All unique tags from sounds */
  allTags = computed(() => {
    const tags = new Set<string>();
    this.sounds().forEach((s) => s.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  });

  constructor() {
    this.loadFavorites();
    this.loadRecent();
    this.loadSounds();
  }

  // ── Favorites ───────────────────────────────────────────

  toggleFavorite(soundId: string) {
    this.favoriteIds.update((set) => {
      const next = new Set(set);
      if (next.has(soundId)) {
        next.delete(soundId);
      } else {
        next.add(soundId);
      }
      this.persistFavorites(next);
      return next;
    });
  }

  isFavorite(soundId: string): boolean {
    return this.favoriteIds().has(soundId);
  }

  /** Get all favorite sound IDs */
  getFavoriteIds(): string[] {
    return Array.from(this.favoriteIds());
  }

  // ── Recent usage tracking ───────────────────────────────

  recordUsage(soundId: string) {
    // Update usage count and timestamp in sounds
    this.sounds.update((list) =>
      list.map((s) =>
        s.id === soundId
          ? { ...s, lastUsedAt: Date.now(), useCount: s.useCount + 1 }
          : s
      )
    );

    // Add to recent IDs (most recent first, max 20)
    this.recentIds.update((ids) => {
      const next = [soundId, ...ids.filter((id) => id !== soundId)];
      return next.slice(0, 20);
    });

    this.persistRecent();
  }

  // ── AI Sound Matching ───────────────────────────────────

  /**
   * Find similar sounds based on tag overlap and genre.
   * Returns up to `limit` matches.
   */
  findSimilar(soundId: string, limit = 6): SoundEntry[] {
    const target = this.sounds().find((s) => s.id === soundId);
    if (!target) return [];

    const scored = this.sounds()
      .filter((s) => s.id !== soundId)
      .map((s) => {
        let score = 0;

        // Tag overlap
        const sharedTags = s.tags.filter((t) => target.tags.includes(t));
        score += sharedTags.length * 3;

        // Same genre
        if (s.genre === target.genre) score += 5;

        // Same mood
        if (s.mood === target.mood) score += 4;

        // Same category
        if (s.category === target.category) score += 3;

        // Same key
        if (s.key === target.key) score += 2;

        // BPM proximity (within 10%)
        const bpmDiff = Math.abs(s.bpm - target.bpm) / Math.max(s.bpm, target.bpm);
        if (bpmDiff < 0.1) score += 2;

        return { sound: s, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => s.sound);
  }

  /**
   * Smart search: returns AI-enhanced results based on intent.
   */
  smartSearch(query: string): SoundEntry[] {
    const q = query.toLowerCase().trim();
    this.searchQuery.set(q);
    this.lastSearchAt.set(Date.now());

    // Direct filter
    const direct = this.filteredSounds();

    // If query is very specific, return filtered results
    if (q.length > 3 || direct.length < 20) return direct;

    // For broad queries, use tag-based expansion
    const broadResults = this.sounds().filter((s) => {
      const tagMatch = s.tags.some((t) => t.toLowerCase().includes(q));
      const descMatch =
        s.name.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q) ||
        s.mood.toLowerCase().includes(q);
      return tagMatch || descMatch;
    });

    return broadResults.length > 0 ? broadResults : direct;
  }

  // ── Persistence ─────────────────────────────────────────

  private async loadFavorites() {
    try {
      const data = await this.storage.getItem('sound_prefs', 'favorites');
      if (data && Array.isArray(data)) {
        this.favoriteIds.set(new Set(data as string[]));
      }
    } catch {
      // first run
    }
  }

  private async persistFavorites(set: Set<string>) {
    try {
      await this.storage.saveItem('sound_prefs', Array.from(set));
    } catch {
      // best-effort
    }
  }

  private async loadRecent() {
    try {
      const data = await this.storage.getItem('sound_prefs', 'recent');
      if (data && Array.isArray(data)) {
        this.recentIds.set(data as string[]);
      }
    } catch {
      // first run
    }
  }

  private async persistRecent() {
    try {
      await this.storage.saveItem('sound_prefs', this.recentIds());
    } catch {
      // best-effort
    }
  }

  private async loadSounds() {
    try {
      const data = await this.storage.getItem('sound_prefs', 'library');
      if (data && Array.isArray(data)) {
        this.sounds.set(data as SoundEntry[]);
        return;
      }
    } catch {
      // first run
    }

    // Default sound library
    this.sounds.set([
      { id: 'synth_lead', name: 'Cyber-Lead', category: 'lead', type: 'synth', tags: ['bright', 'lead', 'synth'], genre: 'trap', mood: 'dark', key: 'C', bpm: 140, rating: 4, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'synth_pad', name: 'Galactic Pad', category: 'pad', type: 'synth', tags: ['ambient', 'pad', 'synth', 'chill'], genre: 'ambient', mood: 'dreamy', key: 'F', bpm: 80, rating: 5, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'bass_808', name: '808 Sub', category: 'bass', type: 'drum', tags: ['808', 'bass', 'sub', 'trap'], genre: 'trap', mood: 'dark', key: 'E', bpm: 140, rating: 5, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'drum_kick', name: 'Rumble Kick', category: 'drum', type: 'drum', tags: ['kick', 'drum', '808', 'accent'], genre: 'pop', mood: 'energetic', key: 'C', bpm: 120, rating: 4, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'drum_snare', name: 'Glitch Snare', category: 'drum', type: 'sample', tags: ['snare', 'drum', 'gritty', 'trap'], genre: 'drill', mood: 'aggressive', key: 'D', bpm: 142, rating: 3, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'drum_hat', name: 'Cyber-Hat', category: 'drum', type: 'sample', tags: ['hat', 'hihat', 'drum', 'bright'], genre: 'house', mood: 'energetic', key: 'C', bpm: 124, rating: 4, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'grand-piano', name: 'Grand Piano', category: 'keys', type: 'preset', tags: ['piano', 'keys', 'acoustic', 'classic'], genre: 'jazz', mood: 'chill', key: 'C', bpm: 90, rating: 5, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'p-bass-elite', name: 'P-Bass Elite', category: 'bass', type: 'preset', tags: ['bass', 'funk', 'slap', 'groove'], genre: 'funk', mood: 'funky', key: 'E', bpm: 100, rating: 4, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'sub-commander', name: 'Sub Commander', category: 'bass', type: 'synth', tags: ['bass', 'sub', '808', 'deep', 'trap'], genre: 'trap', mood: 'dark', key: 'A', bpm: 140, rating: 5, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'strat-elite-clean', name: 'Strat Elite Clean', category: 'keys', type: 'preset', tags: ['guitar', 'clean', 'pop', 'bright'], genre: 'pop', mood: 'bright', key: 'G', bpm: 120, rating: 4, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'trap-808-elite', name: 'Trap 808 Elite', category: 'drum', type: 'drum', tags: ['808', 'trap', 'drums', 'beats'], genre: 'trap', mood: 'aggressive', key: 'D', bpm: 140, rating: 5, favoritedAt: null, lastUsedAt: null, useCount: 0 },
      { id: 'cyber-stab', name: 'Cyber Stab', category: 'lead', type: 'synth', tags: ['stab', 'lead', 'house', 'bright'], genre: 'house', mood: 'energetic', key: 'C', bpm: 124, rating: 4, favoritedAt: null, lastUsedAt: null, useCount: 0 },
    ]);
  }
}
