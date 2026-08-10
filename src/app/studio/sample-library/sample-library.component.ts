import { Component, inject, signal, computed, OnInit } from '@angular/core';
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

  private rawSamples: Array<{
    id: string;
    name: string;
    category: string;
    tags: string[];
    icon: string;
  }> = [
    {
      id: 'kick',
      name: '808 KICK',
      category: 'drum',
      tags: ['808', 'kick', 'boom'],
      icon: 'graphic_eq',
    },
    {
      id: 'snare',
      name: 'SNARE 909',
      category: 'drum',
      tags: ['snare', 'crisp'],
      icon: 'graphic_eq',
    },
    {
      id: 'clap',
      name: 'CLAP TIGHT',
      category: 'drum',
      tags: ['clap', 'tight'],
      icon: 'graphic_eq',
    },
    {
      id: 'hat',
      name: 'HH CLOSED',
      category: 'drum',
      tags: ['hat', 'closed'],
      icon: 'graphic_eq',
    },
    {
      id: 'crash',
      name: 'CRASH METAL',
      category: 'drum',
      tags: ['crash', 'metal'],
      icon: 'graphic_eq',
    },
    {
      id: 'percussion',
      name: 'PERC LOOP',
      category: 'drum',
      tags: ['perc', 'loop'],
      icon: 'graphic_eq',
    },
    {
      id: 'live-kick',
      name: 'LIVE KICK',
      category: 'drum',
      tags: ['live', 'kick'],
      icon: 'mic_external_on',
    },
    {
      id: 'live-vocal',
      name: 'LIVE VOCAL',
      category: 'vox',
      tags: ['live', 'vocal'],
      icon: 'mic',
    },
    {
      id: 'bass-sub',
      name: 'SUB BASS',
      category: 'bass',
      tags: ['bass', 'sub'],
      icon: 'waves',
    },
    {
      id: 'bass-reese',
      name: 'REESE BASS',
      category: 'bass',
      tags: ['bass', 'reese'],
      icon: 'waves',
    },
    {
      id: 'keys-rhodes',
      name: 'RHODES PIANO',
      category: 'keys',
      tags: ['keys', 'piano', 'rhodes'],
      icon: 'piano',
    },
    {
      id: 'keys-wurli',
      name: 'WURLITZER',
      category: 'keys',
      tags: ['keys', 'electric'],
      icon: 'piano',
    },
    {
      id: 'lead-saw',
      name: 'SAW LEAD',
      category: 'lead',
      tags: ['lead', 'saw'],
      icon: 'graphic_eq',
    },
    {
      id: 'lead-pluck',
      name: 'PLUCK SYNTH',
      category: 'lead',
      tags: ['lead', 'pluck'],
      icon: 'graphic_eq',
    },
    {
      id: 'pad-glass',
      name: 'GLASS PAD',
      category: 'pad',
      tags: ['pad', 'glass'],
      icon: 'layers',
    },
    {
      id: 'pad-strings',
      name: 'STRINGS PAD',
      category: 'pad',
      tags: ['pad', 'strings'],
      icon: 'layers',
    },
    {
      id: 'fx-riser',
      name: 'RISER FX',
      category: 'vfx',
      tags: ['fx', 'riser'],
      icon: 'auto_awesome',
    },
    {
      id: 'fx-impact',
      name: 'IMPACT FX',
      category: 'vfx',
      tags: ['fx', 'impact'],
      icon: 'auto_awesome',
    },
    {
      id: 'fx-down',
      name: 'DOWNLIFTER',
      category: 'vfx',
      tags: ['fx', 'downlifter'],
      icon: 'auto_awesome',
    },
    {
      id: 'loop-trap',
      name: 'TRAP LOOP',
      category: 'loop',
      tags: ['loop', 'trap'],
      icon: 'loop',
    },
    {
      id: 'loop-rnb',
      name: 'R&B LOOP',
      category: 'loop',
      tags: ['loop', 'rnb'],
      icon: 'loop',
    },
    {
      id: 'loop-house',
      name: 'HOUSE LOOP',
      category: 'loop',
      tags: ['loop', 'house'],
      icon: 'loop',
    },
  ];

  categories = computed<LibraryCategory[]>(() => {
    const counts = new Map<string, number>();
    counts.set('all', this.rawSamples.length);
    for (const s of this.rawSamples) {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    return [
      {
        id: 'all',
        label: 'All',
        icon: 'grid_view',
        count: counts.get('all') ?? 0,
      },
      {
        id: 'drum',
        label: 'Drums',
        icon: 'drum',
        count: counts.get('drum') ?? 0,
      },
      {
        id: 'bass',
        label: 'Bass',
        icon: 'waves',
        count: counts.get('bass') ?? 0,
      },
      {
        id: 'keys',
        label: 'Keys',
        icon: 'piano',
        count: counts.get('keys') ?? 0,
      },
      {
        id: 'lead',
        label: 'Leads',
        icon: 'graphic_eq',
        count: counts.get('lead') ?? 0,
      },
      {
        id: 'pad',
        label: 'Pads',
        icon: 'layers',
        count: counts.get('pad') ?? 0,
      },
      { id: 'vox', label: 'Vox', icon: 'mic', count: counts.get('vox') ?? 0 },
      {
        id: 'vfx',
        label: 'FX',
        icon: 'auto_awesome',
        count: counts.get('vfx') ?? 0,
      },
      {
        id: 'loop',
        label: 'Loops',
        icon: 'loop',
        count: counts.get('loop') ?? 0,
      },
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
  dragSampleId = signal<string | null>(null);

  ngOnInit(): void {
    // Touch recorder to pull any offline takes metadata on mount
    void this.recorder.getOfflineRecordings().catch(() => []);
  }

  // ── Drag-to-track ────────────────────────────────────
  onDragStart(event: DragEvent, sampleId: string, name: string): void {
    this.dragSampleId.set(sampleId);
    event.dataTransfer?.setData(
      'application/smuve-sample',
      JSON.stringify({ id: sampleId, name })
    );
    event.dataTransfer!.effectAllowed = 'copy';
    if (event.dataTransfer?.setDragImage) {
      const el = document.createElement('div');
      el.textContent = name;
      el.style.cssText =
        'position:fixed;top:-100px;padding:8px 14px;background:var(--teal-500);color:#fff;border-radius:8px;font-size:11px;font-weight:800;pointer-events:none';
      document.body.appendChild(el);
      event.dataTransfer.setDragImage(el, 0, 0);
      setTimeout(() => el.remove(), 0);
    }
  }

  onDragEnd(): void {
    this.dragSampleId.set(null);
  }

  toggleTag(tag: string): void {
    this.haptic.light();
    if (this.selectedTag() === tag) {
      this.selectedTag.set(null);
    } else {
      this.selectedTag.set(tag);
    }
  }

  /** Map library entry IDs to real InstrumentsService preset IDs so "Load"
   *  produces an audible track (the catalog is metadata-only). Unknown IDs
   *  fall back to ensureTrack's default instrument. */
  private static readonly SAMPLE_TO_PRESET: Record<string, string> = {
    kick: 'trap-kit-elite',
    snare: 'trap-kit-elite',
    clap: 'trap-kit-elite',
    hat: 'trap-kit-elite',
    crash: 'trap-kit-elite',
    percussion: 'afro-cuban-kit',
    'live-kick': 'acoustic-kit-pro',
    'bass-sub': 'sub-commander',
    'bass-reese': 'reese-bass-neuro',
    'keys-rhodes': 'rhodes-mk2-stage',
    'keys-wurli': 'wurlitzer-200a-ep',
    'lead-saw': 'supersaw-stack',
    'lead-pluck': 'pluck-marimba-hybrid',
    'pad-glass': 'wavetable-dream',
    'pad-strings': 'ob-xa-strings',
    'fx-riser': 'cyber-stab',
    'fx-impact': 'cyber-stab',
    'fx-down': 'vhs-memory',
    'loop-trap': 'trap-kit-elite',
    'loop-rnb': 'rhodes-mk2-stage',
    'loop-house': 'modern-kit-elite',
  };

  loadSample(sampleId: string): void {
    this.haptic.medium();
    this.audioEngine.resume();
    const sample = this.rawSamples.find((s) => s.id === sampleId);
    const presetId =
      SampleLibraryComponent.SAMPLE_TO_PRESET[sampleId] ?? sampleId;
    this.musicManager.ensureTrack(presetId);
    this.snackbar.success(
      `Sample loaded: ${sample?.name ?? sampleId} → ${presetId}`
    );
  }

  /**
   * Audible preview — synthesizes a short, category-appropriate one-shot
   * through the live engine (drum thumps, tonal hits, FX sweeps). The library
   * catalog is metadata-only, so this is the real audition path.
   */
  async previewSample(sampleId: string, event?: Event): Promise<void> {
    event?.stopPropagation?.();
    if (this.previewingId() === sampleId) return;
    this.previewingId.set(sampleId);
    this.haptic.light();
    const sample = this.rawSamples.find((s) => s.id === sampleId);
    this.playSampleAudition(sample);
    setTimeout(() => {
      if (this.previewingId() === sampleId) {
        this.previewingId.set(null);
      }
    }, 450);
    this.snackbar.info(`Previewing ${sample?.name ?? sampleId}`);
  }

  /** Short synthesized one-shot per category — never throws, mobile-safe. */
  private playSampleAudition(sample?: {
    id: string;
    category: string;
    name: string;
  }): void {
    const ctx = this.audioEngine.ctx;
    if (!ctx) return;
    try {
      this.audioEngine.resume();
    } catch {
      /* context may be suspended — the source still gets scheduled */
    }
    const now = ctx.currentTime;
    const cat = sample?.category ?? 'drum';
    const id = sample?.id ?? '';
    const dur = 0.35;

    const out = ctx.createGain();
    out.connect(this.audioEngine.masterGain ?? ctx.destination);
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    // ── Percussive hits ────────────────────────────────────
    if (cat === 'drum' || cat === 'perc' || cat === 'loop') {
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      const isNoise =
        id.includes('hat') || id.includes('crash') || id.includes('clap');
      thump.frequency.setValueAtTime(
        isNoise ? 220 : id.includes('snare') ? 180 : 140,
        now
      );
      thump.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      thump.connect(out);
      thump.start(now);
      thump.stop(now + 0.25);

      if (isNoise) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 5000;
        const nb = ctx.createBuffer(
          1,
          Math.max(1, Math.floor(ctx.sampleRate * 0.08)),
          ctx.sampleRate
        );
        const data = nb.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.4;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = nb;
        noise.connect(hp);
        hp.connect(out);
        noise.start(now);
        noise.stop(now + 0.08);
      }
      return;
    }

    // ── Tonal hits ─────────────────────────────────────────
    const BASE: Record<string, number> = {
      bass: 55,
      keys: 330,
      lead: 440,
      pad: 220,
      vox: 392,
      organ: 262,
      guitar: 196,
      strings: 294,
      world: 294,
      piano: 262,
      brass: 233,
      woodwind: 392,
      choir: 392,
      vfx: 660,
    };
    const freq = BASE[cat] ?? 330;
    const osc = ctx.createOscillator();
    osc.type =
      cat === 'lead' || cat === 'vfx'
        ? 'sawtooth'
        : cat === 'pad' || cat === 'choir'
          ? 'triangle'
          : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = cat === 'lead' ? 2500 : 1200;
    osc.connect(flt);
    flt.connect(out);
    osc.start(now);
    osc.stop(now + dur);

    // Pads / choirs get a fifth for warmth
    if (cat === 'pad' || cat === 'choir') {
      const fifth = ctx.createOscillator();
      fifth.type = 'triangle';
      fifth.frequency.setValueAtTime(freq * 1.5, now);
      fifth.connect(flt);
      fifth.start(now);
      fifth.stop(now + dur);
    }
    // FX get a downward sweep
    if (cat === 'vfx') {
      osc.frequency.exponentialRampToValueAtTime(freq * 0.25, now + dur);
    }
  }
}
