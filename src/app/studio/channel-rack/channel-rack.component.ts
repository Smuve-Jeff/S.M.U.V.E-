import { LoggingService } from '../../services/logging.service';
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css'],
})
export class ChannelRackComponent {
  private logger = inject(LoggingService);
  public musicManager = inject(MusicManagerService);
  private engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);

  tracks = this.musicManager.tracks;
  currentStep = this.engine.currentBeat;
  availablePresets = this.instruments.getPresets();

  steps = new Array(16).fill(0);

  selectedIds = signal<Set<number>>(new Set());
  draggedIndex = -1;
  selectedPatternSlotId = signal<string | null>(null);

  toggleStep(track: TrackModel, index: number) {
    this.musicManager.toggleStep(track.id, index);
  }

  selectTrack(track: TrackModel) {
    this.logger.info('ChannelRack: Selecting track:', track.name, track.id);
    this.musicManager.selectedTrackId.set(track.id);
  }

  toggleSelection(trackId: number, event: Event) {
    event.stopPropagation();
    const current = new Set(this.selectedIds());
    if (current.has(trackId)) current.delete(trackId);
    else current.add(trackId);
    this.selectedIds.set(current);
  }

  addTrack() {
    this.musicManager.ensureTrack('synth-lead');
  }

  importAudio() {
    this.musicManager.importAudioTrack();
  }

  removeTrack(id: number) {
    this.musicManager.removeTrack(id);
  }

  batchMute(mute: boolean) {
    const ids = Array.from(this.selectedIds());
    if (ids.length > 0) {
      this.musicManager.batchMute(ids, mute);
    }
  }

  onDragStart(index: number) {
    this.draggedIndex = index;
  }

  onDragOver(event: Event) {
    event.preventDefault();
  }

  onDrop(index: number) {
    if (this.draggedIndex !== -1 && this.draggedIndex !== index) {
      this.musicManager.reorderTrack(this.draggedIndex, index);
    }
    this.draggedIndex = -1;
  }

  updateVolume(track: TrackModel, event: any) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) =>
        t.id === track.id ? { ...t, gain: +event.target.value / 100 } : t
      )
    );
  }

  updatePan(track: TrackModel, event: any) {
    this.musicManager.tracks.update((ts) =>
      ts.map((t) =>
        t.id === track.id ? { ...t, pan: +event.target.value / 100 } : t
      )
    );
  }

  toggleMute(track: TrackModel) {
    this.musicManager.toggleMute(track.id);
  }

  updateInstrument(track: TrackModel, presetId: string) {
    this.musicManager.setInstrument(track.id, presetId);
  }

  createPatternSlot(track: TrackModel) {
    this.musicManager.createPatternSlot(track.id, `${track.name} Pattern`);
  }

  duplicatePatternSlot(track: TrackModel) {
    const slotId = track.activePatternSlotId ?? track.patternSlots?.[0]?.id;
    if (!slotId) return;
    this.musicManager.duplicatePatternSlot(track.id, slotId);
  }

  savePatternVersion(track: TrackModel) {
    const slotId = track.activePatternSlotId ?? track.patternSlots?.[0]?.id;
    if (!slotId) return;
    this.musicManager.snapshotPatternVersion(track.id, slotId, `Version ${Date.now()}`);
  }

  recallPattern(track: TrackModel, slotId: string) {
    this.musicManager.recallPatternSlot(track.id, slotId);
  }

  fillPattern(track: TrackModel) {
    this.musicManager.fillPatternLane(track.id, 0.5);
  }

  clearPattern(track: TrackModel) {
    this.musicManager.clearPatternLane(track.id);
  }

  rotatePattern(track: TrackModel, shift: number) {
    this.musicManager.rotatePatternLane(track.id, shift);
  }

  randomizePattern(track: TrackModel) {
    this.musicManager.randomizePatternLane(track.id, 0.4);
  }

  setStepAccent(track: TrackModel, index: number, event: Event) {
    event.stopPropagation();
    const current = track.stepVelocities?.[index] ?? 1;
    const next = current >= 1.2 ? 0.8 : current >= 1 ? 1.2 : 1;
    this.musicManager.setStepVelocity(track.id, index, next);
  }

  getStepVelocity(track: TrackModel, index: number): number {
    return track.stepVelocities?.[index] ?? 1;
  }

  setTrackQuality(track: TrackModel, mode: 'ultra' | 'performance') {
    this.musicManager.setTrackQualityMode(track.id, mode);
  }
}
