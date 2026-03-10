import { Injectable, signal, computed, inject } from '@angular/core';
import { DeckService } from './deck.service';
import { AudioEngineService } from './audio-engine.service';
import { FileLoaderService } from './file-loader.service';
import { ExportService } from './export.service';

export interface GlobalTrack {
  id: string;
  title: string;
  artist: string;
  url?: string;
  buffer?: AudioBuffer;
}

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  private deckService = inject(DeckService);
  private audioEngine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private exportService = inject(ExportService);

  private defaultPlaylist: GlobalTrack[] = [
    { id: '1', title: 'NEON ARCHITECT', artist: 'S.M.U.V.E. CORE' },
    { id: '2', title: 'SYNTHETIC DREAMS', artist: 'AI SYNDICATE' },
    { id: '3', title: 'CYBERPUNK BEATS', artist: 'TECHNO ARCHITECT' },
    { id: '4', title: 'GLITCH IN THE MATRIX', artist: 'S.M.U.V.E. PRO' }
  ];

  playlist = signal<GlobalTrack[]>(this.defaultPlaylist);
  currentIndex = signal<number>(0);

  isPlaying = computed(() => this.deckService.deckA().isPlaying);
  currentTrack = computed(() => this.playlist()[this.currentIndex()]);

  progress = computed(() => {
    const d = this.deckService.deckA();
    return d.duration > 0 ? (d.progress / d.duration) * 100 : 0;
  });

  isShuffle = signal(false);
  isRepeat = signal(false);

  togglePlay() {
    this.deckService.togglePlay('A');
  }

  next() {
    const playlist = this.playlist();
    if (playlist.length === 0) return;

    if (this.isRepeat()) {
      this.autoLoadCurrent();
      return;
    }

    let nextIndex = this.currentIndex() + 1;
    if (this.isShuffle()) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else if (nextIndex >= playlist.length) {
      nextIndex = 0;
    }

    this.currentIndex.set(nextIndex);
    this.autoLoadCurrent();
  }

  previous() {
    let prevIndex = this.currentIndex() - 1;
    if (prevIndex < 0) {
      prevIndex = this.playlist().length - 1;
    }
    this.currentIndex.set(prevIndex);
    this.autoLoadCurrent();
  }

  private autoLoadCurrent() {
    const track = this.currentTrack();
    if (track && track.buffer) {
      this.deckService.loadDeckBuffer('A', track.buffer, track.title);
      if (!this.isPlaying()) this.togglePlay();
    }
  }

  toggleShuffle() { this.isShuffle.set(!this.isShuffle()); }
  toggleRepeat() { this.isRepeat.set(!this.isRepeat()); }

  async loadExternalTrack() {
    const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
    if (files && files.length > 0) {
      const file = files[0];
      const buffer = await this.fileLoader.decodeToAudioBuffer(
        this.audioEngine.getContext(),
        file
      );

      const newTrack: GlobalTrack = {
        id: Date.now().toString(),
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: 'Local Import',
        buffer: buffer
      };

      this.playlist.update(p => [newTrack, ...p]);
      this.currentIndex.set(0);
      this.deckService.loadDeckBuffer('A', buffer, file.name);
      if (!this.isPlaying()) this.togglePlay();
    }
  }

  exportCurrent() {
    const deck = this.audioEngine.getDeck('A');
    const buffer = deck ? (deck as any).buffer : null;
    if (!buffer) return;
    const wavBuffer = this.exportService.audioBufferToWav(buffer);
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    const track = this.currentTrack();
    a.download = `${track?.title || 'exported_track'}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
