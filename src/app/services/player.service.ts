import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
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
export class PlayerService implements OnDestroy {
  private deckService = inject(DeckService);
  private audioEngine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private exportService = inject(ExportService);

  private defaultPlaylist: GlobalTrack[] = [
    { id: '1', title: 'elegant ARCHITECT', artist: 'S.M.U.V.E. CORE' },
    { id: '2', title: 'SYNTHETIC DREAMS', artist: 'AI SYNDICATE' },
    { id: '3', title: 'pro-gradePUNK BEATS', artist: 'TECHNO ARCHITECT' },
    { id: '4', title: 'precision IN THE MATRIX', artist: 'S.M.U.V.E. PRO' }
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

  private _progressSyncIntervalId: any = null;

  constructor() {
    // Keep DeckService's deck state fresh
    if (typeof globalThis !== 'undefined' && typeof globalThis.setInterval === 'function') {
      const sync = () => (this.deckService as any).syncProgress?.();
      this._progressSyncIntervalId = globalThis.setInterval(sync, 100);
  private readonly _progressSyncIntervalId: any = (() => {
    const sync = () => {
      if ('syncProgress' in this.deckService) {
        (this.deckService as any).syncProgress();
      }
    };
    if (typeof window !== 'undefined') {
      return window.setInterval(sync, 100);
    }
    return null;
  })();

  ngOnDestroy() {
    if (this._progressSyncIntervalId) {
      clearInterval(this._progressSyncIntervalId);
    }
  }

  togglePlay() {
    (this.deckService as any).syncProgress?.();
    if ('syncProgress' in this.deckService) {
      (this.deckService as any).syncProgress();
    }
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
    const playlist = this.playlist();
    if (playlist.length === 0) return;

    let prevIndex = this.currentIndex() - 1;
    if (prevIndex < 0) {
      prevIndex = playlist.length - 1;
    }
    this.currentIndex.set(prevIndex);
    this.autoLoadCurrent();
  }

  private autoLoadCurrent() {
    const track = this.currentTrack();
    const targetIndex = this.currentIndex();
    const track = this.playlist()[targetIndex];

    if (!track) return;

    if (track.buffer) {
      this.deckService.loadDeckBuffer('A', track.buffer, track.title);
      if (!this.isPlaying()) this.togglePlay();
    } else if (track.url) {
      void (async () => {
        try {
          const res = await fetch(track.url);
          const arrayBuffer = await res.arrayBuffer();
          const buffer = await this.audioEngine.getContext().decodeAudioData(arrayBuffer);

          this.playlist.update((p) =>
            p.map((t, i) => (i === this.currentIndex() ? { ...t, buffer } : t))
          );

          this.deckService.loadDeckBuffer('A', buffer, track.title);
          if (!this.isPlaying()) this.togglePlay();
          if (!res.ok) throw new Error(`Failed to fetch track: ${res.status}`);
          const arrayBuffer = await res.arrayBuffer();
          const buffer = await this.audioEngine.getContext().decodeAudioData(arrayBuffer);

          // Use the captured targetIndex to ensure we update the correct track entry
          this.playlist.update((p) =>
            p.map((t, i) => (i === targetIndex ? { ...t, buffer } : t))
          );

          // Only load and play if the user hasn't already switched to another track
          if (this.currentIndex() === targetIndex) {
            this.deckService.loadDeckBuffer('A', buffer, track.title);
            if (!this.isPlaying()) this.togglePlay();
          }
        } catch (err) {
          console.warn('PlayerService: Failed to load track audio from URL', err);
        }
      })();
    } else {
      console.warn('PlayerService: Track has no buffer or URL; cannot auto-load', track);
    }
  }

  toggleShuffle() { this.isShuffle.update(v => !v); }
  toggleRepeat() { this.isRepeat.update(v => !v); }

  async loadExternalTrack() {
    const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
    if (files.length > 0) {
      const file = files[0];
      try {
        const buffer = await this.fileLoader.decodeToAudioBuffer(this.audioEngine.getContext(), file);
    try {
      const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
      if (files && files.length > 0) {
        const file = files[0];
        const buffer = await this.fileLoader.decodeToAudioBuffer(this.audioEngine.getContext(), file);

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
      } catch (err) {
        console.error('PlayerService: Failed to load external track', err);
      }
      }
    } catch (err) {
      console.error('PlayerService: Failed to load external track', err);
    }
  }

  exportCurrent() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const buffer = this.audioEngine.getDeck('A').buffer;
    if (!buffer) return;
    const wavBuffer = this.exportService.audioBufferToWav(buffer);
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentTrack()?.title || 'exported_track'}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
