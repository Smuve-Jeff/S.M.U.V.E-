import { Injectable, inject, signal, effect } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { PeerNetworkingService } from './peer-networking.service';
import { SocialNetworkingService } from './social-networking.service';
import { StudioRecordingEngineService } from '../studio/studio-recording-engine.service';
import { LoggingService } from './logging.service';
import { Subject } from 'rxjs';

export interface InteractiveState {
  isVoiceActive: boolean;
  isStreamingActive: boolean;
  isCollaborating: boolean;
  localUserStatus: 'idle' | 'recording' | 'performing' | 'collaborating' | 'streaming';
  remoteParticipants: RemoteParticipant[];
  performanceFeedback: PerformanceFeedback;
}

export interface RemoteParticipant {
  userId: string;
  displayName: string;
  isVoiceActive: boolean;
  isStreaming: boolean;
  inputLevel: number;
  lastActivityTime: number;
}

export interface PerformanceFeedback {
  cpuLoad: number;
  audioLatency: number;
  bufferHealth: number;
  droppedFrames: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root',
})
export class InteractiveCapabilitiesService {
  private audioEngine = inject(AudioEngineService);
  private peerService = inject(PeerNetworkingService);
  private socialService = inject(SocialNetworkingService);
  private recordingEngine = inject(StudioRecordingEngineService);
  private logger = inject(LoggingService);

  // State signals
  interactiveState = signal<InteractiveState>({
    isVoiceActive: false,
    isStreamingActive: false,
    isCollaborating: false,
    localUserStatus: 'idle',
    remoteParticipants: [],
    performanceFeedback: {
      cpuLoad: 0,
      audioLatency: 0,
      bufferHealth: 100,
      droppedFrames: 0,
      timestamp: Date.now(),
    },
  });

  // Real-time feedback signals
  voiceInputLevel = signal(0);
  voiceOutputLevel = signal(0);
  performanceMetrics = signal({ cpu: 0, memory: 0, audioXruns: 0, videoFps: 0 });
  collaborationStatus = signal<'idle' | 'connected' | 'streaming' | 'recording'>('idle');
  remoteAudioStreamingStatus = signal<{ [userId: string]: boolean }>({});

  // Event subjects
  voiceActivityDetected$ = new Subject<{ userId: string; isActive: boolean }>();
  participantJoined$ = new Subject<RemoteParticipant>();
  participantLeft$ = new Subject<string>();
  streamQualityChanged$ = new Subject<{ userId: string; quality: 'high' | 'medium' | 'low' }>();
  performanceAlert$ = new Subject<{ metric: string; value: number; threshold: number }>();

  private performanceMonitorInterval: any = null;
  private voiceLevelMonitorInterval: any = null;
  private remoteParticipantMap = new Map<string, RemoteParticipant>();

  constructor() {
    this.initializeMonitoring();
    this.setupCrossModuleIntegration();
  }

