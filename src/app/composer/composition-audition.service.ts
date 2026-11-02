import { Injectable, computed, inject, signal } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { NotificationService } from '../services/notification.service';
import type { ComposerPart, Composition, DrumLane } from './composer.types';

/** A score-shaped preview that does not need a full Composition record. */
export interface AuditionScore {
  id: string;
  bpm: number;
  durationSeconds: number;
  totalBars: number;
  parts: ComposerPart[];
}

/**
 * Audition renderer.
 *
 * The composition engine writes a score. This service turns that score into
 * audible sound in the browser so the artist can judge a pass before loading
 * anything into the Studio — no server, no uploaded audio, no fake waveform.
 *
 * It is a deliberately simple synth: pitched parts use filtered oscillators,
 * drums use synthesized transients and noise. It is an audition, not a mix —
 * the Studio instruments are where the record gets its tone.
 */
@Injectable({ providedIn: 'root' })
export class CompositionAuditionService {
  private engine = inject(AudioEngineService);
  private notify = inject(NotificationService);

  /** Hard cap so an audition always starts quickly. */
  readonly maxAuditionSeconds = 120;

  rendering = signal(false);
  error = signal<string | null>(null);
  readyCompositionId = signal<string | null>(null);
  previewSeconds = signal(0);
  previewBars = signal(0);

  private buffer: AudioBuffer | null = null;
  private noise: AudioBuffer | null = null;
  private renderToken = 0;

  readonly playing = computed(() => this.engine.auditionPlaying());
  readonly progress = computed(() => this.engine.auditionProgress());

  readonly playingThis = computed(
    () => this.playing() && this.readyCompositionId() !== null
  );

  async toggle(composition: Composition): Promise<void> {
    if (this.playing()) {
      this.stop();
      return;
    }
    if (this.buffer && this.readyCompositionId() === composition.id) {
      this.play(composition);
      return;
    }
    await this.render(composition);
    if (
      this.buffer &&
      this.readyCompositionId() === composition.id &&
      !this.error()
    ) {
      this.play(composition);
    }
  }

  /**
   * Forces this exact composition to play. Unlike `toggle`, this never just
   * stops — used when an artist picks a specific side of an A/B comparison.
   */
  async start(composition: Composition): Promise<void> {
    this.stop();
    if (this.buffer && this.readyCompositionId() === composition.id) {
      this.play(composition);
      return;
    }
    await this.render(composition);
    if (
      this.buffer &&
      this.readyCompositionId() === composition.id &&
      !this.error()
    ) {
      this.play(composition);
    }
  }

  play(composition: Composition): void {
    if (!this.buffer) {
      void this.render(composition);
      return;
    }
    this.engine.playAudition(this.buffer, () => {
      // The engine clears its own playback flags; nothing else to release.
    });
  }

  stop(): void {
    this.engine.stopAudition();
  }

  /** Renders the score to an AudioBuffer, then plays it. */
  async render(composition: Composition): Promise<void> {
    await this.renderScore({
      id: composition.id,
      bpm: composition.bpm,
      durationSeconds: composition.durationSeconds,
      totalBars: composition.totalBars,
      parts: composition.parts,
    });
  }

  /** Render any score-shaped part list without requiring a Composition. */
  async renderScore(score: AuditionScore): Promise<void> {
    if (this.rendering()) return;
    const token = ++this.renderToken;
    this.rendering.set(true);
    this.error.set(null);
    this.buffer = null;
    this.readyCompositionId.set(null);

    try {
      const seconds = Math.min(
        this.maxAuditionSeconds,
        Math.max(2, score.durationSeconds)
      );
      const stepSeconds = 60 / Math.max(40, score.bpm) / 4;
      const sampleRate = 44100;
      const frames = Math.ceil(seconds * sampleRate);
      const ctx = new OfflineAudioContext(2, frames, sampleRate);

      const master = ctx.createGain();
      master.gain.value = 0.9;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      master.connect(compressor);
      compressor.connect(ctx.destination);

      this.noise = this.makeNoiseBuffer(ctx, 1.2);

      for (const part of score.parts) {
        // Reference harmony is context, not a deliverable; leave it out.
        if (part.reference) continue;
        if (part.hits.length) this.scheduleDrums(ctx, master, part, stepSeconds, seconds);
        if (part.notes.length) this.scheduleNotes(ctx, master, part, stepSeconds, seconds);
      }

      const rendered = await ctx.startRendering();
      if (token !== this.renderToken) return;
      this.buffer = rendered;
      this.previewSeconds.set(Math.round(rendered.duration));
      this.previewBars.set(
        Math.min(
          score.totalBars,
          Math.ceil(rendered.duration / (stepSeconds * 16))
        )
      );
      this.readyCompositionId.set(score.id);
    } catch (cause: any) {
      if (token !== this.renderToken) return;
      this.error.set(
        'Audition could not be rendered in this browser: ' +
          (cause?.message ?? 'unknown audio error')
      );
      this.notify.show('Audition rendering failed.', 'warning');
    } finally {
      if (token === this.renderToken) this.rendering.set(false);
    }
  }

  /** Force a score preview to play, without changing any project state. */
  async startScore(score: AuditionScore): Promise<void> {
    this.stop();
    if (this.buffer && this.readyCompositionId() === score.id) {
      this.playBuffer();
      return;
    }
    // Abandon any in-flight render so quickly switching rows never plays the
    // pattern the artist moved away from.
    this.renderToken++;
    this.rendering.set(false);
    this.buffer = null;
    await this.renderScore(score);
    // A newer preview may have finished first; only play this score if its
    // render is still the current one.
    if (
      this.buffer &&
      this.readyCompositionId() === score.id &&
      !this.error()
    ) {
      this.playBuffer();
    }
  }

