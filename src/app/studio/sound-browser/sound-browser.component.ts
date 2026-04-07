import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';
import { MusicManagerService } from '../../services/music-manager.service';

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

  searchQuery = signal('');
  selectedCategory = signal<'all' | 'synth' | 'sample'>('all');

  presets = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const cat = this.selectedCategory();
    return this.instruments.getPresets().filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query);
      const matchesCat = cat === 'all' || p.type === cat;
      return matchesSearch && matchesCat;
    });
  });

  categories = [
    { id: 'all', label: 'All Sounds', icon: 'grid_view' },
    { id: 'synth', label: 'Synths', icon: 'settings_input_component' },
    { id: 'sample', label: 'Samples', icon: 'audio_file' },
  ];

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

  importAudio() {
    this.musicManager.importAudioTrack();
  }
}
