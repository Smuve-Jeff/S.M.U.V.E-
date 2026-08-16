import { Injectable, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';

export type SmuveArchetype = {
  name: string;
  gender: 'male' | 'female' | 'neutral' | 'creature';
  basePitch: number;
  baseRate: number;
  baseVolume: number;
  pitchRange: [number, number];
  rateRange: [number, number];
  description?: string;
};

export interface SpeakOptions {
  conversationId?: string;
  sanitize?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SpeechSynthesisService {
  isSpeaking = signal(false);

  // Default behaviour: automatically use the Ominous persona unless the user
  // explicitly forces a different archetype or disables the feature.
  public defaultToOminous = true;

  private lastUsedVoice: SpeechSynthesisVoice | null = null;
  private lastPitchBand: 'low' | 'mid' | 'high' | null = null;

  constructor(private userProfile: UserProfileService) {
    // Ensure voices list is available — some browsers populate asynchronously.
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        // no-op: ensures getVoices returns the up-to-date list later
      };
    }
  }

  /** Speak text. Splits into sentences and optionally sanitizes profanity. */
  speak(text: string, opts: SpeakOptions = {}) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Cancel any existing speech — we always reset to keep behavior predictable.
    try { window.speechSynthesis.cancel(); } catch {}

    const settings = this.userProfile.profile().settings?.ai || {};

    // If profanity is disabled explicitly by the user, sanitize. Otherwise,
    // the service defaults to allowing profanity (ominous persona) unless the
    // user has explicitly turned it off.
    const profanityDisabledExplicitly = settings.aiProfanityEnabled === false;
    const sanitized = profanityDisabledExplicitly || opts.sanitize === true
      ? this.sanitizeText(text)
      : text;

    const sentences = this.splitIntoSentences(sanitized);
    for (const sentence of sentences) {
      const utter = new (window as any).SpeechSynthesisUtterance(sentence);

      // Decide whether to shape-shift per-sentence or keep a stable voice.
      const shapeShiftDisabled = settings.aiVoiceShapeShiftEnabled === false;
      const shapeShift = !shapeShiftDisabled;

      if (shapeShift) {
        const band = this.nextPitchBand();
        this.applyArchetypeToUtterance(utter, band);
      } else {
        // Stable voice for full utterance — use last band or pick a new one
        const band = this.lastPitchBand || this.nextPitchBand();
        this.applyArchetypeToUtterance(utter, band);
      }

      // Speak it
      try {
        window.speechSynthesis.speak(utter);
      } catch (err) {
        // Some platforms throw when assigning voices — still attempt to speak
        try { window.speechSynthesis.speak(new (window as any).SpeechSynthesisUtterance(sentence)); } catch {}
      }
    }
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitter; keeps delimiters.
    const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return parts ? parts.map((p) => p.trim()).filter(Boolean) : [text];
  }

  private sanitizeText(text: string): string {
    // Very small profanity filter — replace common swear words with ****.
    // NOTE: this is intentionally conservative.
    const bad = ['fuck', 'shit', 'bitch', 'asshole', 'bastard'];
    let out = text;
    for (const w of bad) {
      const re = new RegExp(w, 'gi');
      out = out.replace(re, '****');
    }
    return out;
  }

  /** Picks low / mid / high, heavily biased away from the previous band. */
  private nextPitchBand(): 'low' | 'mid' | 'high' {
    const bands: ('low' | 'mid' | 'high')[] = ['low', 'mid', 'high'];
    if (this.lastPitchBand && Math.random() < 0.7) {
      const others = bands.filter((b) => b !== this.lastPitchBand);
      this.lastPitchBand = others[Math.floor(Math.random() * others.length)];
    } else {
      this.lastPitchBand = bands[Math.floor(Math.random() * bands.length)];
    }
    return this.lastPitchBand;
  }

  private applyArchetypeToUtterance(
    utterance: SpeechSynthesisUtterance,
    band: 'low' | 'mid' | 'high'
  ) {
    // Archetype map tuned for the S.M.U.V.E ominous style.
    const archetypes: Record<string, Partial<SpeechSynthesisUtterance>> = {
      low: { pitch: 0.4, rate: 0.75 },
      mid: { pitch: 0.95, rate: 0.9 },
      high: { pitch: 1.5, rate: 1.05 },
    };

    const chosen = archetypes[band];
    utterance.pitch = chosen.pitch!;
    utterance.rate = chosen.rate!;

    // Assign a voice appropriate to the band if available
    const voice = this.pickVoiceForBand(band);
    if (voice) {
      try { utterance.voice = voice; } catch {}
    }
  }

  private pickVoiceForBand(band: 'low' | 'mid' | 'high'): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
    const pool = english.length > 0 ? english : voices;
    if (pool.length === 0) return null;

    const gender = band === 'low' ? 'male' : band === 'high' ? 'female' : Math.random() > 0.5 ? 'male' : 'female';

    const preferred = this.findVoiceByGender(pool, gender);

    if (preferred && preferred !== this.lastUsedVoice) {
      this.lastUsedVoice = preferred;
    }
    return preferred || pool[Math.floor(Math.random() * pool.length)];
  }

  private findVoiceByGender(voices: SpeechSynthesisVoice[], gender: string): SpeechSynthesisVoice | null {
    if (gender === 'male') {
      const matches = voices.filter((v) => /male|david|james|daniel|matt/i.test(v.name));
      return matches.length ? matches[Math.floor(Math.random() * matches.length)] : null;
    }
    if (gender === 'female') {
      const matches = voices.filter((v) => /female|zira|samantha|zoe|sophie/i.test(v.name));
      return matches.length ? matches[Math.floor(Math.random() * matches.length)] : null;
    }
    return null;
  }
}
