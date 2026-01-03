
import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, effect, OnDestroy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EqPanelComponent } from '../components/eq-panel/eq-panel.component';
import { MatrixBackgroundComponent } from '../components/sample-library/matrix-background.component';
import { ChatbotComponent } from '../chatbot/chatbot.component';
import { ImageEditorComponent } from '../components/image-editor/image-editor.component';
import { VideoEditorComponent } from './video-editor.component';
import { AudioVisualizerComponent } from '../components/audio-visualizer/audio-visualizer.component';
import { PianoRollComponent } from '../components/piano-roll/piano-roll.component';
import { NetworkingComponent, ArtistProfile, MOCK_ARTISTS } from '../components/networking/networking.component';
import { ProfileEditorComponent } from '../components/profile-editor/profile-editor.component';
import { HubComponent } from '../../app/hub/hub';
import { AiService } from '../services/ai.service';
// FIX: Import AppTheme and shared types from UserContextService to break circular dependency which caused injection errors.
import { UserContextService, AppTheme, Track, EqBand, Enhancements, DeckState, initialDeckState } from '../services/user-context.service';
import { UserProfileService } from '../services/user-profile.service';

declare global {
  interface HTMLAudioElement { __sourceNode?: MediaElementAudioSourceNode; }
}

type ScratchState = { active: boolean; lastAngle: number; platterElement: HTMLElement | null; };
const THEMES: AppTheme[] = [
  { name: 'Green Vintage', primary: 'green', accent: 'amber', neutral: 'neutral', purple: 'purple', red: 'red', blue: 'blue' },
  { name: 'Blue Retro', primary: 'blue', accent: 'fuchsia', neutral: 'zinc', purple: 'purple', red: 'red', blue: 'blue' },
  { name: 'Red Glitch', primary: 'red', accent: 'cyan', neutral: 'stone', purple: 'purple', red: 'red', blue: 'blue' },
];

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, EqPanelComponent, MatrixBackgroundComponent, ChatbotComponent, ImageEditorComponent, VideoEditorComponent, AudioVisualizerComponent, PianoRollComponent, NetworkingComponent, ProfileEditorComponent, HubComponent],
  host: {
    '(window:mousemove)': 'onScratch($event)', '(window:touchmove)': 'onScratch($event)',
    '(window:mouseup)': 'onScratchEnd()', '(window:touchend)': 'onScratchEnd()',
  },
})
export class AppComponent implements OnDestroy {
  mainAudioPlayerRef = viewChild<ElementRef<HTMLAudioElement>>('mainAudioPlayer');
  
  // DJ Deck specific refs
  audioPlayerARef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerA');
  videoPlayerARef = viewChild<ElementRef<HTMLVideoElement>>('videoPlayerA');
  audioPlayerBRef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerB');
  videoPlayerBRef = viewChild<ElementRef<HTMLVideoElement>>('videoPlayerB');
  fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  mainViewMode = signal<'player' | 'dj' | 'piano-roll' | 'image-editor' | 'video-editor' | 'networking' | 'profile' | 'tha-spot'>('player');
  showChatbot = signal(true);

  // --- Player State ---
  playlist = signal<Track[]>([]);
  currentTrackIndex = signal<number>(-1);
  isPlaying = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  volume = signal(0.75);
  currentPlayerTrack = computed<Track | null>(() => {
    const idx = this.currentTrackIndex(); const list = this.playlist();
    return (idx >= 0 && idx < list.length) ? list[idx] : null;
  });

  // --- DJ State ---
  deckA = signal<DeckState>({ ...initialDeckState });
  deckB = signal<DeckState>({ ...initialDeckState });
  crossfade = signal(0);
  isScratchingA = signal(false);
  isScratchingB = signal(false);
  scratchRotationA = signal('');
  scratchRotationB = signal('');

