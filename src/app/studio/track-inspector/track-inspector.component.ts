import { Component, inject, computed, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService, TrackModel } from '../../services/music-manager.service';
import { AiService } from '../../services/ai.service';
import { WaveformRendererComponent } from '../waveform-renderer/waveform-renderer.component';

@Component({
  selector: 'app-track-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule, WaveformRendererComponent],
  templateUrl: './track-inspector.component.html',
  styleUrls: ['./track-inspector.component.css'],
})
export class TrackInspectorComponent {
  public musicManager = inject(MusicManagerService);
  private aiService = inject(AiService);
  showAdvanced = signal(false);
  @ViewChild('audioImportInput') audioImportInput?: ElementRef<HTMLInputElement>;

  selectedClip = computed(() => {
    const track = this.selectedTrack();
    return track?.clips?.find((clip) => clip.type === 'audio') || null;
  });

  toggleAdvanced() {
    this.showAdvanced.update(v => !v);
  }

  selectedTrack = computed<TrackModel | null>(() => {
    const id = this.musicManager.selectedTrackId();
    if (!id) return null;
    return this.musicManager.tracks().find((t) => t.id === id) || null;
  });

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

  getSmartAdvice() {
    const advice = this.aiService.getSmartMixAdvice(this.musicManager.tracks());
    alert(advice);
  }

  getParam(key: string): any {
    return this.selectedTrack()?.synthParams?.[key] || 0;
  }

  updateClipField(key: string, value: any) {
    const track = this.selectedTrack();
    const clip = this.selectedClip();
    if (!track || !clip) return;
    const typedValue = key === 'start' || key === 'length' ? Number(value) : value;
    this.musicManager.updateClip(track.id, clip.id, { [key]: typedValue });
  }

  removeSelectedClip() {
    const track = this.selectedTrack();
    const clip = this.selectedClip();
    if (!track || !clip) return;
    this.musicManager.removeClip(track.id, clip.id);
  }

  requestAudioImport() {
    this.audioImportInput?.nativeElement?.click();
  }

  async onAudioFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.musicManager.importAudio(file, this.selectedTrack()?.id);
    input.value = '';
  }
}
