import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InteractiveCapabilitiesService, RemoteParticipant } from '../../services/interactive-capabilities.service';
import { AudioEngineService } from '../../services/audio-engine.service';

@Component({
  selector: 'app-interactive-status-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="interactive-status-panel">
      <!-- Voice Status -->
      <div class="status-section voice-section" [class.active]="(interactiveService.interactiveState()).isVoiceActive">
        <div class="section-header">
          <span class="icon">🎤</span>
          <span class="label">Voice</span>
          <div class="status-indicator" [class.active]="(interactiveService.interactiveState()).isVoiceActive"></div>
        </div>
        <div class="section-content" *ngIf="(interactiveService.interactiveState()).isVoiceActive">
          <div class="level-meter">
            <div class="meter-label">Input: {{ (interactiveService.voiceInputLevel() | number: '1.0-0') }}%</div>
            <div class="meter-bar">
              <div class="meter-fill" [style.width.%]="interactiveService.voiceInputLevel()"></div>
            </div>
          </div>
          <div class="level-meter">
            <div class="meter-label">Output: {{ (interactiveService.voiceOutputLevel() | number: '1.0-0') }}%</div>
            <div class="meter-bar">
              <div class="meter-fill output" [style.width.%]="interactiveService.voiceOutputLevel()"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Streaming Status -->
      <div class="status-section streaming-section" [class.active]="(interactiveService.interactiveState()).isStreamingActive">
        <div class="section-header">
          <span class="icon">📡</span>
          <span class="label">Streaming</span>
          <div class="status-indicator" [class.active]="(interactiveService.interactiveState()).isStreamingActive"></div>
        </div>
      </div>

      <!-- Recording Status -->
      <div class="status-section recording-section" [class.active]="recordingActive()">
        <div class="section-header">
          <span class="icon">⏺️</span>
          <span class="label">Recording</span>
          <div class="status-indicator" [class.active]="recordingActive()"></div>
        </div>
        <div class="section-content" *ngIf="recordingActive()">
          <div class="recording-time">{{ recordingTimeFormatted() }}</div>
        </div>
      </div>

      <!-- Collaboration Status -->
      <div class="status-section collab-section">
        <div class="section-header">
          <span class="icon">👥</span>
          <span class="label">Participants</span>
          <span class="participant-count">{{ participantCount() }}</span>
        </div>
        <div class="section-content" *ngIf="participantCount() > 0">
          <div class="participants-list">
            <div *ngFor="let participant of (interactiveService.interactiveState()).remoteParticipants" class="participant-item">
              <div class="participant-name">{{ participant.displayName }}</div>
              <div class="participant-status">
                <span *ngIf="participant.isVoiceActive" class="badge voice-active">🎤 Active</span>
                <span *ngIf="participant.isStreaming" class="badge streaming">📡 Streaming</span>
              </div>
              <div class="participant-level" *ngIf="participant.isVoiceActive">
                <div class="level-bar">
                  <div class="level-fill" [style.width.%]="participant.inputLevel"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Metrics -->
      <div class="status-section performance-section">
        <div class="section-header">
          <span class="icon">⚙️</span>
          <span class="label">Performance</span>
        </div>
        <div class="section-content">
          <div class="metric-item">
            <span class="metric-label">CPU:</span>
            <span class="metric-value" [class.warning]="cpuWarning()">{{ (cpuLoad() | number: '1.0-0') }}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Audio:</span>
            <span class="metric-value">{{ audioLatency() | number: '1.0-1' }}ms</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Buffer:</span>
            <span class="metric-value" [class.warning]="bufferWarning()">{{ bufferHealth() }}%</span>
          </div>
        </div>
      </div>
    </div>

    <style>
      .interactive-status-panel {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        padding: 16px;
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(20, 20, 40, 0.9) 100%);
        border-radius: 12px;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        border: 1px solid rgba(100, 150, 255, 0.3);
      }

      .status-section {
        background: rgba(10, 10, 20, 0.7);
        border: 1px solid rgba(100, 150, 255, 0.2);
        border-radius: 8px;
        padding: 12px;
        transition: all 0.3s ease;

        &.active {
          border-color: rgba(100, 200, 255, 0.6);
          background: rgba(0, 50, 100, 0.4);
          box-shadow: 0 0 8px rgba(100, 200, 255, 0.3);
        }
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-weight: bold;
        color: #88ccff;
      }

      .icon {
        font-size: 14px;
      }

      .label {
        flex: 1;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(100, 150, 255, 0.3);
        transition: all 0.3s ease;

        &.active {
          background: #00ff00;
          box-shadow: 0 0 4px #00ff00;
          animation: pulse 1.5s infinite;
        }
      }

      .participant-count {
        background: rgba(100, 150, 255, 0.3);
        color: #88ccff;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
      }

      .section-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .level-meter {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .meter-label {
        font-size: 11px;
        color: #aabbdd;
      }

      .meter-bar {
        height: 6px;
        background: rgba(50, 50, 80, 0.8);
        border-radius: 3px;
        overflow: hidden;
        border: 1px solid rgba(100, 150, 255, 0.2);
      }

      .meter-fill {
        height: 100%;
        background: linear-gradient(90deg, #00ff00, #ffff00);
        border-radius: 3px;
        transition: width 0.1s linear;

        &.output {
          background: linear-gradient(90deg, #00ccff, #00ff88);
        }
      }

      .recording-time {
        font-size: 13px;
        font-weight: bold;
        color: #ff6666;
        text-align: center;
      }

      .participants-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .participant-item {
        background: rgba(30, 30, 50, 0.6);
        border-left: 2px solid #00ccff;
        padding: 6px 8px;
        border-radius: 4px;
      }

      .participant-name {
        font-weight: bold;
        color: #88ccff;
        font-size: 11px;
      }

      .participant-status {
        display: flex;
        gap: 4px;
        margin-top: 2px;
      }

      .badge {
        display: inline-block;
        font-size: 10px;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(100, 150, 255, 0.3);
        color: #88ccff;

        &.voice-active {
          background: rgba(0, 255, 0, 0.2);
          color: #00ff00;
        }

        &.streaming {
          background: rgba(255, 100, 100, 0.2);
          color: #ff6666;
        }
      }

      .participant-level {
        margin-top: 4px;

        .level-bar {
          height: 3px;
          background: rgba(50, 50, 80, 0.6);
          border-radius: 2px;
          overflow: hidden;
        }

        .level-fill {
          height: 100%;
          background: #00ccff;
          transition: width 0.1s linear;
        }
      }

      .metric-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid rgba(100, 150, 255, 0.1);

        &:last-child {
          border-bottom: none;
        }
      }

      .metric-label {
        color: #aabbdd;
      }

      .metric-value {
        color: #88ccff;
        font-weight: bold;
        font-family: 'Courier New', monospace;

        &.warning {
          color: #ffaa00;
        }
      }

      @keyframes pulse {
        0%, 100% {
          box-shadow: 0 0 4px #00ff00;
        }
        50% {
          box-shadow: 0 0 8px #00ff00;
        }
      }

      @media (max-width: 768px) {
        .interactive-status-panel {
          grid-template-columns: 1fr;
          gap: 8px;
          padding: 12px;
        }

        .section-header {
          font-size: 11px;
        }
      }
    </style>
  `,
  styles: [],
})
export class InteractiveStatusPanelComponent {
  private interactiveService = inject(InteractiveCapabilitiesService);
  private audioEngine = inject(AudioEngineService);

  interactiveService = inject(InteractiveCapabilitiesService);

  recordingActive = computed(() => {
    const state = this.interactiveService.interactiveState();
    return state.localUserStatus === 'recording';
  });

  recordingTimeFormatted = computed(() => {
    const metrics = this.interactiveService.getPerformanceMetrics();
    const seconds = metrics.timestamp % 60;
    const minutes = Math.floor(metrics.timestamp / 60000) % 60;
    const hours = Math.floor(metrics.timestamp / 3600000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  });

  participantCount = computed(() => {
    return this.interactiveService.interactiveState().remoteParticipants.length;
  });

  cpuLoad = computed(() => {
    return this.interactiveService.performanceMetrics().cpu;
  });

  cpuWarning = computed(() => {
    return this.cpuLoad() > 70;
  });

  audioLatency = computed(() => {
    return this.interactiveService.getPerformanceMetrics().audioLatency;
  });

  bufferHealth = computed(() => {
    return this.interactiveService.getPerformanceMetrics().bufferHealth;
  });

  bufferWarning = computed(() => {
    return this.bufferHealth() < 30;
  });
}
