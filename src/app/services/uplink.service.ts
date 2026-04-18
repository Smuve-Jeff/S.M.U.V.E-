import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ArtistIdentityService } from './artist-identity.service';
import { AiService } from './ai.service';
import { LoggingService } from './logging.service';
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

  private _status = signal<UplinkStatus>({
    stage: 'idle',
    progress: 0,
    message: 'System Ready',
    logs: [],
  });

  status = computed(() => this._status());

  async initiateUplink(profile: UserProfile): Promise<boolean> {
    this.logger.info('Uplink: Initializing high-priority transmission...');
    this.resetStatus();

    try {
      // 1. Identity Refresh
      await this.updateStage(
        'identity_refresh',
        10,
        'Refreshing Identity Graph...'
      );
      this.addLog('SCANNING EXTERNAL SURFACES...');
      const identityProfile =
        await this.identityService.refreshIdentityGraph(profile);
      this.addLog('IDENTITY CONSTELLATION ALIGNED.');

      // 2. Profile Commit
      await this.updateStage(
        'profile_commit',
        40,
        'Committing Core Vectors...'
      );
      this.addLog('WRITING TO DISTRIBUTED LEDGER...');
      await this.profileService.updateProfile(identityProfile);
      this.addLog('LOCAL STORAGE PERSISTED.');

      // 3. Strategic Audit
      await this.updateStage(
        'strategic_audit',
        70,
        'Running Executive Audit...'
      );
      this.addLog('ANALYZING SONIC DEFICITS...');
      await this.aiService.syncKnowledgeBaseWithProfile();
      this.addLog('MISSION PARAMETERS CALCULATED.');

      // 4. Neural Sync
      await this.updateStage(
        'neural_sync',
        90,
        'Synchronizing Neural Vault...'
      );
      this.addLog('UPLOADING VECTORS TO COMMANDER...');
      await firstValueFrom(timer(800));
      this.addLog('NEURAL SYNC 100%');

      // 5. Complete
      const finalAudit = this.profileService.profile().auditHistory[0];
      const scoreMsg = finalAudit
        ? `Transmission Secure: ${finalAudit.score}% Strength`
        : 'Transmission Secure';

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
