import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SmartSoundService } from '../smart-sound.service';
import { AiMixAssistantService } from '../effects/ai-mix-assistant.service';

@Component({
  selector: 'app-sound-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sound-browser.component.html',
  styleUrls: ['./sound-browser.component.css'],
})
export class SoundBrowserComponent {
  private instruments = inject(InstrumentsService);
  public musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  public smartSound = inject(SmartSoundService);
  private aiMix = inject(AiMixAssistantService);

  searchQuery = signal('');
  selectedCategory = signal<string>('all');
  selectedTag = signal<string | null>(null);
  previewingId = signal<string | null>(null);
  showFavs = signal(false);
  similarToId = signal<string | null>(null);

  allPresets = computed(() => this.instruments.getPresets());

  /** Presets that are in the smartSound favorites */
  favoritePresetIds = computed(() => this.smartSound.favoriteIds());

  /** Similar sounds (when a sound is selected) */
  similarSounds = computed(() => {
    const id = this.similarToId();
    if (!id) return [];
    return this.smartSound.findSimilar(id, 5);
  });

  /** Genre-based instrument recommendations */
  genreRecs = computed(() => {
    const meta = this.smartSound;
    if (meta.activeGenre() && meta.activeGenre() !== 'all') {
      return this.aiMix.recommendInstruments(meta.activeGenre()!);
    }
    return [];
  });

  categories = [
    { id: 'all', label: 'All', icon: 'grid_view' },
    { id: 'drum', label: 'Drums', icon: 'drum' },
    { id: 'bass', label: 'Bass', icon: 'speaker' },
    { id: 'keys', label: 'Keys', icon: 'piano' },
    { id: 'lead', label: 'Leads', icon: 'graphic_eq' },
    { id: 'pad', label: 'Pads', icon: 'layers' },
    { id: 'vfx', label: 'FX', icon: 'auto_awesome' },
  ];

  allTags = computed(() => {
    const tags = new Set<string>();
    this.allPresets().forEach((p) => p.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  });

  /** Filter the preset grid to only show instruments from installed sound packs */
  showOnlyInstalledPacks = signal(false);

  presets = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const cat = this.selectedCategory();
    const tag = this.selectedTag();
    const installedIds = this.smartSound.installedPackPresets();

    return this.allPresets().filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        p.tags?.some((t) => t.toLowerCase().includes(query));

      const matchesCat = cat === 'all' || p.category === cat;
      const matchesTag = !tag || p.tags?.includes(tag);
      const matchesInstalled = !this.showOnlyInstalledPacks() || installedIds.has(p.id);

      return matchesSearch && matchesCat && matchesTag && matchesInstalled;
    });
  });

  selectPreset(preset: InstrumentPreset) {
    const selectedTrackId = this.musicManager.selectedTrackId();
    if (selectedTrackId !== null) {
      this.musicManager.setInstrument(selectedTrackId, preset.id);
    } else {
      this.musicManager.ensureTrack(preset.id);
    }
  }

  addAsNewTrack(preset: InstrumentPreset) {
    this.musicManager.ensureTrack(preset.id);
  }

  async previewPreset(preset: InstrumentPreset, event: MouseEvent) {
    event.stopPropagation();
    this.previewingId.set(preset.id);

    await this.instruments.audition(preset.id);

    setTimeout(() => {
      if (this.previewingId() === preset.id) {
        this.previewingId.set(null);
      }
    }, 500);
  }

  toggleTag(tag: string) {
    if (this.selectedTag() === tag) {
      this.selectedTag.set(null);
    } else {
      this.selectedTag.set(tag);
    }
  }

  importAudio() {
    this.musicManager.importAudio();
  }

  aiSearch() {
    this.smartSound.smartSearch(this.searchQuery());
    this.searchQuery.set(this.searchQuery());
  }

  async bulkExport() {
    // Export current project tracks — cloud drive integration pending
  }

  onDragStart(event: DragEvent, preset: InstrumentPreset) {
    event.dataTransfer?.setData(
      'application/json',
      JSON.stringify({
        type: 'instrument-preset',
        presetId: preset.id,
      })
    );
  }

  // ── Smart Sound Integration ────────────────────────────────

  /** Toggle favorite for a preset */
  toggleFavorite(presetId: string) {
    this.smartSound.toggleFavorite(presetId);
    this.smartSound.recordUsage(presetId);
  }

  /** Whether a preset is favorited */
  isFavorite(presetId: string): boolean {
    return this.smartSound.isFavorite(presetId);
  }

  /** Show similar presets */
  showSimilar(presetId: string) {
    this.similarToId.set(presetId);
  }

  /** Clear similar panel */
  clearSimilar() {
    this.similarToId.set(null);
  }

  /** Toggle favorites-only filter */
  toggleFavFilter() {
    this.showFavs.update((v) => !v);
  }

  /** Select a genre filter */
  selectGenre(genre: string) {
    this.smartSound.activeGenre.set(genre === 'all' ? null : genre);
  }

  /** Select a mood filter */
  selectMood(mood: string) {
    this.smartSound.activeMood.set(mood === 'all' ? null : mood);
  }

  /** Get recently used sounds */
  recentIds = computed(() => this.smartSound.recentIds());

  /** Select a sound from SmartSoundService by its ID (used in recent/similar templates) */
  selectSoundById(soundId: string) {
    const preset = this.allPresets().find((p) => p.id === soundId);
    if (preset) {
      this.selectPreset(preset);
    }
  }
}
