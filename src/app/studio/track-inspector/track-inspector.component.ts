import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService } from '../../services/music-manager.service';
import { AiService } from '../../services/ai.service';

@Component({
  selector: 'app-track-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './track-inspector.component.html',
  styleUrls: ['./track-inspector.component.css'],
})
export class TrackInspectorComponent {
  public musicManager = inject(MusicManagerService);
  private aiService = inject(AiService);
  showAdvanced = signal(false);

  toggleAdvanced() {
    this.showAdvanced.update(v => !v);
  }

  selectedTrack = this.musicManager.selectedTrack;

  updateParam(key: string, value: any) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.updateSynthParams(track.id, { [key]: value });
  }

  async generatePattern() {
    const track = this.selectedTrack();
    if (!track) return;
    const pattern = await this.aiService.generateDrumPattern(track.instrumentId.includes('trap') ? 'Trap' : 'Electronic');
    this.musicManager.tracks.update(ts => ts.map(t => t.id === track.id ? { ...t, steps: pattern } : t));
  }

  async generateChords() {
    const track = this.selectedTrack();
    if (!track) return;
    const chordMidis = await this.aiService.generateChordProgression('C', 'minor');
    chordMidis.forEach((midi, i) => {
      this.musicManager.addNoteToTrack(track.id, {
        id: `ai_chord_${Date.now()}_${i}`,
        midi,
        step: i * 16,
        length: 4,
        velocity: 0.8
      });
    });
  }

  smartAdvice = signal<string | null>(null);

  getSmartAdvice() {
    this.smartAdvice.set(
      this.aiService.getSmartMixAdvice(this.musicManager.tracks()),
    );
  }

  getParam(key: string): any {
    return this.selectedTrack()?.synthParams?.[key] || 0;
  }
}
