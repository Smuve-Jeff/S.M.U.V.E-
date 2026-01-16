import { Component, Input, inject } from '@angular/core';
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
  private readonly audioSession = inject(AudioSessionService);
  // Template-friendly math helpers (avoid exposing the full global Math object)
  protected floor(val: number): number {
    return Math.floor(val);
  }

  protected ceil(val: number): number {
    return Math.ceil(val);
  }

  protected round(val: number): number {
    return Math.round(val);
  }

  protected abs(val: number): number {
    return Math.abs(val);
  }

  protected min(...values: number[]): number {
    return Math.min(...values);
  }

  protected max(...values: number[]): number {
    return Math.max(...values);
  }

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
}
