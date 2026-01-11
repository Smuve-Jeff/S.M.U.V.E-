
import { Component, signal, computed, effect, inject, ChangeDetectorRef, ElementRef, viewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { UserContextService, AppTheme, MainViewMode } from './services/user-context.service';
import { AiService } from './services/ai.service';
import { AuthService } from './services/auth.service';
import { MicrophoneVisualizerComponent } from './components/microphone-visualizer/microphone-visualizer.component';

interface Track {
  name: string;
  url: string;
  albumArtUrl?: string;
}

interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  volume: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    RouterOutlet,
    MicrophoneVisualizerComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit {
    // Dependency Injection
    userContextService = inject(UserContextService);
    aiService = inject(AiService);
    authService = inject(AuthService);
    private cdr = inject(ChangeDetectorRef);

    // Theming
    readonly THEMES: AppTheme[] = [
        { name: 'Soft Sage', primary: '#9fb8ad', accent: '#c9d6cf', neutral: '#0f172a', purple: '#c7b9ff', red: '#f4b6c2', blue: '#9ad0ec' },
        { name: 'Dusky Lavender', primary: '#b8a3c2', accent: '#d8c7df', neutral: '#101828', purple: '#c5a6ff', red: '#f2c6c2', blue: '#a1c4fd' },
        { name: 'Midnight Sand', primary: '#c8b6a6', accent: '#e6d5c3', neutral: '#111827', purple: '#b4a1ff', red: '#f0a8a0', blue: '#8dc5d6' },
    ];
    currentTheme = this.userContextService.lastUsedTheme;

    // View-specific theme overrides
    private VIEW_THEMES: Record<string, AppTheme> = {
        dj: { name: 'DJ Neon', primary: '#00e5ff', accent: '#ff3ec8', neutral: '#0b0e14', purple: '#7a5cff', red: '#ff4d4d', blue: '#00e5ff' },
        remix: { name: 'Gaming Green', primary: '#39ff14', accent: '#daff00', neutral: '#0f0f0f', purple: '#b100cd', red: '#ff003c', blue: '#00c4ff' },
    };

    activeTheme = computed<AppTheme>(() => {
        const mode = this.mainViewMode();
        const override = this.VIEW_THEMES[mode];
        return override || this.currentTheme() || this.THEMES[0];
    });

    // Main View Management
    mainViewMode = this.userContextService.mainViewMode;
    
    // UI State
    showEqPanel = signal(false);
    showChatbot = signal(true);
    
    // Audio Player State
    playlist = signal<Track[]>([]);
    currentTrackIndex = signal(0);
    isPlaying = signal(false);
    currentTime = signal(0);
    duration = signal(0);
    volume = signal(0.8);
    repeat = signal(false);
    shuffle = signal(false);

    currentPlayerTrack = computed(() => {
        const playlist = this.playlist();
        return playlist.length > 0 ? playlist[this.currentTrackIndex()] : null;
    });

    formattedCurrentTime = computed(() => this.formatTime(this.currentTime()));
    formattedDuration = computed(() => this.formatTime(this.duration()));

    // DJ Decks State
    deckA = signal<DeckState>({ track: null, isPlaying: false, volume: 1 });
    deckB = signal<DeckState>({ track: null, isPlaying: false, volume: 1 });
    crossfade = signal(0);
    micVolume = signal(50);
    scratchRotationA = signal('rotate(0deg)');
    scratchRotationB = signal('rotate(0deg)');

    // Microphone State
    micEnabled = signal(false);
    micReverb = signal(0);
    micDelay = signal(0);
    micAnalyser = signal<AnalyserNode | undefined>(undefined);

    // Audio Analysis & Visualization
    private audioContext: AudioContext;
    private masterGain: GainNode;
    private masterAnalyser: AnalyserNode;
    private deckAGain: GainNode;
    private deckBGain: GainNode;
    private micSource?: MediaStreamAudioSourceNode;
    private micGain: GainNode;
    private micReverbNode: ConvolverNode;
    private micDelayNode: DelayNode;

    // Child Element References
    audioPlayerRef = viewChild<ElementRef<HTMLAudioElement>>('mainAudioPlayer');
    audioPlayerARef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerA');
    audioPlayerBRef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerB');

    constructor() {
        this.audioContext = new AudioContext();
        this.masterGain = this.audioContext.createGain();
        this.masterAnalyser = this.audioContext.createAnalyser();
        this.deckAGain = this.audioContext.createGain();
        this.deckBGain = this.audioContext.createGain();
        this.micGain = this.audioContext.createGain();
        this.micReverbNode = this.audioContext.createConvolver();
        this.micDelayNode = this.audioContext.createDelay();

        this.masterGain.connect(this.masterAnalyser);
        this.masterAnalyser.connect(this.audioContext.destination);
        this.deckAGain.connect(this.masterGain);
        this.deckBGain.connect(this.masterGain);
        this.micGain.connect(this.masterGain);

        effect(() => {
            const fade = this.crossfade();
            this.deckAGain.gain.setTargetAtTime(Math.cos((fade + 1) * 0.25 * Math.PI), this.audioContext.currentTime, 0.01);
            this.deckBGain.gain.setTargetAtTime(Math.cos((1 - fade) * 0.25 * Math.PI), this.audioContext.currentTime, 0.01);
        });

        effect(() => {
            const playlist = this.playlist();
            if (playlist.length > 0 && !this.deckA().track) this.deckA.update(d => ({...d, track: playlist[0]}));
            if (playlist.length > 1 && !this.deckB().track) this.deckB.update(d => ({...d, track: playlist[1]}));
        });
    }

    ngAfterViewInit() {
        const mainAudioPlayer = this.audioPlayerRef()?.nativeElement;
        if (mainAudioPlayer) {
            const source = this.audioContext.createMediaElementSource(mainAudioPlayer);
            source.connect(this.masterGain);
        }
    }

    async toggleMic() {
        if (this.micEnabled()) {
            this.micEnabled.set(false);
            this.micSource?.disconnect();
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.micSource = this.audioContext.createMediaStreamSource(stream);
                const micAnalyser = this.audioContext.createAnalyser();
                this.micSource.connect(micAnalyser);
                this.micAnalyser.set(micAnalyser);

                const micGain = this.audioContext.createGain();
                this.micSource.connect(micGain);
                micGain.connect(this.masterGain);
                this.micEnabled.set(true);
            } catch (error) {
                console.error('Error accessing microphone:', error);
            }
        }
    }

    onMicReverbChange(event: Event) {
        const value = parseFloat((event.target as HTMLInputElement).value);
        this.micReverb.set(value);
        // Implement reverb effect logic here
    }

    onMicDelayChange(event: Event) {
        const value = parseFloat((event.target as HTMLInputElement).value);
        this.micDelay.set(value);
        this.micDelayNode.delayTime.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
    }

    // Utility method to get the microphone analyser
    getMicAnalyser(): AnalyserNode | undefined {
        return this.micAnalyser();
    }
}
