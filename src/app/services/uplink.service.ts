import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ArtistIdentityService } from './artist-identity.service';
import { AiService } from './ai.service';
import { LoggingService } from './logging.service';
import { EnhancedArtistQuestionnaireEngine } from './enhanced-artist-questionnaire-engine';
import { firstValueFrom, timer } from 'rxjs';

export type UplinkStage =
  | 'idle'
  | 'identity_refresh'
  | 'profile_commit'
  | 'strategic_audit'
  | 'neural_sync'
  | 'complete'
  | 'failed';

export interface UplinkStatus {
  stage: UplinkStage;
  progress: number;
  message: string;
  logs: string[];
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class UplinkService {
  private profileService = inject(UserProfileService);
  private identityService = inject(ArtistIdentityService);
  private aiService = inject(AiService);
  private logger = inject(LoggingService);
  private questionnaireEngine = inject(EnhancedArtistQuestionnaireEngine);

  private _status = signal<UplinkStatus>({
    stage: 'idle',
    progress: 0,
    message: 'System Ready',
    logs: [],
  });

  status = computed(() => this._status());

  private validateProfile(profile: UserProfile) {
    if (!profile.artistName || profile.artistName === 'New Artist') {
      throw new Error(
        'ARTIST_NAME_INVALID: Profile requires an authentic identifier.'
      );
    }
    if (!profile.primaryGenre) {
      throw new Error(
        'GENRE_UNDEFINED: Strategic alignment requires a primary sonic domain.'
      );
    }
    return true;
  }

  async initiateUplink(profile: UserProfile): Promise<boolean> {
    try {
      this.validateProfile(profile);
    } catch (e: any) {
      this.addLog('VALIDATION_ERROR: ' + e.message);
      return false;
    }
    this.logger.info('Uplink: Initializing high-priority transmission...');
    this.resetStatus();

    try {
      // 1. Identity Refresh
      await this.updateStage(
        'identity_refresh',
        10,
        'INITIALIZING_GENESIS_PROTOCOLS...'
      );
      this.addLog('SCANNING EXTERNAL SURFACES...');
      const identityProfile =
        await this.identityService.refreshIdentityGraph(profile);
      this.addLog('IDENTITY CONSTELLATION ALIGNED.');

      // 2. Profile Commit
      await this.updateStage(
        'profile_commit',
        40,
        'HARDENING_STRATEGIC_INFRASTRUCTURE...'
      );
      this.addLog('WRITING TO DISTRIBUTED LEDGER...');
      // S.M.U.V.E. reads the finished profile at the commit boundary. The
      // synthesized archetype is written *into* the committed profile because
      // every downstream surface (persona prompt, chatbot welcome, landing
      // bio, fine-tune block) reads `musicalJourney.personaSynthesis` — if the
      // uplink drops it, S.M.U.V.E. answers like the questionnaire never ran.
      let committedProfile: UserProfile = identityProfile;
      try {
        const synthesis = await this.questionnaireEngine.synthesizePersona(
          identityProfile
        );
        committedProfile = {
          ...identityProfile,
          musicalJourney: {
            ...identityProfile.musicalJourney,
            personaSynthesis: {
              archetype: synthesis.archetype,
              signatureTone: synthesis.signatureTone,
              sonicSignature: synthesis.sonicSignature,
              aiPersonaProfile: synthesis.aiPersonaProfile,
              recommendedStrategy: synthesis.recommendedStrategy,
              suggestedGenres: synthesis.suggestedGenres,
              productionAphorism: synthesis.productionAphorism,
            },
          },
        };
        this.addLog(`S.M.U.V.E READ: ${synthesis.archetype}.`);
      } catch (e) {
        // A reading failure must never block the commit — the artist's answers
        // are still persisted, and the next uplink retries the synthesis.
        this.logger.warn('Uplink: persona synthesis skipped', e);
      }
      await this.profileService.updateProfile(committedProfile);
      this.addLog('LOCAL STORAGE PERSISTED.');

      // 3. Strategic Audit
      await this.updateStage(
        'strategic_audit',
        70,
        'EXECUTING_SMUVE_SCRUTINY...'
      );
      this.addLog('ANALYZING SONIC DEFICITS...');
      await this.aiService.syncKnowledgeBaseWithProfile();
      this.addLog('MISSION PARAMETERS CALCULATED.');

      // 4. Neural Sync
      await this.updateStage(
        'neural_sync',
        90,
        'UPLINKING_TO_S.M.U.V.E._COMMAND...'
      );
      this.addLog('UPLOADING VECTORS TO COMMANDER...');
      await firstValueFrom(timer(800));
      this.addLog('NEURAL SYNC 100%');

      // 5. Complete
      const finalProfile = this.profileService.profile();
      const finalAudit = finalProfile.auditHistory[0];
      const signals = finalProfile.strategicSignals;
      const archetype = finalProfile.musicalJourney?.personaSynthesis?.archetype
        ?.split('—')[0]
        ?.trim();
      const baseMsg = signals
        ? `Neural Alignment: ${signals.marketReadiness}% Market / ${signals.identityTrust}% Trust`
        : finalAudit
          ? `Transmission Secure: ${finalAudit.score}% Strength`
          : 'Transmission Secure';
      const scoreMsg = archetype ? `${baseMsg} · READ: ${archetype}` : baseMsg;

      await this.updateStage('complete', 100, scoreMsg);
      this.addLog('UPLINK ESTABLISHED. EXECUTIVE COMMAND ACTIVE.');
      return true;
    } catch (err) {
      this.logger.error('Uplink: Transmission Failed', err);
      this._status.update((s) => ({
        ...s,
        stage: 'failed',
        error: String(err),
        message: 'TRANSMISSION SEVERED',
      }));
      this.addLog('ERROR: CONNECTION REFUSED BY COMMANDER.');
      return false;
    }
  }

  private resetStatus() {
    this._status.set({
      stage: 'idle',
      progress: 0,
      message: 'System Ready',
      logs: [],
    });
  }

  private async updateStage(
    stage: UplinkStage,
    progress: number,
    message: string
  ) {
    this._status.update((s) => ({ ...s, stage, progress, message }));
    await firstValueFrom(timer(600));
  }

  private addLog(log: string) {
    this._status.update((s) => ({
      ...s,
      logs: [log, ...s.logs].slice(0, 10),
    }));
  }
}
