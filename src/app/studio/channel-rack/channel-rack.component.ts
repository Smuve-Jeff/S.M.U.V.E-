import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SequencerService, SequencerTrack } from '../sequencer.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css']
})
export class ChannelRackComponent {
  public sequencer = inject(SequencerService);
  private engine = inject(AudioEngineService);
  private instruments = inject(InstrumentsService);

  activePattern = this.sequencer.activePattern;
  currentStep = this.engine.currentBeat;
  availablePresets = this.instruments.getPresets();

  steps = new Array(16).fill(0);

  toggleStep(track: SequencerTrack, index: number) {
    this.sequencer.toggleStep(track.id, index);
  }

  selectTrack(track: SequencerTrack) {
    console.log('ChannelRack: Selecting track:', track.name, track.id);
    this.sequencer.selectTrack(track.id);
  }

  addTrack() {
    this.sequencer.addTrack('New Track', 'synth-lead');
  }

  removeTrack(id: string) {
    this.sequencer.removeTrack(id);
  }

  updateVolume(track: SequencerTrack, event: any) {
    track.volume = +event.target.value;
  }

  updatePan(track: SequencerTrack, event: any) {
    track.pan = +event.target.value;
  }

  toggleMute(track: SequencerTrack) {
    track.mute = !track.mute;
  }
}
