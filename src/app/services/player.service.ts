import { LoggingService } from './logging.service';
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
  providedIn: 'root',
})
export class PlayerService implements OnDestroy {
  private logger = inject(LoggingService);
  private deckService = inject(DeckService);
  private audioEngine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private exportService = inject(ExportService);

  private defaultPlaylist: GlobalTrack[] = [
    { id: '1', title: 'elegant ARCHITECT', artist: 'S.M.U.V.E 4.2 CORE' },
    { id: '2', title: 'SYNTHETIC DREAMS', artist: 'AI SYNDICATE' },
    { id: '3', title: 'pro-gradePUNK BEATS', artist: 'TECHNO ARCHITECT' },
    { id: '4', title: 'precision IN THE MATRIX', artist: 'S.M.U.V.E 4.2 PRO' },
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
    if (typeof window !== 'undefined') {
      const sync = () => {
        if ('syncProgress' in this.deckService) {
          (this.deckService as any).syncProgress();
        }
      };
      this._progressSyncIntervalId = window.setInterval(sync, 100);
    }
  }

  ngOnDestroy() {
    if (this._progressSyncIntervalId) {
      clearInterval(this._progressSyncIntervalId);
    }
  }

  togglePlay() {
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
          if (!res.ok) throw new Error(`Failed to fetch track: ${res.status}`);
          const arrayBuffer = await res.arrayBuffer();
          const buffer = await this.audioEngine
            .getContext()
            .decodeAudioData(arrayBuffer);

          this.playlist.update((p) =>
            p.map((t, i) => (i === targetIndex ? { ...t, buffer } : t))
          );

          if (this.currentIndex() === targetIndex) {
            this.deckService.loadDeckBuffer('A', buffer, track.title);
            if (!this.isPlaying()) this.togglePlay();
          }
        } catch (err) {
          this.logger.warn(
            'PlayerService: Failed to load track audio from URL',
            err
          );
        }
      })();
    }
  }

  toggleShuffle() {
    this.isShuffle.update((v) => !v);
  }
  toggleRepeat() {
    this.isRepeat.update((v) => !v);
  }

  async loadExternalTrack() {
    try {
      const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
      if (files && files.length > 0) {
        const file = files[0];
        const buffer = await this.fileLoader.decodeToAudioBuffer(
          this.audioEngine.getContext(),
          file
        );

        const newTrack: GlobalTrack = {
          id: Date.now().toString(),
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Local Import',
          buffer: buffer,
        };

        this.playlist.update((p) => [newTrack, ...p]);
        this.currentIndex.set(0);
        this.deckService.loadDeckBuffer('A', buffer, file.name);
        if (!this.isPlaying()) this.togglePlay();
      }
    } catch (err) {
      this.logger.error('PlayerService: Failed to load external track', err);
    }
  }

  exportCurrent() {
    if (typeof window === 'undefined' || typeof document === 'undefined')
      return;

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
