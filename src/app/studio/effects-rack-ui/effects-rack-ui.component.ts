import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';

@Component({
  selector: 'app-effects-rack-ui',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './effects-rack-ui.component.html',
  styleUrls: ['./effects-rack-ui.component.css'],
})
export class EffectsRackUiComponent {
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);

  selectedTrack = this.musicManager.selectedTrack;
  activeSlot = signal(1);

  fxSlots = computed(() => {
    const track = this.selectedTrack();
    return track?.fxSlots || [];
  });

  toggleFx(slotId: string) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.tracks.update(ts => ts.map(t => t.id === track.id ? {
      ...t,
      fxSlots: t.fxSlots.map(s => s.id === slotId ? { ...s, enabled: !s.enabled } : s)
    } : t));
  }
}
