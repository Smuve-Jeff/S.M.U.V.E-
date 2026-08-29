import { Component, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SmartRecordingService,
  CompGroup,
  CompTake,
} from '../smart-recording.service';
import {
  VocalCompSuggesterService,
  CompSuggestion,
} from '../vocal-comp-suggester.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SnackbarService } from '../../services/snackbar.service';
import { LoggingService } from '../../services/logging.service';

type CompareMode = 'off' | 'a-b' | 'all';

@Component({
  selector: 'app-vocal-comp-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vocal-comp-view.component.html',
  styleUrls: ['./vocal-comp-view.component.css'],
})
export class VocalCompViewComponent {
  private smartRecording = inject(SmartRecordingService);
  private audioEngine = inject(AudioEngineService);
  private snackbar = inject(SnackbarService);
  private logger = inject(LoggingService);
  private suggester = inject(VocalCompSuggesterService);

  // ── State ──────────────────────────────────────────────
  selectedGroupId = signal<string | null>(null);
  compareMode = signal<CompareMode>('off');
  abReferenceTakeId = signal<string | null>(null);
  playingTakeId = signal<string | null>(null);
  isExporting = signal(false);
  searchQuery = signal('');

  /** Suggested "best" take from the AI comp suggester for the selected group. */
  suggestion = signal<CompSuggestion | null>(null);
  searchingSuggestion = signal(false);

  // ── Computed ───────────────────────────────────────────
  compGroups = computed(() => this.smartRecording.compGroups());

  selectedGroup = computed(() => {
    const id = this.selectedGroupId() || this.compGroups()[0]?.id || null;
    if (id !== this.selectedGroupId()) {
      // Auto-select first group
      return this.compGroups().find((g) => g.id === id) || null;
    }
    return this.compGroups().find((g) => g.id === id) || null;
  });

  takes = computed(() => this.selectedGroup()?.takes || []);

  selectedTake = computed(() => {
    const group = this.selectedGroup();
    if (!group?.selectedTakeId) return null;
    return group.takes.find((t) => t.id === group.selectedTakeId) || null;
  });

  compTake = computed(() => {
    return this.takes().find((t) => t.isCompSelection) || null;
  });

  hasTakes = computed(() => this.takes().length > 0);

  takeCount = computed(() => this.takes().length);