  /**
   * Start voice call with remote participant
   */
  async startVoiceCall(userId: string): Promise<boolean> {
    try {
      await this.peerService.startCall(userId);
      this.interactiveState.update(s => ({
        ...s,
        isVoiceActive: true,
        localUserStatus: 'collaborating',
      }));
      this.collaborationStatus.set('connected');
      this.startVoiceLevelMonitoring();
      this.logger.info(`Voice call started with ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Voice call failed:', error);
      return false;
    }
  }

  /**
   * End active voice call
   */
  endVoiceCall(): void {
    this.peerService.endCall();
    this.interactiveState.update(s => ({
      ...s,
      isVoiceActive: false,
    }));
    this.collaborationStatus.set('idle');
    this.stopVoiceLevelMonitoring();
  }

  /**
   * Start streaming performance
   */
  async startStreaming(platform: 'youtube' | 'twitch' | 'custom' = 'custom'): Promise<boolean> {
    try {
      await this.socialService.startStream(platform);
      this.interactiveState.update(s => ({
        ...s,
        isStreamingActive: true,
        localUserStatus: 'streaming',
      }));
      this.collaborationStatus.set('streaming');
      this.logger.info(`Streaming started on ${platform}`);
      return true;
    } catch (error) {
      this.logger.error('Stream start failed:', error);
      return false;
    }
  }

  /**
   * Stop streaming
   */
  async stopStreaming(): Promise<void> {
    await this.socialService.stopStream();
    this.interactiveState.update(s => ({
      ...s,
      isStreamingActive: false,
    }));
    this.collaborationStatus.set('idle');
  }

  /**
   * Start collaborative recording session
   */
  async startCollaborativeRecording(): Promise<boolean> {
    try {
      const initialized = await this.recordingEngine.initialize();
      if (initialized) {
        this.recordingEngine.startRecording();
        this.interactiveState.update(s => ({
          ...s,
          isCollaborating: true,
          localUserStatus: 'recording',
        }));
        this.collaborationStatus.set('recording');
        this.logger.info('Collaborative recording started');
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Recording initialization failed:', error);
      return false;
    }
  }

  /**
   * Stop collaborative recording
   */
  async stopCollaborativeRecording(): Promise<void> {
    await this.recordingEngine.stopRecording();
    this.interactiveState.update(s => ({
      ...s,
      isCollaborating: false,
    }));
  }

  /**
   * Pause collaborative recording
   */
  pauseCollaborativeRecording(): void {
    this.recordingEngine.pauseRecording();
  }

  /**
   * Resume collaborative recording
   */
  resumeCollaborativeRecording(): void {
    this.recordingEngine.resumeRecording();
  }

  /**
   * Broadcast performer status to remote participants
   */
  broadcastPerformerStatus(status: 'idle' | 'performing' | 'preparing'): void {
    this.interactiveState.update(s => ({
      ...s,
      localUserStatus: status === 'idle' ? 'idle' : status === 'performing' ? 'performing' : 'idle',
    }));
    this.socialService.updateStatus({ inGame: status === 'performing' });
  }

  /**
   * Get local input level
   */
  getLocalInputLevel(): number {
    return this.recordingEngine.inputLevel();
  }

  /**
   * Get master output level
   */
  getMasterOutputLevel(): number {
    const analyser = this.audioEngine.getMasterAnalyser();
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return Math.round((sum / data.length) * 100) / 255;
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceFeedback {
    return this.interactiveState().performanceFeedback;
  }

  /**
   * Setup remote participant tracking
   */
  trackRemoteParticipant(userId: string, displayName: string): RemoteParticipant {
    const participant: RemoteParticipant = {
      userId,
      displayName,
      isVoiceActive: false,
      isStreaming: false,
      inputLevel: 0,
      lastActivityTime: Date.now(),
    };
    this.remoteParticipantMap.set(userId, participant);
    this.interactiveState.update(s => ({
      ...s,
      remoteParticipants: Array.from(this.remoteParticipantMap.values()),
    }));
    this.participantJoined$.next(participant);
    return participant;
  }

  /**
   * Update remote participant activity
   */
  updateRemoteParticipantActivity(userId: string, isVoiceActive: boolean, inputLevel: number): void {
    const participant = this.remoteParticipantMap.get(userId);
    if (participant) {
      participant.isVoiceActive = isVoiceActive;
      participant.inputLevel = inputLevel;
      participant.lastActivityTime = Date.now();
      this.interactiveState.update(s => ({
        ...s,
        remoteParticipants: Array.from(this.remoteParticipantMap.values()),
      }));
      if (isVoiceActive) {
        this.voiceActivityDetected$.next({ userId, isActive: true });
      }
    }
  }

  /**
   * Remove remote participant tracking
   */
  untrackRemoteParticipant(userId: string): void {
    this.remoteParticipantMap.delete(userId);
    this.interactiveState.update(s => ({
      ...s,
      remoteParticipants: Array.from(this.remoteParticipantMap.values()),
    }));
    this.participantLeft$.next(userId);
  }

  /**
   * Initialize cross-module monitoring
   */
  private initializeMonitoring(): void {
    // Monitor audio engine performance
    this.performanceMonitorInterval = setInterval(() => {
      const metrics = {
        cpu: Math.random() * 50, // Placeholder
        memory: Math.random() * 60, // Placeholder
        audioXruns: 0,
        videoFps: 60,
      };
      this.performanceMetrics.set(metrics);

      // Check thresholds
      if (metrics.cpu > 80) {
        this.performanceAlert$.next({
          metric: 'cpu',
          value: metrics.cpu,
          threshold: 80,
        });
        this.audioEngine.updateAdaptivePerformance(metrics.cpu);
      }
    }, 1000);
  }

  /**
   * Start voice level monitoring
   */
  private startVoiceLevelMonitoring(): void {
    this.voiceLevelMonitorInterval = setInterval(() => {
      this.voiceInputLevel.set(this.recordingEngine.inputLevel());
      this.voiceOutputLevel.set(this.getMasterOutputLevel());
    }, 50);
  }

  /**
   * Stop voice level monitoring
   */
  private stopVoiceLevelMonitoring(): void {
    if (this.voiceLevelMonitorInterval) {
      clearInterval(this.voiceLevelMonitorInterval);
      this.voiceLevelMonitorInterval = null;
    }
  }

  /**
   * Setup cross-module integration
   */
  private setupCrossModuleIntegration(): void {
    // Listen for call state changes from peer service
    effect(() => {
      const isCallActive = this.peerService.isCallActive?.();
      if (!isCallActive && this.interactiveState().isVoiceActive) {
        this.interactiveState.update(s => ({
          ...s,
          isVoiceActive: false,
        }));
        this.stopVoiceLevelMonitoring();
      }
    });

    // Listen for knock notifications
    effect(() => {
      const knockUserId = this.peerService.knockFromUserId?.();
      if (knockUserId) {
        this.logger.info(`User ${knockUserId} is calling...`);
      }
    });

    // Broadcast recorder status
    effect(() => {
      const isRecording = this.recordingEngine.isRecording();
      if (isRecording) {
        this.broadcastPerformerStatus('performing');
      }
    });
  }

  ngOnDestroy(): void {
    if (this.performanceMonitorInterval) {
      clearInterval(this.performanceMonitorInterval);
    }
    this.stopVoiceLevelMonitoring();
  }
}
