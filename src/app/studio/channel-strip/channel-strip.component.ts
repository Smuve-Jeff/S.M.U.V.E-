import {
  Component,
  Input,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService, MicChannel } from '../audio-session.service';

@Component({
  selector: 'app-channel-strip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-strip.component.html',
  styleUrls: ['./channel-strip.component.css'],
})
export class ChannelStripComponent implements OnInit, OnDestroy {
  @Input({ required: true }) channel!: MicChannel;
  public readonly audioSession = inject(AudioSessionService);

  showSettings = signal(false);
  visualizerHeights = signal<number[]>([]);
  /** Meter-simulation tick handle — cleared on destroy. */
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    // Initialize heights to prevent ExpressionChangedAfterItHasBeenCheckedError
    this.visualizerHeights.set(
      Array.from({ length: 12 }, () => 5 + Math.random() * 80)
    );

    // Simulate activity if armed — keep the handle so the tick dies with the
    // strip (a stray interval would keep writing to a destroyed component).
    this.meterTimer = setInterval(() => {
      if (this.channel.armed) {
        this.visualizerHeights.update((h) =>
          h.map((val) =>
            Math.max(5, Math.min(90, val + (Math.random() - 0.5) * 20))
          )
        );
      }
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.meterTimer !== null) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
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

  toggleSettings(): void {
    this.showSettings.update((v) => !v);
  }

  updateDevice(event: any): void {
    this.audioSession.initializeMic(this.channel.id, event.target.value);
  }
}