  showEqPanel = signal(false);
  eqSettings = signal<EqBand[]>([
    { label: '60Hz', value: 50 }, { label: '310Hz', value: 50 }, { label: '1KHz', value: 50 },
    { label: '6KHz', value: 50 }, { label: '16KHz', value: 50 },
  ]);
  enhancements = signal<Enhancements>({ bassBoost: false, surroundSound: false });
  isRecording = signal(false);
  recordedMixUrl = signal<string | null>(null);
  vuLevelA = signal(0); vuLevelB = signal(0); vuLevelMaster = signal(0); vuLevelMic = signal(0);
  vuBars = Array(12).fill(0);
  micEnabled = signal(false); micVolume = signal(50); micEqHigh = signal(50);
  micEqMid = signal(50); micEqLow = signal(50); micFilterFreq = signal(20000);
  readonly THEMES = THEMES;
  currentTheme = signal<AppTheme>(THEMES[0]);
  mainBorderClass = computed(() => `border-${this.currentTheme().primary}-400/50`);
  mainTextColorClass = computed(() => `text-${this.currentTheme().primary}-400`);
  mainHoverBgClass = computed(() => `hover:bg-${this.currentTheme().primary}-400 hover:text-black`);
  djBorderClass = computed(() => `border-${this.currentTheme().accent}-500/30`);
  djTextColorClass = computed(() => `text-${this.currentTheme().accent}-400`);
  djBgStone700 = computed(() => `bg-${this.currentTheme().neutral}-700`);
  imageEditorInitialPrompt = signal<string>('');
  videoEditorInitialPrompt = signal<string>('');
  lastImageEditorImageUrl = signal<string | null>(null);
  showApplyAlbumArtModal = signal(false);
  imageToApplyAsAlbumArt = signal<string | null>(null);
  imageToAnalyzeUrl = signal<string | null>(null);
  videoToAnalyze = signal<{ track: any, prompt: string } | null>(null); // Using `any` for track to avoid conflict
  imageAnalysisResult = signal<string | null>(null);
  showImageAnalysisModal = signal(false);
  mapLocationQuery = signal<string | null>(null);
  mapLocationResult = signal<string | null>(null);
  showMapResultsModal = signal(false);
  networkingLocationQuery = signal<string | null>(null);
  selectedArtistProfile = signal<ArtistProfile | null>(null);
  showArtistDetailModal = signal(false);

  private scratchStateA: ScratchState = { active: false, lastAngle: 0, platterElement: null };
  private scratchStateB: ScratchState = { active: false, lastAngle: 0, platterElement: null };
  private readonly SCRATCH_SENSITIVITY = 0.5;
  private audioContext!: AudioContext;
  private analyserMaster!: AnalyserNode;
  private gainNodeMaster!: GainNode;
  private destinationNode!: MediaStreamAudioDestinationNode;
  private vuAnalysisFrameId?: number;
  private aiService = inject(AiService);
  // FIX: userContext is now correctly typed as UserContextService, fixing the errors on property access.
  private userContext = inject(UserContextService);
  private userProfileService = inject(UserProfileService); // Initialize profile service

  constructor() {
    this.initAudioContext();
    this.initVUAnalysis();
    effect(() => { if (this.imageAnalysisResult()) this.showImageAnalysisModal.set(true); });
    effect(() => { if (this.mapLocationResult()) this.showMapResultsModal.set(true); });
    effect(() => { if (this.selectedArtistProfile()) this.showArtistDetailModal.set(true); });

    // FIX: These calls are now valid as userContext is correctly typed.
    effect(() => this.userContext.setMainViewMode(this.mainViewMode()));
    // FIX: These calls are now valid as userContext is correctly typed.
    effect(() => this.userContext.setTheme(this.currentTheme()));
    
    // Effect to handle track changes in player mode
    effect(() => {
      const track = this.currentPlayerTrack();
      const audioEl = this.mainAudioPlayerRef()?.nativeElement;
      if (track && audioEl) {
        audioEl.src = track.url;
        audioEl.load();
        audioEl.play().then(() => this.isPlaying.set(true)).catch(e => console.error("Error playing track:", e));
      }
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    this.stopAllAudio();
    this.audioContext?.close();
    if (this.vuAnalysisFrameId) cancelAnimationFrame(this.vuAnalysisFrameId);
  }

  private initAudioContext(): void {
    if (typeof window !== 'undefined') {
      this.audioContext = new AudioContext();
      this.gainNodeMaster = this.audioContext.createGain();
      this.analyserMaster = this.audioContext.createAnalyser();
      this.analyserMaster.fftSize = 256;
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      
      this.gainNodeMaster.connect(this.analyserMaster);
      this.analyserMaster.connect(this.audioContext.destination);
      this.analyserMaster.connect(this.destinationNode);
    }
  }

  private initVUAnalysis(): void {
    if (typeof window !== 'undefined') {
      const analyze = () => {
        // Only run analysis if the DJ deck is visible for performance
        if (this.mainViewMode() === 'dj' && this.analyserMaster) {
          const bufferLength = this.analyserMaster.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          this.analyserMaster.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
          this.vuLevelMaster.set(Math.min(100, (average / 128) * 100));
        }
        this.vuAnalysisFrameId = requestAnimationFrame(analyze);
      };
      analyze();
    }
  }
  
  // --- Player Methods ---
  handleFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const newTracks = Array.from(input.files).map(file => ({
        name: file.name,
        url: URL.createObjectURL(file),
      }));
      this.playlist.set(newTracks);
      if (newTracks.length > 0) this.currentTrackIndex.set(0);
    }
  }