  private playBuffer(): void {
    if (!this.buffer) return;
    this.engine.playAudition(this.buffer, () => {
      // The engine clears its own playback flags; nothing else to release.
    });
  }

  clear(): void {
    this.stop();
    this.renderToken++;
    this.buffer = null;
    this.readyCompositionId.set(null);
    this.rendering.set(false);
    this.error.set(null);
  }

  /* ── Scheduling ──────────────────────────────────────────────── */

  private scheduleDrums(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    part: ComposerPart,
    stepSeconds: number,
    limitSeconds: number
  ): void {
    for (const hit of part.hits) {
      const time = (hit.bar * 16 + hit.step) * stepSeconds;
      if (time >= limitSeconds) continue;
      this.drum(ctx, bus, hit.lane, time, hit.velocity);
    }
  }

  private scheduleNotes(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    part: ComposerPart,
    stepSeconds: number,
    limitSeconds: number
  ): void {
    const voice = this.voiceFor(part.role);
    for (const note of part.notes) {
      const time = (note.bar * 16 + note.step) * stepSeconds;
      if (time >= limitSeconds) continue;
      const duration = Math.max(0.05, note.length * stepSeconds * 0.94);
      const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
      this.tone(ctx, bus, voice, freq, time, duration, note.velocity, Boolean(note.slide));
    }
  }

  private voiceFor(role: ComposerPart['role']): {
    type: OscillatorType;
    cutoff: number;
    gain: number;
    attack: number;
    detune?: number;
  } {
    switch (role) {
      case 'bass':
        return { type: 'sine', cutoff: 320, gain: 0.5, attack: 0.008 };
      case 'chords':
        return { type: 'triangle', cutoff: 1700, gain: 0.16, attack: 0.02 };
      case 'pad':
        return { type: 'sawtooth', cutoff: 900, gain: 0.07, attack: 0.18 };
      case 'melody':
        return { type: 'triangle', cutoff: 3200, gain: 0.2, attack: 0.012 };
      case 'counter':
        return { type: 'sine', cutoff: 1800, gain: 0.12, attack: 0.04 };
      case 'arp':
        return { type: 'square', cutoff: 2400, gain: 0.09, attack: 0.006 };
      case 'fx':
        return { type: 'sawtooth', cutoff: 2600, gain: 0.12, attack: 0.03 };
      default:
        return { type: 'triangle', cutoff: 2400, gain: 0.14, attack: 0.01 };
    }
  }

  private tone(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    voice: { type: OscillatorType; cutoff: number; gain: number; attack: number },
    freq: number,
    time: number,
    duration: number,
    velocity: number,
    slide: boolean
  ): void {
    const osc = ctx.createOscillator();
    osc.type = voice.type;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.cutoff;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    const peak = Math.max(0.0001, voice.gain * Math.min(1, velocity));
    if (slide) {
      osc.frequency.setValueAtTime(freq * 0.94, time);
      osc.frequency.exponentialRampToValueAtTime(freq, time + Math.min(0.18, duration * 0.4));
    } else {
      osc.frequency.setValueAtTime(freq, time);
    }
    const attackEnd = time + Math.min(voice.attack, duration * 0.5);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, attackEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  /* ── Drum voices ─────────────────────────────────────────────── */

  private drum(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    lane: DrumLane,
    time: number,
    velocity: number
  ): void {
    const level = Math.max(0.03, Math.min(1, velocity));
    switch (lane) {
      case 'kick':
        this.kick(ctx, bus, time, level);
        break;
      case 'snare':
        this.noiseHit(ctx, bus, time, 0.2, 1800, 0.9, level * 0.5);
        this.bodyHit(ctx, bus, time, 185, 0.1, level * 0.28, 'triangle');
        break;
      case 'clap':
        this.noiseHit(ctx, bus, time, 0.05, 1300, 1.2, level * 0.32);
        this.noiseHit(ctx, bus, time + 0.012, 0.05, 1400, 1.2, level * 0.28);
        this.noiseHit(ctx, bus, time + 0.026, 0.07, 1500, 1.2, level * 0.24);
        break;
      case 'rim':
        this.bodyHit(ctx, bus, time, 780, 0.045, level * 0.3, 'square');
        break;
      case 'hat':
        this.noiseHit(ctx, bus, time, 0.045, 7800, 2.2, level * 0.2);
        break;
      case 'openhat':
        this.noiseHit(ctx, bus, time, 0.24, 7200, 1.8, level * 0.17);
        break;
      case 'ride':
        this.noiseHit(ctx, bus, time, 0.28, 5600, 2.4, level * 0.11);
        break;
      case 'perc':
        this.bodyHit(ctx, bus, time, 430, 0.12, level * 0.22, 'triangle');
        break;
      case 'shaker':
        this.noiseHit(ctx, bus, time, 0.06, 9200, 2.6, level * 0.12);
        break;
      case 'tom':
        this.bodyHit(ctx, bus, time, 175, 0.2, level * 0.3, 'sine', 110);
        break;
      case 'crash':
        this.noiseHit(ctx, bus, time, 0.8, 4800, 1.4, level * 0.14);
        break;
      default:
        this.noiseHit(ctx, bus, time, 0.08, 2600, 1.5, level * 0.14);
    }
  }

  private kick(ctx: OfflineAudioContext, bus: AudioNode, time: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.13);
    const gain = ctx.createGain();
    const peak = 0.6 * level;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + 0.36);
  }

  private bodyHit(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    time: number,
    freq: number,
    duration: number,
    level: number,
    type: OscillatorType,
    endFreq?: number
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private noiseHit(
    ctx: OfflineAudioContext,
    bus: AudioNode,
    time: number,
    duration: number,
    cutoff: number,
    q: number,
    level: number
  ): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  private makeNoiseBuffer(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
