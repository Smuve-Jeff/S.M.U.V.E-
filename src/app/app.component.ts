
import { Component, signal, computed, effect, inject, ChangeDetectorRef, ElementRef, viewChild, ViewChild, AfterViewInit } from '@angular/core';
import { UserContextService, AppTheme, MainViewMode } from './services/user-context.service';
import { AiService } from './services/ai.service';
import { EqPanelComponent } from './components/eq-panel/eq-panel.component';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { ImageEditorComponent } from './components/image-editor/image-editor.component';
import { AudioVisualizerComponent } from './components/audio-visualizer/audio-visualizer.component';
import { PianoRollComponent } from './components/piano-roll/piano-roll.component';
import { NetworkingComponent } from './components/networking/networking.component';
import { ProfileEditorComponent } from './components/profile-editor/profile-editor.component';
import { HubComponent } from './hub/hub.component';
import { AuthService } from './services/auth.service';

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

    // View-specific theme overrides for distinct color schemes per feature
    private VIEW_THEMES: Record<string, AppTheme> = {
        dj: { name: 'DJ Neon', primary: '#00e5ff', accent: '#ff3ec8', neutral: '#0b0e14', purple: '#7a5cff', red: '#ff4d4d', blue: '#00e5ff' },
        'piano-roll': { name: 'Piano Teal', primary: '#00c2a8', accent: '#ffd166', neutral: '#0d1117', purple: '#6a5acd', red: '#ef476f', blue: '#118ab2' },
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
        if (playlist.length === 0) return null;
        return playlist[this.currentTrackIndex()];
    });

    // Performance Optimization: Memoize time formatting to prevent re-calculation on every render cycle.
    formattedCurrentTime = computed(() => this.formatTime(this.currentTime()));
    formattedDuration = computed(() => this.formatTime(this.duration()));

    // DJ Decks State
    deckA = signal<DeckState>({ track: null, isPlaying: false, volume: 1 });
    deckB = signal<DeckState>({ track: null, isPlaying: false, volume: 1 });
    crossfade = signal(0); // -1 for Deck A, 1 for Deck B
    micVolume = signal(50);
    scratchRotationA = signal('rotate(0deg)');
    scratchRotationB = signal('rotate(0deg)');
    
    // Audio Analysis & Visualization
    private audioContext: AudioContext;
    private masterGain: GainNode;
    private masterAnalyser: AnalyserNode;
    private deckAAudioSource: MediaElementAudioSourceNode | null = null;
    private deckBAudioSource: MediaElementAudioSourceNode | null = null;
    private deckAGain: GainNode;
    private deckBGain: GainNode;

    // Child Element References
    audioPlayerRef = viewChild<ElementRef<HTMLAudioElement>>('mainAudioPlayer');
    audioPlayerARef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerA');
    audioPlayerBRef = viewChild<ElementRef<HTMLAudioElement>>('audioPlayerB');

    // Image & Video Generation/Analysis
    imageEditorInitialPrompt = signal('');
    videoEditorInitialPrompt = signal('');
    videoToAnalyze = signal<string | null>(null);
    imageToAnalyzeUrl = signal<string | null>(null);
    showApplyAlbumArtModal = signal(false);
    imageToApplyAsAlbumArt = signal<string | null>(null);

    // Networking & Profiles
    networkingLocationQuery = signal('');
    selectedArtistProfile = signal<any>(null);

    // Computed UI classes
    mainBorderClass = computed(() => `border-[${this.activeTheme().primary}]`);
    mainTextColorClass = computed(() => `text-[${this.activeTheme().primary}]`);
    mainBgClass = computed(() => `bg-[${this.activeTheme().primary}]/80`);
    mainHoverBgClass = computed(() => `hover:bg-[${this.activeTheme().primary}]/20`);
    djBorderClass = computed(() => `border-[${this.activeTheme().accent}]/50`);
    djTextColorClass = computed(() => `text-[${this.activeTheme().accent}]`);

    // Master EQ Settings
    eqSettings = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    constructor() {
        this.audioContext = new AudioContext();
        this.masterGain = this.audioContext.createGain();
        this.masterAnalyser = this.audioContext.createAnalyser();
        this.deckAGain = this.audioContext.createGain();
        this.deckBGain = this.audioContext.createGain();

        this.masterGain.connect(this.masterAnalyser);
        this.masterAnalyser.connect(this.audioContext.destination);

        this.deckAGain.connect(this.masterGain);
        this.deckBGain.connect(this.masterGain);

        // Crossfader logic
        effect(() => {
            const fade = this.crossfade();
            const gainA = Math.cos((fade + 1) * 0.25 * Math.PI);
            const gainB = Math.cos((1 - fade) * 0.25 * Math.PI);
            this.deckAGain.gain.setTargetAtTime(gainA, this.audioContext.currentTime, 0.01);
            this.deckBGain.gain.setTargetAtTime(gainB, this.audioContext.currentTime, 0.01);
        });
        
        // Auto-load initial tracks for decks
        effect(() => {
            const playlist = this.playlist();
            if (playlist.length > 0 && !this.deckA().track) {
                this.deckA.update(d => ({...d, track: playlist[0]}));
            }
            if (playlist.length > 1 && !this.deckB().track) {
                this.deckB.update(d => ({...d, track: playlist[1]}));
            }
        });
    }

    ngAfterViewInit() {
        // Connect main audio player to context
        const mainAudioPlayer = this.audioPlayerRef()?.nativeElement;
        if (mainAudioPlayer) {
            const source = this.audioContext.createMediaElementSource(mainAudioPlayer);
            source.connect(this.masterGain);
        }
    }

    // --- Main Player Logic ---
    togglePlay(): void {
        const player = this.audioPlayerRef()?.nativeElement;
        if (!player) return;
        if (this.isPlaying()) {
            player.pause();
        } else {
            if (!player.src || player.src !== this.currentPlayerTrack()?.url) {
                player.src = this.currentPlayerTrack()!.url;
                player.load();
            }
            player.play().catch(e => console.error('Error playing audio:', e));
        }
        this.isPlaying.set(!this.isPlaying());
    }
    
    seek(event: Event): void {
        const player = this.audioPlayerRef()?.nativeElement;
        if (player) {
            player.currentTime = Number((event.target as HTMLInputElement).value);
            this.currentTime.set(player.currentTime);
        }
    }

    onVolumeChange(event: Event): void {
        const newVolume = Number((event.target as HTMLInputElement).value);
        this.volume.set(newVolume);
        const player = this.audioPlayerRef()?.nativeElement;
        if (player) {
            player.volume = newVolume;
        }
    }
    
    onTimeUpdate(): void {
        this.currentTime.set(this.audioPlayerRef()?.nativeElement?.currentTime || 0);
    }
    
    onLoadedMetadata(): void {
        this.duration.set(this.audioPlayerRef()?.nativeElement?.duration || 0);
    }

    onTrackEnded(): void {
        if (this.repeat()) {
            const player = this.audioPlayerRef()?.nativeElement;
            if (player) {
                player.currentTime = 0;
                player.play();
            }
        } else {
            this.playNext();
        }
    }

    // --- DJ Decks Logic ---
    toggleDeckPlay(deck: 'A' | 'B'): void {
        const deckState = deck === 'A' ? this.deckA : this.deckB;
        const player = deck === 'A' ? this.audioPlayerARef()?.nativeElement : this.audioPlayerBRef()?.nativeElement;
        if (!player) return;
    
    if (player.src !== deckState().track?.url) {
          player.src = deckState().track.url;
          player.load();
        }
    
        if (deckState().isPlaying) {
          player.pause();
        } else {
          player.play();
        }
        deckState.update(d => ({ ...d, isPlaying: !d.isPlaying }));
      }
    
      playNextOnDeck(deck: 'A' | 'B'): void {
        const deckState = deck === 'A' ? this.deckA : this.deckB;
        const playlist = this.playlist();
        if (playlist.length === 0) return;
    
        let nextTrackIndex;
    const currentTrackUrl = deckState().track?.url;
        const currentTrackIndex = playlist.findIndex(t => t.url === currentTrackUrl);
    
        if (this.shuffle()) {
          nextTrackIndex = Math.floor(Math.random() * playlist.length);
        } else {
          nextTrackIndex = (currentTrackIndex + 1) % playlist.length;
        }
        
        deckState.update(d => ({ ...d, track: playlist[nextTrackIndex] }));
    
        const player = deck === 'A' ? this.audioPlayerARef()?.nativeElement : this.audioPlayerBRef()?.nativeElement;
        if (player && deckState().isPlaying) {
          player.src = playlist[nextTrackIndex].url;
          player.load();
          player.play();
        }
      }

    onDeckTrackEnded(deck: 'A' | 'B'): void {
        if (this.repeat()) {
            const player = deck === 'A' ? this.audioPlayerARef()?.nativeElement : this.audioPlayerBRef()?.nativeElement;
            if (player) {
                player.currentTime = 0;
                player.play();
            }
        } else {
            this.playNextOnDeck(deck);
        }
    }

    onScratchStart(event: MouseEvent | TouchEvent, deck: 'A' | 'B'): void {
        // Basic scratch implementation placeholder
        console.log(`Scratch start on deck ${deck}`);
    }

    // --- Playlist & Track Management ---
    handleFiles(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files) return;
        const newTracks: Track[] = Array.from(input.files).map(file => ({
            name: file.name,
            url: URL.createObjectURL(file)
        }));
        this.playlist.update(current => [...current, ...newTracks]);
    }

    playNext(): void {
        const playlistSize = this.playlist().length;
        if (playlistSize === 0) return;
        const nextIndex = this.shuffle() 
            ? Math.floor(Math.random() * playlistSize)
            : (this.currentTrackIndex() + 1) % playlistSize;
        this.currentTrackIndex.set(nextIndex);
        if (this.isPlaying()) {
            const player = this.audioPlayerRef()?.nativeElement;
            if(player) {
                player.src = this.currentPlayerTrack()!.url;
                player.load();
                player.play();
            }
        }
    }

    playPrevious(): void {
        const playlistSize = this.playlist().length;
        if (playlistSize === 0) return;
        const prevIndex = (this.currentTrackIndex() - 1 + playlistSize) % playlistSize;
        this.currentTrackIndex.set(prevIndex);
        if (this.isPlaying()) {
            const player = this.audioPlayerRef()?.nativeElement;
            if (player) {
                player.src = this.currentPlayerTrack()!.url;
                player.load();
                player.play();
            }
        }
    }

    // --- UI Toggles & View Changers ---
    toggleMainViewMode(): void {
        const modes: MainViewMode[] = ['player', 'dj', 'piano-roll', 'image-editor', 'video-editor', 'networking', 'profile', 'tha-spot'];
        const currentIndex = modes.indexOf(this.mainViewMode());
        const nextIndex = (currentIndex + 1) % modes.length;
        this.userContextService.setMainViewMode(modes[nextIndex]);
    }

    toggleEqPanel(): void {
        this.showEqPanel.update(v => !v);
    }

    toggleChatbot(): void {
        this.showChatbot.update(v => !v);
    }

    toggleRepeat(): void {
        this.repeat.update(v => !v);
    }
    
    toggleShuffle(): void {
        this.shuffle.update(v => !v);
    }

    // --- Event Handlers ---
    onMasterEqChange(settings: number[]): void {
        this.eqSettings.set(settings);
        // Apply EQ settings to audio context (placeholder)
        console.log('Master EQ updated:', settings);
    }

    handleImageGenerated(imageUrl: string): void {
        this.userContextService.setLastImageUrl(imageUrl);
        this.userContextService.setMainViewMode('player');
    }
    
    handleImageSelectedForAlbumArt(imageUrl: string): void {
        this.imageToApplyAsAlbumArt.set(imageUrl);
        this.showApplyAlbumArtModal.set(true);
    }

    applyImageAsAlbumArt(target: 'player' | 'A' | 'B'): void {
        const imageUrl = this.imageToApplyAsAlbumArt();
        if (!imageUrl) return;
    
        if (target === 'player' && this.currentPlayerTrack()) {
          const track = this.currentPlayerTrack()!;
          track.albumArtUrl = imageUrl;
          this.playlist.update(list => [...list]); // Trigger change detection
        } else if (target === 'A') {
          this.deckA.update(d => ({ ...d, track: d.track ? { ...d.track, albumArtUrl: imageUrl } : null }));
        } else if (target === 'B') {
          this.deckB.update(d => ({ ...d, track: d.track ? { ...d.track, albumArtUrl: imageUrl } : null }));
        }
        this.showApplyAlbumArtModal.set(false);
        this.imageToApplyAsAlbumArt.set(null);
      }
    
      randomizeTheme(): void {
        const currentTheme = this.currentTheme();
        const currentIndex = this.THEMES.findIndex(t => t.name === currentTheme?.name);
        let nextIndex;
        do {
          nextIndex = Math.floor(Math.random() * this.THEMES.length);
        } while (nextIndex === currentIndex);
        this.userContextService.setTheme(this.THEMES[nextIndex]);
      }

    // --- Utility Methods ---
    formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    getMasterAnalyser(): AnalyserNode {
        return this.masterAnalyser;
    }
}
