import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { AiService } from '../../services/ai.service';
import { AudioImportService } from '../audio-import.service';
import { SnackbarService } from '../../services/snackbar.service';

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
  private audioImport = inject(AudioImportService);
  public snack = inject(SnackbarService);
  showAdvanced = signal(false);

  /** General-MIDI drum notes (kick/snare/clap/hat) for AI pattern writing. */
  private readonly DRUM_NOTES = [36, 38, 39, 42, 46];

  toggleAdvanced() {
    this.showAdvanced.update((v) => !v);
  }

  selectedTrack = computed<TrackModel | null>(() => {
    const id = this.musicManager.selectedTrackId();
    if (!id) return null;
    return this.musicManager.tracks().find((t) => t.id === id) || null;
  });

  /**
   * Selected audio file in the Audio Import workspace, when one matches the
   * name of the inspected audio track (enables the sample-processor section).
   * The matching is name-based: imported audio files become arrangement
   * tracks named after the file, so we can link an audio track to its source
   * without persisting a foreign key on TrackModel.
   */
  linkedAudio = computed(() => {
    const track = this.selectedTrack();
    if (!track || track.type !== 'audio') return null;
    const candidates = this.audioImport.importedAudio();
    return (
      candidates.find((a) => a.name === track.name) ?? candidates[0] ?? null
    );
  });

  /** Audio-import metadata getters (non-destructive pitch / normalize). */
  audioPitch = computed(() => this.linkedAudio()?.pitchSemitones ?? 0);
  audioNormalized = computed(() => this.linkedAudio()?.normalize ?? false);

  updateParam(key: string, value: any) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.updateSynthParams(track.id, { [key]: value });
  }

  /**
   * AI drum pattern → audible notes. This used to write the pattern into
   * `track.steps` — a legacy boolean array NOTHING in the playback chain
   * reads, so the generated beat was silent. Now the pattern becomes real
   * TrackNotes (GM drum pitches, history-wrapped) so the inspector's
   * pattern button actually makes sound.
   */
  async generatePattern() {
    const track = this.selectedTrack();
    if (!track) return;
    const pattern = await this.aiService.generateDrumPattern(
      track.instrumentId.includes('trap') ? 'Trap' : 'Electronic'
    );
    let written = 0;
    pattern.forEach((on, step) => {
      if (!on) return;
      // Keep the pattern musical: cycle kick, snare, hats per hit.
      const midi = this.DRUM_NOTES[written % this.DRUM_NOTES.length];
      this.musicManager.addNoteToTrack(track.id, {
        id: `ai_drum_${Date.now()}_${step}`,
        midi,
        step,
        length: 1,
        velocity: 0.9,
      });
      written++;
    });
    this.snack.success(
      `AI pattern · ${written} drum hit${written === 1 ? '' : 's'} written to ${track.name}`
    );
  }

  async generateChords() {
    const track = this.selectedTrack();
    if (!track) return;
    const chordMidis = await this.aiService.generateChordProgression(
      'C',
      'minor'
    );
    chordMidis.forEach((midi, i) => {
      this.musicManager.addNoteToTrack(track.id, {
        id: `ai_chord_${Date.now()}_${i}`,
        midi,
        step: i * 16,
        length: 4,
        velocity: 0.8,
      });
    });
  }

  getSmartAdvice() {
    const advice = this.aiService.getSmartMixAdvice(this.musicManager.tracks());
    // The track inspector is a compact side panel — a blocking alert() was
    // hostile on mobile. Surface the advice in the snackbar instead.
    this.snack.show(advice || 'Mix is healthy — nothing to adjust');
  }

  // ── Audio sample-processor (wired to the Audio Import engine) ──

  /** Cycle pitch in semitones (-12..+12) for the linked audio file. */
  setAudioPitch(semitones: number): void {
    if (!this.linkedAudio()) {
      this.snack.info('Import the audio file first (Studio → Audio Import)');
      return;
    }
    this.audioImport.setPitchSemitones(semitones);
    this.snack.info(`Pitch ${semitones >= 0 ? '+' : ''}${semitones} st — applied on export`);
  }

  /** Peak-normalize the linked audio file via the Audio Import pipeline. */
  normalizeAudio(): void {
    if (!this.linkedAudio()) {
      this.snack.info('Import the audio file first (Studio → Audio Import)');
      return;
    }
    this.audioImport.toggleNormalize(!this.linkedAudio()?.normalize);
    this.snack.success(
      this.linkedAudio()?.normalize
        ? 'Normalize ON — applied on export'
        : 'Normalize OFF'
    );
  }

  getParam(key: string): any {
    return this.selectedTrack()?.synthParams?.[key] || 0;
  }
}
