import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';

@Component({
  selector: 'app-sound-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sound-browser.component.html',
  styleUrls: ['./sound-browser.component.css'],
})
export class SoundBrowserComponent {
  private instruments = inject(InstrumentsService);
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);

  searchQuery = signal('');
  selectedCategory = signal<string>('all');
  selectedTag = signal<string | null>(null);
  previewingId = signal<string | null>(null);

  allPresets = computed(() => this.instruments.getPresets());

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

  presets = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const cat = this.selectedCategory();
    const tag = this.selectedTag();

    return this.allPresets().filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        p.tags?.some((t) => t.toLowerCase().includes(query));

      const matchesCat = cat === 'all' || p.category === cat;
      const matchesTag = !tag || p.tags?.includes(tag);

      return matchesSearch && matchesCat && matchesTag;
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
    this.musicManager.importAudioTrack();
  }

  aiSearch() {
    console.log('Deep AI Search Triggered');
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
}
