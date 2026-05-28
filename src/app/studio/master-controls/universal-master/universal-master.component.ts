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
    <div class="universal-master glass-v42 wood-panel shadow-v42-xl">
      <!-- Branding & Master Status -->
      <div class="master-header">
        <div class="branding">
          <span class="neon-text font-black text-xs tracking-tighter"
            >UNIVERSAL MASTER</span
          >
          <span class="version text-[8px] opacity-50">S.M.U.V.E v4.2</span>
        </div>
        <div class="master-indicator" [class.active]="isPlaying()">
          <div class="status-led" [class.recording]="isRecording()"></div>
          <span class="status-text">{{
            isRecording() ? 'RECORDING' : isPlaying() ? 'LIVE' : 'IDLE'
          }}</span>
        </div>
      </div>

      <div class="master-grid">
        <!-- Transport Cluster -->
        <div class="transport-cluster glass-v42">
          <button
            class="transport-btn tactile-v42"
            (click)="stop()"
            [class.active]="isStopped()"
          >
            <span class="material-symbols-outlined">stop</span>
          </button>
          <button
            class="transport-btn play-pause tactile-v42"
            (click)="togglePlay()"
            [class.active]="isPlaying()"
          >
            <span class="material-symbols-outlined">{{
              isPlaying() ? 'pause' : 'play_arrow'
            }}</span>
          </button>
          <button class="transport-btn skip tactile-v42" (click)="skip()">
            <span class="material-symbols-outlined">skip_next</span>
          </button>
          <button
            class="transport-btn record tactile-v42"
            (click)="toggleRecord()"
            [class.recording]="isRecording()"
          >
            <span class="material-symbols-outlined">fiber_manual_record</span>
          </button>
          <button class="transport-btn upload tactile-v42" (click)="upload()">
            <span class="material-symbols-outlined">cloud_upload</span>
          </button>
        </div>

        <!-- Master Knobs -->
        <div class="knob-cluster">
          <app-knob
            label="OUTPUT"
            [min]="0"
            [max]="100"
            [value]="masterVolume()"
            unit="%"
            (valueChange)="updateMasterVolume($event)"
          >
          </app-knob>

          <app-knob
            label="TEMPO"
            [min]="20"
            [max]="300"
            [value]="audioEngine.tempo()"
            unit=" BPM"
            (valueChange)="audioEngine.tempo.set($event)"
          >
          </app-knob>

          <app-knob
            label="METRO"
            [min]="0"
            [max]="100"
            [value]="audioEngine.metronomeVolume() * 100"
            unit="%"
            (valueChange)="updateMetronomeVolume($event)"
          >
          </app-knob>
        </div>

        <!-- Advanced Controls Toggle -->
        <div class="advanced-toggle">
          <button
            class="metronome-btn tactile-v42"
            [class.active]="audioEngine.metronomeEnabled()"
            (click)="audioEngine.toggleMetronome()"
          >
            <span class="material-symbols-outlined">metronome</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .universal-master {
        padding: 16px;
        border-radius: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 320px;
        user-select: none;
      }
      .master-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .branding {
        display: flex;
        flex-direction: column;
      }
      .master-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 0, 0, 0.3);
        padding: 4px 10px;
        border-radius: 100px;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }
      .status-led {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #333;
      }
      .master-indicator.active .status-led {
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }
      .status-led.recording {
        background: #ef4444 !important;
        box-shadow: 0 0 8px #ef4444 !important;
        animation: pulse 1s infinite;
      }
      .status-text {
        font-size: 8px;
        font-weight: 900;
        letter-spacing: 0.1em;
        color: #7a7a9a;
      }
      .master-grid {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .transport-cluster {
        display: flex;
        gap: 8px;
        padding: 8px;
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.2);
      }
      .transport-btn {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: #7a7a9a;
        transition: all 0.2s;
      }
      .transport-btn.active {
        background: rgba(236, 91, 19, 0.1);
        border-color: #ec5b13;
        color: #ec5b13;
        box-shadow: 0 0 15px rgba(236, 91, 19, 0.2);
      }
      .transport-btn.recording.active {
        color: #ef4444;
        border-color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }
      .knob-cluster {
        display: flex;
        gap: 16px;
      }
      .metronome-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #7a7a9a;
      }
      .metronome-btn.active {
        color: #a855f7;
        border-color: #a855f7;
        box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);
      }
      @keyframes pulse {
        0% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
        100% {
          opacity: 1;
        }
      }
      @media (max-width: 640px) {
        .universal-master {
          min-width: 0;
          width: 100%;
        }
        .transport-btn {
          width: 44px;
          height: 44px;
        }
      }
    `,
  ],
})
export class UniversalMasterComponent {
  private readonly audioSession = inject(AudioSessionService);
  readonly audioEngine = inject(AudioEngineService);

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

  skip(): void {
    // Basic skip implementation - forward 1 bar or similar
    // For now just logging, can be expanded to actual transport skip
    console.log('Master Skip Triggered');
  }

  upload(): void {
    console.log('Master Upload Triggered');
  }

  updateMasterVolume(val: number): void {
    this.audioSession.updateMasterVolume(val);
  }

  updateMetronomeVolume(val: number): void {
    this.audioEngine.setMetronomeVolume(val / 100);
  }
}
