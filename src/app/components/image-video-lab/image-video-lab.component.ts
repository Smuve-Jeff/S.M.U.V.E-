import { Component, signal, inject, ViewChild, ElementRef, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import { ReputationService } from '../../services/reputation.service';

@Component({
  selector: 'app-image-video-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-video-lab.component.html',
  styleUrls: ['./image-video-lab.component.css'],
})
export class ImageVideoLabComponent implements OnDestroy {
  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  private reputationService = inject(ReputationService);

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  imagePrompt = signal('');
  isGenerating = signal(false);
  generatedImageUrl = signal<string | null>(null);
  highQualityEnhancer = signal(false);

  // Camera & Recording Signals
  isCameraActive = signal(false);
  isRecording = signal(false);
  recordedClips = signal<{url: string, timestamp: number}[]>([]);
  aiFeedback = signal('S.M.U.V.E. Camera System Offline. Initialize for tactical visual capture.');

  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  templates = [
    { name: 'Cinematic Noir', prompt: 'film noir style, high contrast, dramatic shadows' },
    { name: 'Vaporwave Dreams', prompt: '80s aesthetic, neon pink and teal, lo-fi textures' },
    { name: 'Cyberpunk Grit', prompt: 'futuristic city, rain-slicked streets, neon lights' },
    { name: 'Ethereal Clouds', prompt: 'soft lighting, dreamlike atmosphere, pastel colors' },
  ];

  streamingSettings = signal({
    platform: 'Twitch',
    resolution: '1080p',
    bitrate: 6000,
    isLive: false
  });

  constructor() {
    // Dynamic Feedback based on status
    effect(() => {
      if (this.isRecording()) {
        const level = this.reputationService.state().level;
        const feedback = this.getRecordingFeedback(level);
        this.aiFeedback.set(feedback);
      }
    }, { allowSignalWrites: true });
  }

  private getRecordingFeedback(level: number): string {
    const titles = [
      'Focus, Novice. Every frame is a marketing asset.',
      'Analyzing performance. Your stage presence is showing 12% improvement.',
      'Platinum Architect detected. Capturing high-fidelity raw data for the archives.',
      'Legendary Strategic Commander, the visuals are aligning with your global dominance.'
    ];

    if (level < 10) return titles[0];
    if (level < 30) return titles[1];
    if (level < 50) return titles[2];
    return titles[3];
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (this.videoElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
      }
      this.isCameraActive.set(true);
      this.aiFeedback.set('Optical sensors initialized. Dynamic range optimized for cinematic capture.');
    } catch (err) {
      console.error('Error accessing camera:', err);
      this.aiFeedback.set('ERROR: Hardware access denied. Verify sensor connections.');
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isCameraActive.set(false);
    this.aiFeedback.set('Visual sensors deactivated. Powering down lab.');
  }

  startRecording() {
    if (!this.stream) return;

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      this.recordedClips.update(clips => [...clips, { url, timestamp: Date.now() }]);
      this.aiFeedback.set('Capture complete. File encoded and stored in the Visual Vault.');
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording()) {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
    }
  }

  downloadClip(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `smuve-capture-${Date.now()}.webm`;
    a.click();
  }

  async generateImage() {
    if (!this.imagePrompt()) return;

    this.isGenerating.set(true);
    this.generatedImageUrl.set(null);

    const fullPrompt = this.highQualityEnhancer()
      ? `${this.imagePrompt()}, high definition, professional lighting, 4k`
      : this.imagePrompt();

    try {
      const url = await this.aiService.generateImage(fullPrompt);
      this.generatedImageUrl.set(url);
      this.userContext.setLastImageUrl(url);
    } catch (error) {
      console.error('Image Generation Error:', error);
    } finally {
      this.isGenerating.set(false);
    }
  }

  applyTemplate(templatePrompt: string) {
    this.imagePrompt.set(templatePrompt);
  }

  toggleLive() {
    this.streamingSettings.update(s => ({ ...s, isLive: !s.isLive }));
    if (this.streamingSettings().isLive) {
      this.aiFeedback.set('BROADCAST LIVE. Dominating the digital airwaves.');
    } else {
      this.aiFeedback.set('Transmission terminated. Analyzing viewer engagement data.');
    }
  }

  ngOnDestroy() {
    this.stopCamera();
  }
}