  filteredGroups = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.compGroups();
    return this.compGroups().filter(
      (g) =>
        g.sectionLabel.toLowerCase().includes(q) ||
        g.trackName.toLowerCase().includes(q)
    );
  });

  // Waveform visualization data
  waveformData = signal<number[]>([]);

  // ── Group management ───────────────────────────────────
  selectGroup(groupId: string) {
    this.selectedGroupId.set(groupId);
    this.compareMode.set('off');
    this.playingTakeId.set(null);
  }

  createNewGroup() {
    this.smartRecording.startNewCompGroup(
      'vocal-track',
      'Vocal Track',
      `Section ${this.compGroups().length + 1}`
    );
    this.selectedGroupId.set(this.smartRecording.activeCompGroupId());
    this.snackbar.info('New comp group created');
  }

  deleteGroup(groupId: string) {
    const group = this.compGroups().find((g) => g.id === groupId);
    if (!group) return;
    this.smartRecording.deleteCompGroup(groupId);
    if (this.selectedGroupId() === groupId) {
      this.selectedGroupId.set(null);
    }
    this.snackbar.info(`Group "${group.sectionLabel}" deleted`);
  }

  renameGroup(groupId: string, newLabel: string) {
    this.smartRecording.compGroups.update((groups) =>
      groups.map((g) =>
        g.id === groupId ? { ...g, sectionLabel: newLabel } : g
      )
    );
  }

  // ── Take operations ────────────────────────────────────
  selectTake(takeId: string) {
    const group = this.selectedGroup();
    if (!group) return;
    this.smartRecording.selectCompTake(group.id, takeId);
    this.compareMode.set('off');
  }

  toggleMute(groupId: string, takeId: string) {
    this.smartRecording.toggleTakeMute(groupId, takeId);
  }

  deleteTake(groupId: string, takeId: string) {
    this.smartRecording.deleteTake(groupId, takeId);
    this.snackbar.info('Take deleted');
  }

  playTake(takeId: string) {
    const group = this.selectedGroup();
    if (!group) return;
    const take = group.takes.find((t) => t.id === takeId);
    if (!take || !take.url) return;

    // Stop current playback
    this.stopPlayback();

    // Play the take blob
    const audio = new Audio(take.url);
    audio.onended = () => this.playingTakeId.set(null);
    audio.play();
    this.playingTakeId.set(takeId);
    // Store reference for stop
    this._currentAudio = audio;
  }

  stopPlayback() {
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio = null;
    }
    this.playingTakeId.set(null);
  }

  // ── A/B Comparison ────────────────────────────────────
  toggleCompare() {
    const modes: CompareMode[] = ['off', 'a-b', 'all'];
    const currentIndex = modes.indexOf(this.compareMode());
    const nextIndex = (currentIndex + 1) % modes.length;
    this.compareMode.set(modes[nextIndex]);

    if (modes[nextIndex] === 'off') {
      this.abReferenceTakeId.set(null);
    } else if (modes[nextIndex] === 'a-b' && this.compTake()) {
      // Set reference to the current comp selection
      this.abReferenceTakeId.set(this.compTake()?.id || null);
    }
  }

  setReferenceTake(takeId: string) {
    this.abReferenceTakeId.set(takeId);
    this.snackbar.info('Reference take set for A/B comparison');
  }

  // ── Comp assembly ─────────────────────────────────────
  assembleComp(): string {
    // Collect all non-muted takes and play them in sequence
    const group = this.selectedGroup();
    if (!group) return '';

    const activeTakes = group.takes.filter((t) => !t.isMuted);
    if (activeTakes.length === 0) return '';

    // Return the URL of the comp-selected take
    const compTake = group.takes.find((t) => t.isCompSelection);
    if (compTake?.url) return compTake.url;

    return activeTakes[activeTakes.length - 1]?.url || '';
  }

  // ── AI comp suggestion ─────────────────────────────────
  suggestBestTake() {
    const group = this.selectedGroup();
    if (!group) return;
    this.searchingSuggestion.set(true);
    const found = this.suggester.suggestBestTake(group.id);
    this.suggestion.set(found);
    this.searchingSuggestion.set(false);
    if (found) {
      this.snackbar.info(
        `AI suggests Take ${found.takeNumber} (${found.score}/100)`
      );
    } else {
      this.snackbar.warning('No usable takes to suggest from — record at least one');
    }
  }

  applySuggestedTake() {
    const group = this.selectedGroup();
    const s = this.suggestion();
    if (!group || !s) return;
    this.smartRecording.selectCompTake(group.id, s.takeId);
    this.snackbar.success(`Applied suggested Take ${s.takeNumber} as the comp`);
  }

  clearSuggestion() {
    this.suggestion.set(null);
  }

  // ── Export ────────────────────────────────────────────
  async exportComp() {
    const group = this.selectedGroup();
    if (!group || group.takes.length === 0) return;

    this.isExporting.set(true);

    try {
      // Find the comp selection or fall back to last take
      const compTake =
        group.takes.find((t) => t.isCompSelection) ||
        group.takes[group.takes.length - 1];

      if (!compTake?.blob) {
        this.snackbar.warning('No comp selection to export');
        return;
      }

      // Trigger download
      const a = document.createElement('a');
      a.href = compTake.url;
      a.download = `SMUVE_Comp_${group.sectionLabel.replace(/\s+/g, '_')}_${Date.now()}.wav`;
      a.click();

      this.snackbar.success(`Comp "${group.sectionLabel}" exported as WAV`);
    } catch (e) {
      this.logger.error('Export failed', e);
      this.snackbar.error('Export failed');
    } finally {
      this.isExporting.set(false);
    }
  }

  async exportAllTakes() {
    const group = this.selectedGroup();
    if (!group || group.takes.length === 0) return;

    this.isExporting.set(true);

    try {
      for (const take of group.takes) {
        if (!take.url) continue;
        const a = document.createElement('a');
        a.href = take.url;
        a.download = `SMUVE_Take${take.takeNumber}_${group.sectionLabel.replace(/\s+/g, '_')}.wav`;
        a.click();
        // Small delay between downloads
        await new Promise((r) => setTimeout(r, 200));
      }
      this.snackbar.success(`${group.takes.length} takes exported`);
    } catch (e) {
      this.logger.error('Export all failed', e);
      this.snackbar.error('Export failed');
    } finally {
      this.isExporting.set(false);
    }
  }

  // ── Utility ───────────────────────────────────────────
  formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs.toString().padStart(2, '0')}`;
  }

  getTakeColor(takeNumber: number): string {
    const colors = [
      '#10b981',
      '#a855f7',
      '#f59e0b',
      '#ec4899',
      '#3b82f6',
      '#ef4444',
      '#14b8a6',
      '#f97316',
    ];
    return colors[(takeNumber - 1) % colors.length];
  }

  generateWaveformBars(): number[] {
    // Generate pseudo-random waveform bars for visual effect
    const bars: number[] = [];
    const count = 48;
    for (let i = 0; i < count; i++) {
      // Use a seeded pattern based on the selected group id for consistency
      const seed =
        this.selectedGroupId()?.charCodeAt(
          i % (this.selectedGroupId()?.length || 1)
        ) || 50;
      const base = (Math.sin(i * 0.5 + seed) + 1) / 2; // 0-1
      const variation = Math.sin(i * 1.3 + seed * 0.7) * 0.3;
      bars.push(Math.max(0.05, Math.min(1, base + variation)));
    }
    return bars;
  }

  private _currentAudio: HTMLAudioElement | null = null;
}
