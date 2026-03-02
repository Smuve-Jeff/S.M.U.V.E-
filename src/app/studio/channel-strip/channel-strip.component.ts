import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService, MicChannel } from '../audio-session.service';

@Component({
  selector: 'app-channel-strip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-strip.component.html',
  styleUrls: ['./channel-strip.component.css'],
})
export class ChannelStripComponent {
  @Input({ required: true }) channel!: MicChannel;
  public readonly audioSession = inject(AudioSessionService);
  protected readonly Math = Math;

  showSettings = signal(false);

  updateLevel(newLevel: number): void {
    this.audioSession.updateChannelLevel(this.channel.id, newLevel);
  }

  toggleMute(): void {
    this.audioSession.toggleChannelMute(this.channel.id);
  }

  updatePan(newPan: number): void {
    this.audioSession.updateChannelPan(this.channel.id, newPan);
  }

  toggleArm(): void {
    this.audioSession.toggleChannelArm(this.channel.id);
  }

  toggleSettings(): void {
    this.showSettings.update(v => !v);
  }

  updateDevice(event: any): void {
    this.audioSession.initializeMic(this.channel.id, event.target.value);
  }
}