  togglePlay(): void {
    const audioEl = this.mainAudioPlayerRef()?.nativeElement;
    if (!audioEl) return;
    if (this.isPlaying()) audioEl.pause();
    else audioEl.play();
    this.isPlaying.set(!this.isPlaying());
  }

  playNext(): void {
    const playlistSize = this.playlist().length;
    if (playlistSize === 0) return;
    this.currentTrackIndex.update(i => (i + 1) % playlistSize);
  }

  playPrevious(): void {
    const playlistSize = this.playlist().length;
    if (playlistSize === 0) return;
    this.currentTrackIndex.update(i => (i - 1 + playlistSize) % playlistSize);
  }

  onTimeUpdate(): void { this.currentTime.set(this.mainAudioPlayerRef()?.nativeElement.currentTime || 0); }
  onLoadedMetadata(): void { this.duration.set(this.mainAudioPlayerRef()?.nativeElement.duration || 0); }
  onTrackEnded(): void { this.playNext(); }
  seek(event: Event): void {
    const audioEl = this.mainAudioPlayerRef()?.nativeElement;
    if (audioEl) audioEl.currentTime = Number((event.target as HTMLInputElement).value);
  }
  onVolumeChange(event: Event): void {
    const newVolume = Number((event.target as HTMLInputElement).value);
    this.volume.set(newVolume);
    const audioEl = this.mainAudioPlayerRef()?.nativeElement;
    if (audioEl) audioEl.volume = newVolume;
  }
  formatTime(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }


  getMasterAnalyser(): AnalyserNode | undefined { return this.analyserMaster; }
  
  onScratch(event: MouseEvent | TouchEvent): void { /* Basic scratch logic would be implemented here */ }
  onScratchEnd(): void { /* Basic scratch logic would be implemented here */ }
  
  stopAllAudio(): void {
    this.mainAudioPlayerRef()?.nativeElement.pause();
    this.audioPlayerARef()?.nativeElement.pause();
    this.audioPlayerBRef()?.nativeElement.pause();
  }

  toggleMainViewMode(): void {
    if (this.mainViewMode() === 'profile') {
      this.mainViewMode.set('player');
      return;
    }
    const modes: ('player' | 'dj' | 'piano-roll' | 'image-editor' | 'video-editor' | 'networking')[] = ['player', 'dj', 'piano-roll', 'image-editor', 'video-editor', 'networking'];
    const currentMode = this.mainViewMode() as (typeof modes)[number];
    const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
    this.mainViewMode.set(modes[nextIndex]);
  }

  toggleChatbot(): void { this.showChatbot.update(s => !s); }
  toggleEqPanel(): void { this.showEqPanel.update(s => !s); }

  handleImageSelectedForAlbumArt(imageUrl: string): void {
    this.imageToApplyAsAlbumArt.set(imageUrl);
    this.showApplyAlbumArtModal.set(true);
  }
  
  handleImageGenerated(imageUrl: string): void {
    this.lastImageEditorImageUrl.set(imageUrl);
    // FIX: This call is now valid as userContext is correctly typed.
    this.userContext.setLastImageUrl(imageUrl);
  }
  
  onMasterEqChange(newSettings: EqBand[]): void {
    this.eqSettings.set(newSettings);
    // Logic to apply EQ settings to audio context would go here
  }

  applyImageAsAlbumArt(target: 'player' | 'A' | 'B'): void {
    const imageUrl = this.imageToApplyAsAlbumArt();
    if (!imageUrl) return;

    if (target === 'player' && this.currentPlayerTrack()) {
      const track = this.currentPlayerTrack()!;
      track.albumArtUrl = imageUrl;
      this.playlist.update(list => [...list]); // Trigger change detection
    } else if (target === 'A') {
      this.deckA.update(d => ({ ...d, track: { ...d.track, albumArtUrl: imageUrl } }));
    } else if (target === 'B') {
      this.deckB.update(d => ({ ...d, track: { ...d.track, albumArtUrl: imageUrl } }));
    }
    this.showApplyAlbumArtModal.set(false);
    this.imageToApplyAsAlbumArt.set(null);
  }

  randomizeTheme(): void {
    const currentIndex = this.THEMES.indexOf(this.currentTheme());
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * this.THEMES.length);
    } while (nextIndex === currentIndex);
    this.currentTheme.set(this.THEMES[nextIndex]);
  }
}
