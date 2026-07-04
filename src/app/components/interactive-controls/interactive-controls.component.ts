import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InteractiveCapabilitiesService } from '../../services/interactive-capabilities.service';
import { LoggingService } from '../../services/logging.service';

@Component({
  selector: 'app-interactive-controls',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="interactive-controls">
      <div class="controls-header">
        <h3>Interactive Controls</h3>
      </div>

      <!-- Voice Controls -->
      <div class="control-group">
        <div class="control-label">Voice Communication</div>
        <div class="button-group">
          <button
            class="control-btn voice-btn"
            [class.active]="isVoiceActive()"
            (click)="toggleVoiceCall()"
            [disabled]="voiceLoading()"
          >
            <span class="icon">🎤</span>
            <span>{{ isVoiceActive() ? 'End Call' : 'Start Voice' }}</span>
            <span *ngIf="voiceLoading()" class="spinner"></span>
          </button>
          <button
            class="control-btn micro-toggle"
            [class.muted]="!isMicEnabled()"
            (click)="toggleMicrophone()"
            *ngIf="isVoiceActive()"
          >
            <span>{{ isMicEnabled() ? '🎙️' : '🔇' }}</span>
          </button>
        </div>
      </div>

      <!-- Streaming Controls -->
      <div class="control-group">
        <div class="control-label">Stream Performance</div>
        <div class="button-group">
          <button
            class="control-btn stream-btn"
            [class.active]="isStreamingActive()"
            (click)="toggleStreaming()"
            [disabled]="streamLoading()"
          >
            <span class="icon">📡</span>
            <span>{{ isStreamingActive() ? 'Stop Stream' : 'Go Live' }}</span>
            <span *ngIf="streamLoading()" class="spinner"></span>
          </button>
          <select class="stream-platform" *ngIf="!isStreamingActive()" [(ngModel)]="selectedPlatform">
            <option value="youtube">YouTube</option>
            <option value="twitch">Twitch</option>
            <option value="custom">Custom RTMP</option>
          </select>
        </div>
      </div>

      <!-- Recording Controls -->
      <div class="control-group">
        <div class="control-label">Collaborative Recording</div>
        <div class="button-group">
          <button
            class="control-btn record-btn"
            [class.active]="isRecording()"
            (click)="toggleRecording()"
            [disabled]="recordLoading()"
          >
            <span class="icon">⏺️</span>
            <span>{{ isRecording() ? 'Stop Rec' : 'Record' }}</span>
            <span *ngIf="recordLoading()" class="spinner"></span>
          </button>
          <button
            class="control-btn pause-btn"
            *ngIf="isRecording()"
            [class.paused]="isPaused()"
            (click)="toggleRecordingPause()"
          >
            <span>{{ isPaused() ? '▶️' : '⏸️' }}</span>
          </button>
        </div>
      </div>

      <!-- Performance Mode -->
      <div class="control-group">
        <div class="control-label">Performance Mode</div>
        <div class="button-group horizontal">
          <button
            class="control-btn perf-btn"
            [class.active]="performanceMode() === 'ultra'"
            (click)="setPerformanceMode('ultra')"
          >
            <span>⚡ Ultra</span>
          </button>
          <button
            class="control-btn perf-btn"
            [class.active]="performanceMode() === 'balanced'"
            (click)="setPerformanceMode('balanced')"
          >
            <span>⚖️ Balanced</span>
          </button>
          <button
            class="control-btn perf-btn"
            [class.active]="performanceMode() === 'power'"
            (click)="setPerformanceMode('power')"
          >
            <span>🔋 Power</span>
          </button>
        </div>
      </div>

      <!-- Audio Effects -->
      <div class="control-group">
        <div class="control-label">Audio Processing</div>
        <div class="slider-group">
          <div class="slider-item">
            <label>Compression</label>
            <input type="range" min="0" max="100" [(ngModel)]="compressionLevel" (change)="applyCompression()">
            <span class="value">{{ compressionLevel }}%</span>
          </div>
          <div class="slider-item">
            <label>Saturation</label>
            <input type="range" min="0" max="100" [(ngModel)]="saturationLevel" (change)="applySaturation()">
            <span class="value">{{ saturationLevel }}%</span>
          </div>
          <div class="slider-item">
            <label>Master Level</label>
            <input type="range" min="0" max="100" [(ngModel)]="masterLevel" (change)="setMasterLevel()">
            <span class="value">{{ masterLevel }}%</span>
          </div>
        </div>
      </div>

      <!-- Status Feedback -->
      <div class="status-feedback" [class.active]="statusMessage()">
        <span>{{ statusMessage() }}</span>
      </div>
    </div>

    <style>
      .interactive-controls {
        padding: 16px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(20, 20, 40, 0.95) 100%);
        border-radius: 12px;
        border: 1px solid rgba(100, 150, 255, 0.3);
        max-width: 500px;
      }

      .controls-header {
        margin-bottom: 16px;
        border-bottom: 1px solid rgba(100, 150, 255, 0.2);
        padding-bottom: 8px;

        h3 {
          margin: 0;
          color: #88ccff;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          font-weight: bold;
        }
      }

      .control-group {
        margin-bottom: 16px;
      }

      .control-label {
        color: #aabbdd;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-family: 'Courier New', monospace;
      }

      .button-group {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;

        &.horizontal {
          justify-content: space-between;
        }
      }

      .control-btn {
        flex: 1;
        min-width: 80px;
        padding: 8px 12px;
        background: rgba(40, 60, 100, 0.6);
        border: 1px solid rgba(100, 150, 255, 0.3);
        color: #88ccff;
        border-radius: 6px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.3s ease;

        &:hover:not(:disabled) {
          background: rgba(60, 100, 150, 0.7);
          border-color: rgba(100, 200, 255, 0.6);
          box-shadow: 0 0 8px rgba(100, 150, 255, 0.3);
        }

        &.active {
          background: rgba(0, 150, 100, 0.5);
          border-color: #00ff88;
          box-shadow: 0 0 12px rgba(0, 255, 136, 0.4);
          color: #00ff88;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .icon {
          font-size: 12px;
        }

        .spinner {
          display: inline-block;
          width: 8px;
          height: 8px;
          border: 1px solid rgba(100, 200, 255, 0.5);
          border-top-color: #00ff88;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      }

      .micro-toggle {
        flex: 0.5;

        &.muted {
          background: rgba(150, 50, 50, 0.5);
          border-color: rgba(255, 100, 100, 0.5);
          color: #ff6666;

          &:hover {
            box-shadow: 0 0 8px rgba(255, 100, 100, 0.3);
          }
        }
      }

      .stream-platform {
        flex: 1;
        padding: 8px 12px;
        background: rgba(40, 60, 100, 0.6);
        border: 1px solid rgba(100, 150, 255, 0.3);
        color: #88ccff;
        border-radius: 6px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        cursor: pointer;

        option {
          background: rgba(20, 20, 40, 0.9);
          color: #88ccff;
        }
      }

      .perf-btn {
        flex: 1;
      }

      .slider-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .slider-item {
        display: flex;
        align-items: center;
        gap: 8px;

        label {
          color: #aabbdd;
          font-size: 10px;
          min-width: 60px;
          font-family: 'Courier New', monospace;
        }

        input[type='range'] {
          flex: 1;
          height: 4px;
          background: rgba(50, 50, 80, 0.8);
          border: none;
          border-radius: 2px;
          outline: none;
          -webkit-appearance: none;

          &::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 12px;
            height: 12px;
            background: #00ccff;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 4px rgba(0, 204, 255, 0.6);
          }

          &::-moz-range-thumb {
            width: 12px;
            height: 12px;
            background: #00ccff;
            border-radius: 50%;
            cursor: pointer;
            border: none;
            box-shadow: 0 0 4px rgba(0, 204, 255, 0.6);
          }
        }

        .value {
          color: #00ccff;
          font-size: 10px;
          font-family: 'Courier New', monospace;
          min-width: 30px;
          text-align: right;
          font-weight: bold;
        }
      }

      .status-feedback {
        padding: 8px 12px;
        background: rgba(50, 50, 80, 0.6);
        border-left: 2px solid rgba(100, 150, 255, 0.3);
        color: #aabbdd;
        font-size: 10px;
        font-family: 'Courier New', monospace;
        border-radius: 4px;
        display: none;

        &.active {
          display: block;
          animation: slideIn 0.3s ease;
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    </style>
  `,
  styles: [],
})
export class InteractiveControlsComponent {
  private interactiveService = inject(InteractiveCapabilitiesService);
  private logger = inject(LoggingService);

  // State signals
  isVoiceActive = signal(false);
  isStreamingActive = signal(false);
  isRecording = signal(false);
  isPaused = signal(false);
  isMicEnabled = signal(true);

  voiceLoading = signal(false);
  streamLoading = signal(false);
  recordLoading = signal(false);

  performanceMode = signal<'ultra' | 'balanced' | 'power'>('ultra');
  selectedPlatform = signal<'youtube' | 'twitch' | 'custom'>('youtube');

  compressionLevel = signal(50);
  saturationLevel = signal(30);
  masterLevel = signal(70);

  statusMessage = signal('');

  constructor() {
    this.syncStateWithService();
  }

  private syncStateWithService() {
    setInterval(() => {
      const state = this.interactiveService.interactiveState();
      this.isVoiceActive.set(state.isVoiceActive);
      this.isStreamingActive.set(state.isStreamingActive);
      this.isRecording.set(state.isCollaborating);
    }, 100);
  }

  async toggleVoiceCall(): Promise<void> {
    if (this.isVoiceActive()) {
      this.interactiveService.endVoiceCall();
      this.isVoiceActive.set(false);
      this.showStatus('Voice call ended');
    } else {
      this.voiceLoading.set(true);
      try {
        // In real scenario, select a user to call
        const success = await this.interactiveService.startVoiceCall('user_dummy');
        if (success) {
          this.isVoiceActive.set(true);
          this.showStatus('Voice call started');
        } else {
          this.showStatus('Failed to start voice call');
        }
      } finally {
        this.voiceLoading.set(false);
      }
    }
  }

  toggleMicrophone(): void {
    this.isMicEnabled.update(v => !v);
    this.showStatus(`Microphone ${this.isMicEnabled() ? 'enabled' : 'muted'}`);
  }

  async toggleStreaming(): Promise<void> {
    if (this.isStreamingActive()) {
      this.streamLoading.set(true);
      try {
        await this.interactiveService.stopStreaming();
        this.isStreamingActive.set(false);
        this.showStatus('Stream stopped');
      } finally {
        this.streamLoading.set(false);
      }
    } else {
      this.streamLoading.set(true);
      try {
        const success = await this.interactiveService.startStreaming(this.selectedPlatform() as any);
        if (success) {
          this.isStreamingActive.set(true);
          this.showStatus(`Streaming to ${this.selectedPlatform()}`);
        } else {
          this.showStatus('Failed to start stream');
        }
      } finally {
        this.streamLoading.set(false);
      }
    }
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      this.recordLoading.set(true);
      try {
        await this.interactiveService.stopCollaborativeRecording();
        this.isRecording.set(false);
        this.isPaused.set(false);
        this.showStatus('Recording stopped');
      } finally {
        this.recordLoading.set(false);
      }
    } else {
      this.recordLoading.set(true);
      try {
        const success = await this.interactiveService.startCollaborativeRecording();
        if (success) {
          this.isRecording.set(true);
          this.showStatus('Recording started');
        } else {
          this.showStatus('Failed to start recording');
        }
      } finally {
        this.recordLoading.set(false);
      }
    }
  }

  toggleRecordingPause(): void {
    if (this.isPaused()) {
      this.interactiveService.resumeCollaborativeRecording();
      this.isPaused.set(false);
      this.showStatus('Recording resumed');
    } else {
      this.interactiveService.pauseCollaborativeRecording();
      this.isPaused.set(true);
      this.showStatus('Recording paused');
    }
  }

  setPerformanceMode(mode: 'ultra' | 'balanced' | 'power'): void {
    this.performanceMode.set(mode);
    this.showStatus(`Performance mode: ${mode}`);
  }

  applyCompression(): void {
    const level = this.compressionLevel() / 100;
    this.interactiveService.audioEngine.configureCompressor({
      threshold: -20,
      ratio: 4,
      attack: 0.003,
      release: 0.1,
    });
  }

  applySaturation(): void {
    this.interactiveService.audioEngine.setSaturation(this.saturationLevel() / 100);
  }

  setMasterLevel(): void {
    this.interactiveService.audioEngine.setMasterOutputLevel(this.masterLevel() / 100);
  }

  private showStatus(message: string): void {
    this.statusMessage.set(message);
    setTimeout(() => this.statusMessage.set(''), 3000);
  }

  private get audioEngine() {
    return this.interactiveService.audioEngine;
  }
}
