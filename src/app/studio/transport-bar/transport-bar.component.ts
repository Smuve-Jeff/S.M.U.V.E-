import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';

@Component({
  selector: 'app-transport-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transport-bar.component.html',
  styleUrls: ['./transport-bar.component.css'],
})
export class TransportBarComponent {
  private readonly audioSession = inject(AudioSessionService);

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  isStopped = this.audioSession.isStopped;
  masterVolume = this.audioSession.masterVolume;

  togglePlay(): void {
    this.audioSession.togglePlay();
  }

  toggleRecord(): void {
    this.audioSession.toggleRecord();
  }

  stop(): void {
    this.audioSession.stop();
  }

  updateMasterVolume(event: Event): void {
    const newVolume = (event.target as HTMLInputElement).valueAsNumber;
    this.audioSession.updateMasterVolume(newVolume);
  }
}
