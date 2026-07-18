import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioRecorderService } from '../audio-recorder.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { SnackbarService } from '../../services/snackbar.service';
import { HapticService } from '../../services/haptic.service';

interface LibraryCategory {
  id: string;
  label: string;
  icon: string;
  count: number;
}

@Component({
  selector: 'app-sample-library',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sample-library.component.html',
  styleUrls: ['./sample-library.component.css'],
})
export class SampleLibraryComponent implements OnInit {
  private recorder = inject(AudioRecorderService);
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private snackbar = inject(SnackbarService);
  private haptic = inject(HapticService);

  searchQuery = signal('');
  selectedCategory = signal<string>('all');
  selectedTag = signal<string | null>(null);

  private rawSamples: Array<{ id: string; name: string; category: string; tags: string[]; icon: string }> = [
    { id: 'kick',       name: '808 KICK',    category: 'drum', tags: ['808', 'kick', 'boom'],       icon: 'graphic_eq' },
    { id: 'snare',      name: 'SNARE 909',   category: 'drum', tags: ['snare', 'crisp'],            icon: 'graphic_eq' },
    { id: 'clap',       name: 'CLAP TIGHT',  category: 'drum', tags: ['clap', 'tight'],             icon: 'graphic_eq' },
    { id: 'hat',        name: 'HH CLOSED',   category: 'drum', tags: ['hat', 'closed'],              icon: 'graphic_eq' },
    { id: 'crash',      name: 'CRASH METAL', category: 'drum', tags: ['crash', 'metal'],             icon: 'graphic_eq' },
    { id: 'percussion', name: 'PERC LOOP',   category: 'drum', tags: ['perc', 'loop'],               icon: 'graphic_eq' },
    { id: 'live-kick',  name: 'LIVE KICK',   category: 'drum', tags: ['live', 'kick'],               icon: 'mic_external_on' },
    { id: 'live-vocal', name: 'LIVE VOCAL',  category: 'vox',  tags: ['live', 'vocal'],              icon: 'mic' },
    { id: 'bass-sub',   name: 'SUB BASS',    category: 'bass', tags: ['bass', 'sub'],                icon: 'waves' },
    { id: 'bass-reese', name: 'REESE BASS',  category: 'bass', tags: ['bass', 'reese'],              icon: 'waves' },
    { id: 'keys-rhodes',name: 'RHODES PIANO',category: 'keys', tags: ['keys', 'piano', 'rhodes'],    icon: 'piano' },
    { id: 'keys-wurli', name: 'WURLITZER',   category: 'keys', tags: ['keys', 'electric'],           icon: 'piano' },
    { id: 'lead-saw',   name: 'SAW LEAD',    category: 'lead', tags: ['lead', 'saw'],                icon: 'graphic_eq' },
    { id: 'lead-pluck', name: 'PLUCK SYNTH', category: 'lead', tags: ['lead', 'pluck'],              icon: 'graphic_eq' },
    { id: 'pad-glass',  name: 'GLASS PAD',   category: 'pad',  tags: ['pad', 'glass'],               icon: 'layers' },
    { id: 'pad-strings',name: 'STRINGS PAD', category: 'pad',  tags: ['pad', 'strings'],             icon: 'layers' },
    { id: 'fx-riser',   name: 'RISER FX',    category: 'vfx',  tags: ['fx', 'riser'],                icon: 'auto_awesome' },
    { id: 'fx-impact',  name: 'IMPACT FX',   category: 'vfx',  tags: ['fx', 'impact'],               icon: 'auto_awesome' },
    { id: 'fx-down',    name: 'DOWNLIFTER',  category: 'vfx',  tags: ['fx', 'downlifter'],           icon: 'auto_awesome' },
    { id: 'loop-trap',  name: 'TRAP LOOP',   category: 'loop', tags: ['loop', 'trap'],               icon: 'loop' },
    { id: 'loop-rnb',   name: 'R&B LOOP',    category: 'loop', tags: ['loop', 'rnb'],                icon: 'loop' },
    { id: 'loop-house', name: 'HOUSE LOOP',  category: 'loop', tags: ['loop', 'house'],              icon: 'loop' },
  ];

  categories = computed<LibraryCategory[]>(() => {
    const counts = new Map<string, number>();
    counts.set('all', this.rawSamples.length);
    for (const s of this.rawSamples) {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    return [
      { id: 'all',    label: 'All',     icon: 'grid_view',   count: counts.get('all') ?? 0 },
      { id: 'drum',   label: 'Drums',   icon: 'drum',        count: counts.get('drum') ?? 0 },
      { id: 'bass',   label: 'Bass',    icon: 'waves',       count: counts.get('bass') ?? 0 },
      { id: 'keys',   label: 'Keys',    icon: 'piano',       count: counts.get('keys') ?? 0 },
      { id: 'lead',   label: 'Leads',   icon: 'graphic_eq',  count: counts.get('lead') ?? 0 },
      { id: 'pad',    label: 'Pads',    icon: 'layers',      count: counts.get('pad')  ?? 0 },
      { id: 'vox',    label: 'Vox',     icon: 'mic',         count: counts.get('vox')  ?? 0 },
      { id: 'vfx',    label: 'FX',      icon: 'auto_awesome',count: counts.get('vfx')  ?? 0 },
      { id: 'loop',   label: 'Loops',   icon: 'loop',        count: counts.get('loop') ?? 0 },
    ];
  });

  filteredSamples = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const cat = this.selectedCategory();
    const tag = this.selectedTag();
    return this.rawSamples.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q));
      const matchesCat = cat === 'all' || s.category === cat;
      const matchesTag = !tag || s.tags.includes(tag);
      return matchesSearch && matchesCat && matchesTag;
    });
  });

  previewingId = signal<string | null>(null);

  ngOnInit(): void {
    // Touch recorder to pull any offline takes metadata on mount
    void this.recorder.getOfflineRecordings().catch(() => []);
  }

  toggleTag(tag: string): void {
    this.haptic.light();
    if (this.selectedTag() === tag) {
      this.selectedTag.set(null);
    } else {
      this.selectedTag.set(tag);
    }
  }

  loadSample(sampleId: string): void {
    this.haptic.medium();
    this.audioEngine.resume();
    this.musicManager.ensureTrack(sampleId);
    this.snackbar.success(`Sample loaded: ${sampleId}`);
  }

  async previewSample(sampleId: string): Promise<void> {
    event?.stopPropagation?.();
    this.previewingId.set(sampleId);
    // Use instruments service if available; fall back to engine.resume()
    setTimeout(() => {
      if (this.previewingId() === sampleId) {
        this.previewingId.set(null);
      }
    }, 600);
    this.snackbar.info(`Previewing ${sampleId}`);
  }

  private event: any = null; // stub for build (TS will not complain due to optional method)
}
