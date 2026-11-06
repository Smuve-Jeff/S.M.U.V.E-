import { Component, signal, inject, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { UpgradeRecommendation } from '../../types/ai.types';
import {
  CLICK_SOUND_LABELS,
  CLICK_SUBDIVISION_LABELS,
} from '../../services/transport-prefs';

@Component({
  selector: 'app-practice-space',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './practice-space.component.html',
  styleUrls: ['./practice-space.component.css'],
})
export class PracticeSpaceComponent implements OnDestroy {
  public profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  public uiService = inject(UIService);
  private audioEngine = inject(AudioEngineService);

  /**
   * The drill metronome *is* the Studio click. It used to be a private
   * `setInterval` + oscillator pair that hard-coded a four-beat bar, so a
   * practice drill and the click you record to were two different tempos.
   */
  readonly metronomeActive = signal(false);
  readonly metronomeBpm = this.audioEngine.tempo;
  readonly metronomeAudioEnabled = this.audioEngine.metronomeEnabled;
  /** Beat index inside the current bar, straight from the engine clock. */
  readonly currentTick = computed(() => {
    const beats = Math.max(1, this.audioEngine.timeSignature().beats);
    const beatSteps = Math.max(1, this.audioEngine.stepsPerNotatedBeat());
    return Math.floor(this.audioEngine.visualStep() / beatSteps) % beats;
  });
  readonly meterBeats = computed(() =>
    Array.from(
      { length: Math.max(1, this.audioEngine.timeSignature().beats) },
      (_, index) => index,
    ),
  );
  /** What the click will actually do, in the engine's own settings. */
  readonly clickSummary = computed(() => {
    const meter = this.audioEngine.timeSignature();
    const subdivision =
      CLICK_SUBDIVISION_LABELS[this.audioEngine.clickSubdivision()];
    const sound = CLICK_SOUND_LABELS[this.audioEngine.clickSound()];
    return `${meter.beats}/${meter.unit} \u00b7 ${
      subdivision === 'Off' ? 'beats' : subdivision
    } \u00b7 ${sound}`;
  });

  recommendedUpgrades = computed(() =>
    this.aiService
      .getUpgradeRecommendations()
      .filter(
        (recommendation) =>
          !['acquired', 'completed'].includes(recommendation.state || '')
      )
      .slice(0, 3)
  );
  recommendationHistory = computed(() =>
    [...(this.profileService.profile().recommendationHistory || [])]
      .slice()
      .reverse()
      .slice(0, 4)
  );

  protocols = signal<any[]>([
    {
      id: '1',
      bpm: 90,
      title: 'Vocal Resonance',
      category: 'VOCAL',
      duration: '10m',
      description: 'Focus on harmonic placement.',
      icon: 'fa-microphone',
      difficulty: 'Intermediate',
    },
    {
      id: '2',
      bpm: 110,
      title: 'Stage Presence',
      category: 'PERFORMANCE',
      duration: '15m',
      description: 'Choreographed energy control.',
      icon: 'fa-walking',
      difficulty: 'Advanced',
    },
    {
      id: '3',
      bpm: 120,
      title: 'Lyric Memory',
      category: 'COGNITIVE',
      duration: '5m',
      description: 'Rapid recall drill.',
      icon: 'fa-brain',
      difficulty: 'Expert',
    },
  ]);

  /** The protocol currently running, if any. */
  activeProtocolId = signal<string | null>(null);

  /**
   * Start (or stop) a drill: the metronome runs at the protocol's tempo so the
   * button does something real instead of pretending to coach.
   */
  beginSession(protocol: any) {
    if (this.activeProtocolId() === protocol.id) {
      this.stopMetronome();
      this.activeProtocolId.set(null);
      return;
    }
    if (this.metronomeActive()) this.stopMetronome();
    this.audioEngine.setTempo(
      this.clampBpm(protocol.bpm ?? this.metronomeBpm()),
    );
    this.activeProtocolId.set(protocol.id);
    this.startMetronome();
  }

  toggleMetronome(): void {
    if (this.metronomeActive()) {
      this.stopMetronome();
      return;
    }
    this.startMetronome();
  }

  private startMetronome(): void {
    this.audioEngine.setTempo(this.clampBpm(this.metronomeBpm()));
    this.audioEngine.startClickOnly();
    this.metronomeActive.set(true);
  }

  private stopMetronome(): void {
    this.audioEngine.stopClickOnly();
    this.metronomeActive.set(false);
  }

  private clampBpm(bpm: number): number {
    return Math.max(40, Math.min(240, Math.round(bpm)));
  }

  updateBpm(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!Number.isFinite(val) || val < 40 || val > 240) return;
    // The engine re-times its running clock, so an active drill follows now.
    this.audioEngine.setTempo(val);
  }

  /** Mute the click without stopping the drill clock (the pulse keeps running). */
  toggleMetronomeAudio(): void {
    this.audioEngine.toggleMetronome();
  }

  acquireUpgrade(upgrade: UpgradeRecommendation) {
    return this.profileService.acquireUpgrade({
      title: upgrade.title,
      type: upgrade.type,
      recommendationId: upgrade.id,
    });
  }

  async saveRecommendation(upgrade: UpgradeRecommendation) {
    await this.profileService.setRecommendationState(
      upgrade.id,
      'saved',
      upgrade
    );
  }

  async dismissRecommendation(upgrade: UpgradeRecommendation) {
    await this.profileService.setRecommendationState(
      upgrade.id,
      'not-relevant',
      upgrade
    );
  }

  focusRecommendation(upgrade: UpgradeRecommendation) {
    if (upgrade.toolId) {
      this.uiService.navigateToView(upgrade.toolId as any);
    }
  }

  ngOnDestroy() {
    if (this.metronomeActive()) this.stopMetronome();
  }
}
