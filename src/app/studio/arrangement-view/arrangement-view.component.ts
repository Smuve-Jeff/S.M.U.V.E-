import {
  Component,
  signal,
  computed,
  inject,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import {
  MusicManagerService,
  ArrangementClip,
} from '../../services/music-manager.service';

@Component({
  selector: 'app-arrangement-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './arrangement-view.component.html',
  styleUrls: ['./arrangement-view.component.css'],
})
export class ArrangementViewComponent {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);

  @ViewChild('gridCanvas') gridCanvas!: ElementRef;
  bars = Array.from({ length: 64 }, (_, i) => i);
  barWidth = 100;
  gridWidth = 64 * 100;
  snapEnabled = signal(true);
  isDragging = signal(false);
  isLocalPlayback = signal(false);
  isLocalPlaying = signal(false);
  isLocalRecording = signal(false);

  playheadPos = computed(
    () => (this.musicManager.currentStep() / 16) * this.barWidth
  );
  tracks = this.musicManager.tracks;
  trackHeaderHeight = computed(() => 80);

  addTrack(): void {
    this.musicManager.ensureTrack('grand-piano');
  }
  selectTrack(trackId: number): void {
    this.musicManager.selectedTrackId.set(trackId);
  }
  isTrackSelected(trackId: number): boolean {
    return this.musicManager.selectedTrackId() === trackId;
  }
  toggleMute(trackId: number): void {
    this.musicManager.toggleMute(trackId);
  }
  toggleSolo(trackId: number): void {
    this.musicManager.toggleSolo(trackId);
  }
  onDragOver(event: DragEvent) {
    event.preventDefault();
  }
  onDrop(event: DragEvent, trackId: number) {
    event.preventDefault();
  }
}
