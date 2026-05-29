import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../../audio-session.service';
import { AudioEngineService } from '../../../services/audio-engine.service';
import { KnobComponent } from '../../shared/knob/knob.component';

@Component({
  selector: 'app-universal-master',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  template: `
    <div class="universal-master glass-v42 wood-panel shadow-v42-xl border-b border-white/10">
      <div class="master-grid flex items-center justify-between px-6 py-3 gap-8">

        <!-- Transport Cluster -->
        <div class="transport-cluster glass-v42 p-1 rounded-xl border border-white/5 flex gap-1">
          <button class="transport-btn tactile-v42" (click)="stop()" [class.active]="isStopped()">
            <span class="material-symbols-outlined text-sm">stop</span>
          </button>
          <button class="transport-btn play-pause tactile-v42" (click)="togglePlay()" [class.active]="isPlaying()">
            <span class="material-symbols-outlined">{{ isPlaying() ? 'pause' : 'play_arrow' }}</span>
          </button>
          <button class="transport-btn record tactile-v42" (click)="toggleRecord()" [class.recording]="isRecording()">
            <span class="material-symbols-outlined text-sm">fiber_manual_record</span>
          </button>
        </div>

        <!-- Global Macros -->
        <div class="macro-cluster hidden lg:flex items-center gap-6 border-l border-white/5 pl-8">
           <app-knob label="GRIT" [min]="0" [max]="100" [value]="30" [showValue]="false" (valueChange)="applyMacro('grit', $event)"></app-knob>
           <app-knob label="SPACE" [min]="0" [max]="100" [value]="15" [showValue]="false" (valueChange)="applyMacro('space', $event)"></app-knob>
           <app-knob label="WIDTH" [min]="0" [max]="100" [value]="80" [showValue]="false" (valueChange)="applyMacro('width', $event)"></app-knob>
        </div>

        <!-- Master Knobs -->
        <div class="knob-cluster flex gap-6 items-center flex-1 justify-center">
          <app-knob
            label="MASTER"
            [min]="0"
            [max]="100"
            [value]="masterVolume()"
            unit="%"
            (valueChange)="updateMasterVolume($event)">
          </app-knob>

          <app-knob
            label="TEMPO"
            [min]="20"
            [max]="300"
            [value]="audioEngine.tempo()"
            unit=" BPM"
            (valueChange)="audioEngine.tempo.set($event)">
          </app-knob>

          <app-knob
            label="METRO"
            [min]="0"
            [max]="100"
            [value]="audioEngine.metronomeVolume() * 100"
            unit="%"
            (valueChange)="updateMetronomeVolume($event)">
          </app-knob>
        </div>

        <!-- System Stats -->
        <div class="system-stats hidden xl:flex flex-col gap-1 items-end border-l border-white/5 pl-8">
           <div class="master-indicator flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-white/5">
              <div class="status-led" [class.active]="isPlaying()" [class.recording]="isRecording()"></div>
              <span class="status-text text-[8px] font-black tracking-widest text-slate-500">
                {{ isRecording() ? 'RECORDING' : isPlaying() ? 'MASTER_LIVE' : 'ENGINE_IDLE' }}
              </span>
           </div>
           <span class="text-[7px] font-mono text-slate-700 uppercase tracking-tighter">S.M.U.V.E Audio Engine v4.2 PRO</span>
        </div>

        <!-- Metronome Toggle -->
        <div class="advanced-toggle border-l border-white/5 pl-8">
          <button class="metronome-btn tactile-v42 w-10 h-10 rounded-lg flex items-center justify-center border border-white/5"
                  [class.active]="audioEngine.metronomeEnabled()"
                  (click)="audioEngine.toggleMetronome()">
            <span class="material-symbols-outlined text-sm">metronome</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .universal-master {
      user-select: none;
      z-index: 50;
    }
    .status-led {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #222;
      transition: all 0.3s;
    }
    .status-led.active {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .status-led.recording {
      background: #ef4444 !important;
      box-shadow: 0 0 10px #ef4444 !important;
      animation: pulse 1s infinite;
    }
    .transport-btn {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #7a7a9a;
    }
    .transport-btn.active {
      background: rgba(0, 229, 255, 0.1);
      color: #00e5ff;
      border-color: #00e5ff;
    }
    .transport-btn.recording.active {
      color: #ef4444;
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
    }
    .metronome-btn.active {
      color: #a855f7;
      border-color: #a855f7;
      box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @media (max-width: 768px) {
      .knob-cluster { gap: 10px; }
      .system-stats, .advanced-toggle, .macro-cluster { display: none; }
      .master-grid { padding: 10px; justify-content: center; }
    }
  `]
})
export class UniversalMasterComponent {
  private readonly audioSession = inject(AudioSessionService);
  readonly audioEngine = inject(AudioEngineService);

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  isStopped = this.audioSession.isStopped;
  masterVolume = this.audioSession.masterVolume;

  togglePlay(): void { this.audioSession.togglePlay(); }
  toggleRecord(): void { this.audioSession.toggleRecord(); }
  stop(): void { this.audioSession.stop(); }

  updateMasterVolume(val: number): void {
    this.audioSession.updateMasterVolume(val);
  }

  updateMetronomeVolume(val: number): void {
    this.audioEngine.setMetronomeVolume(val / 100);
  }

  applyMacro(type: string, value: number) {
    if (type === 'grit') {
       this.audioEngine.setSaturation(value / 100);
    } else if (type === 'space') {
       if (this.audioEngine.reverbWet) {
          this.audioEngine.reverbWet.gain.setValueAtTime(value / 100, this.audioEngine.ctx.currentTime);
       }
    } else if (type === 'width') {
       // Width logic could involve a mid-side processor or panning spread
       console.log('Global Width Macro set to', value);
    }
  }
}
