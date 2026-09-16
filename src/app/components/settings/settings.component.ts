import { DatabaseService } from '../../services/database.service';
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HowToOverlayComponent } from './how-to-overlay.component';
import {
  UserProfileService,
  AppSettings,
  initialProfile,
} from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { NotificationService } from '../../services/notification.service';
import { SecurityService } from '../../services/security.service';
import { MicrophoneService } from '../../services/microphone.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AuthService } from '../../services/auth.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { PermissionService } from '../../services/permission.service';
import { HardwareService } from '../../services/hardware.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { AudioEngineLatencyService } from '../../services/audio-engine-latency.service';
import { TokenService } from '../../services/token.service';
import { APP_SECURITY_CONFIG } from '../../app.security';
import {
  normalizePersona,
  SMUVE_PERSONAS,
} from '../../types/persona.types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, HowToOverlayComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  profileService = inject(UserProfileService);
  uiService = inject(UIService);
  notificationService = inject(NotificationService);
  securityService = inject(SecurityService);
  microphoneService = inject(MicrophoneService);
  audioEngine = inject(AudioEngineService);
  authService = inject(AuthService);
  permissionService = inject(PermissionService);
  hardwareService = inject(HardwareService);
  localStorageService = inject(LocalStorageService);
  databaseService = inject(DatabaseService);
  audioLatency = inject(AudioEngineLatencyService);
  dialog = inject(InteractionDialogService);
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  showHowTo = signal(false);
  latencyCalibrationRunning = signal(false);
  twoFactorSetup = signal<{ secret: string; qrCodeUri: string } | null>(null);
  twoFactorCode = signal('');

  settings = computed(() => {
    return this.withSettingsDefaults(this.profileService.profile().settings);
  });

  /**
   * Deep-merge the active settings over the canonical `initialProfile`
   * defaults. Legacy or imported profiles that predate a settings section
   * (e.g. `dj`) render safely instead of throwing on the template.
   */
  private withSettingsDefaults(current: AppSettings): AppSettings {
    const defaults = initialProfile.settings;
    return {
      ui: { ...defaults.ui, ...(current?.ui ?? {}) },
      audio: { ...defaults.audio, ...(current?.audio ?? {}) },
      ai: { ...defaults.ai, ...(current?.ai ?? {}) },
      studio: { ...defaults.studio, ...(current?.studio ?? {}) },
      dj: { ...defaults.dj, ...(current?.dj ?? {}) },
      security: { ...defaults.security, ...(current?.security ?? {}) },
    };
  }

  /** Canonical persona roster — the same four modes every AI surface honors. */
  personaOptions = SMUVE_PERSONAS;

  /**
   * Normalized so legacy ids ('Aggressive Manager', 'Encouraging Mentor',
   * 'Ominous Dominator') still highlight the right persona button instead of
   * leaving the artist staring at an apparently unset character.
   */
  activePersonaId = computed(() =>
    normalizePersona(this.settings().ai.commanderPersona)
  );

  themeOptions = computed(() => this.uiService.getAvailableThemes());
  profileAlignment = computed(() => {
    const profile = this.profileService.profile();
    const journey = profile.musicalJourney;
    const blueprint = journey?.musicBlueprint;
    const officialLinks = profile.officialArtistProfiles ?? [];
    const recordedSignals = [
      profile.artistName && profile.artistName !== 'New Artist',
      profile.primaryGenre && profile.primaryGenre !== 'Hip Hop',
      Boolean(journey?.originStory || journey?.firstSong || journey?.breakthroughMoment),
      Boolean(journey?.signatureSound || blueprint?.artisticIntent || blueprint?.recognitionCue),
      officialLinks.length > 0,
      (profile.catalog ?? []).length > 0,
    ].filter(Boolean).length;
    return {
      artist: profile.artistName || 'New Artist',
      journeyStage: journey?.experienceLevel || 'Not calibrated',
      recordedSignals,
      officialLinks: officialLinks.length,
      catalogItems: (profile.catalog ?? []).length,
      contextReady: Boolean(
        blueprint?.artisticIntent || blueprint?.signatureTension || journey?.signatureSound
      ),
    };
  });

  appearanceSummary = computed(() => {
    const ui = this.settings().ui;
    return [
      {
        label: 'Theme',
        value: `${ui.theme} Mode`,
        detail:
          ui.theme === 'Dark'
            ? 'High-contrast command surfaces'
            : 'Bright editorial production layout',
      },
      {
        label: 'Performance',
        value: ui.performanceMode ? 'Optimized' : 'Standard',
        detail: ui.performanceMode
          ? 'Reduced motion and lower visual overhead'
          : 'Full motion, blur, and shell transitions',
      },
      {
        label: 'HUD Overlay',
        value: ui.showScanlines ? 'Enabled' : 'Disabled',
        detail: ui.showScanlines
          ? 'Legacy scanlines layered over the shell'
          : 'Clean glass surfaces and uncluttered panels',
      },
      {
        label: 'Stage FX',
        value:
          this.settings().studio?.stageFxEnabled === false
            ? 'Calm Mode'
            : 'Ambient',
        detail:
          this.settings().studio?.stageFxEnabled === false
            ? 'Aurora, marquee sheens & pulses OFF — battery saver'
            : 'Full aurora, marquee sheens & pulse animations',
      },
    ];
  });

  activeTab = signal<
    | 'ui'
    | 'audio'
    | 'ai'
    | 'studio'
    | 'dj'
    | 'security'
    | 'permissions'
    | 'storage'
    | 'hardware'
  >('ui');
  audioInputDevices = this.microphoneService.availableDevices;
  selectedAudioInputId = this.microphoneService.selectedDeviceId;
  storageStats = signal<{
    usedBytes: number;
    totalBytes: number;
    percentUsed: number;
  } | null>(null);
  securityAudit = computed(() => this.securityService.getSecurityAudit());

  ngOnInit() {
    // Keep the shell's legacy readers aligned with the profile-backed settings
    // when an imported profile is opened in a fresh session.
    const ui = this.settings().ui;
    const studio = this.settings().studio;
    try {
      localStorage.setItem('smuve_beginner_mode', ui.beginnerMode ? 'on' : 'off');
      document.body.classList.toggle('stage-fx-off', studio.stageFxEnabled === false);
    } catch {
      // Browser storage and DOM are optional in SSR, tests, and embedded hosts.
    }
    this.securityService.fetchLogs();
    this.securityService.fetchSessions();
    this.updateStorageStats();
  }

  /** Consolidated write path — settings write through profile service immediately.
   *  The old deferred-commit dialog path has been removed; all toggles now persist
   *  instantly through UserProfileService.updateProfile(). */
  async forceSync() {
    const profile = this.profileService.profile();
    // Use the profile's stamped owner id (real account) instead of the legacy
    // 'current' key so forced sync passes the backend's ownership check.
    await this.databaseService.saveUserProfile(profile, profile.id || 'current');
    this.notificationService.show('Cloud synchronization forced.', 'success');
  }

  async updateStorageStats() {
    const stats = await this.localStorageService.getStorageStats();
    this.storageStats.set(stats);
  }

  async clearCache() {
    const confirmed = await this.dialog.confirm({
      title: 'Clear Local Cache',
      message:
        'This will remove all cached audio samples and offline assets. Your projects remain safe.',
      confirmLabel: 'Clear Cache',
      tone: 'default',
    });
    if (confirmed) {
      await this.localStorageService.clearAllCache();
      await this.updateStorageStats();
      this.notificationService.show('Local cache cleared.', 'success');
    }
  }

  async exportData() {
    await this.securityService.exportUserData();
  }

  async toggleTwoFactor(enabled: boolean) {
    if (!enabled) {
      this.twoFactorSetup.set(null);
      this.twoFactorCode.set('');
      this.updateSetting('security', 'twoFactorEnabled', false);
      return;
    }
    const setup = await this.securityService.setup2FA();
    if (!setup?.supported || !setup.secret || !setup.qrCodeUri) {
      this.notificationService.show('Two-factor enrollment is unavailable in this browser.', 'error');
      return;
    }
    this.twoFactorSetup.set({ secret: setup.secret, qrCodeUri: setup.qrCodeUri });
    this.twoFactorCode.set('');
    // Enrollment is not activation. Require a valid authenticator response
    // before persisting the enabled flag, otherwise a displayed secret would
    // leave the account claiming protection it cannot actually verify.
    this.updateSetting('security', 'twoFactorEnabled', false);
    this.notificationService.show('2FA enrollment created. Save the secret, then verify a six-digit code.', 'success');
  }

  async confirmTwoFactor() {
    const code = this.twoFactorCode().trim();
    if (!/^\\d{6}$/.test(code) || !(await this.securityService.verify2FA(code))) {
      this.notificationService.show('That authenticator code could not be verified.', 'error');
      return;
    }
    this.updateSetting('security', 'twoFactorEnabled', true);
    this.twoFactorSetup.set(null);
    this.twoFactorCode.set('');
    this.notificationService.show('Two-factor authentication is now active.', 'success');
  }

  async requestPermission(name: string) {
    const granted = await this.permissionService.requestPermission(name);
    if (granted) {
      this.notificationService.show(
        `Permission granted for ${name}.`,
        'success'
      );
    }
  }

  async refreshAudioInputs() {
    const microphone = this.microphoneService as MicrophoneService & {
      refreshDevices?: () => Promise<void>;
    };
    if (microphone.refreshDevices) await microphone.refreshDevices();
    else await this.microphoneService.updateAvailableDevices();
  }

  async refreshHardware() {
    await this.hardwareService.refreshConnectedHardware();
    await this.microphoneService.updateAvailableDevices();
    await this.audioEngine.refreshOutputDevices();
  }

  async selectAudioInput(deviceId: string | null) {
    if (!deviceId) return;
    await this.microphoneService.initialize(deviceId);
  }

  /** Re-scan the OS for audio output sinks (label chips + dropdown). */
  async refreshOutputs() {
    await this.audioEngine.refreshOutputDevices();
  }

  /** Route studio audio to a specific output sink via setSinkId
   *  (gracefully no-ops on browsers that lack the API). */
  async selectOutputDevice(deviceId: string) {
    await this.audioEngine.setOutputDevice(deviceId || '');
  }

  /** Push the microphone input gain slider value into the live gain node. */
  setMicGain(value: number) {
    this.microphoneService.setMicGain(value);
  }

  /** Persist monitor blend crossfade between input and playback. */
  setMonitorBlend(value: number) {
    this.audioEngine.setMonitorBlend(value);
  }

  /** Toggle the auto-adjust EQ profile behavior on device changes. */
  setAutoAdjust(enabled: boolean) {
    this.audioEngine.setAutoAdjust(!!enabled);
  }

  /** Readout of monitor-blend percentage for the slider label. */
  monitorBlendPct(): number {
    return Math.round(this.audioEngine.monitorBlend() * 100);
  }

  setOutputMode(mode: 'speakers' | 'headphones') {
    this.audioEngine.setOutputMode(mode);
  }

  async calibrateLatencyCompensation() {
    if (this.latencyCalibrationRunning()) return;
    this.latencyCalibrationRunning.set(true);
    try {
      const calibration = await this.audioLatency.calibrateFromCurrentDevice(1);
      this.updateSetting(
        'studio',
        'latencyCompensation',
        calibration.recommendedCompensationMs
      );
      this.notificationService.show(
        `Latency calibrated to ${calibration.recommendedCompensationMs} ms.`,
        'success'
      );
    } catch {
      this.notificationService.show('Latency calibration failed.', 'error');
    } finally {
      this.latencyCalibrationRunning.set(false);
    }
  }

  updateSetting(category: keyof AppSettings, key: string, value: any) {
    // Browser form controls emit strings for numeric selects/inputs. Normalize
    // them here so downstream audio, latency, and security consumers never
    // receive string concatenation or NaN values from Settings.
    if (['masterVolume', 'latencyCompensation'].includes(key)) {
      const parsed = Number(value);
      value = Number.isFinite(parsed)
        ? key === 'masterVolume'
          ? Math.min(1, Math.max(0, parsed))
          : Math.min(500, Math.max(0, parsed))
        : 0;
    }
    if (['sampleRate', 'bufferSize', 'sessionTimeout'].includes(key)) {
      const parsed = Number(value);
      value = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
    }
    // S.M.U.V.E. voice morph is permanently locked on — core identity feature
    if (category === 'ai' && key === 'aiVoiceShapeShiftEnabled') {
      value = true;
    }
    const currentProfile = this.profileService.profile();
    const current = currentProfile.settings;
    const updated = {
      ...current,
      [category]: {
        ...(current as any)[category],
        [key]: value,
      },
    };

    // Write immediately — no deferred commit dialog
    this.profileService.updateProfile({
      ...currentProfile,
      settings: updated,
    });

    // Preview side effects
    if (category === 'ui' && key === 'theme') {
      this.uiService.setTheme(value);
    }
    if (category === 'ui' && key === 'beginnerMode') {
      // Keep the shared shell signal in lockstep with the profile write. The
      // optional guard also supports lightweight embedded/test hosts.
      this.uiService.beginnerMode?.set(!!value);
      try {
        localStorage.setItem('smuve_beginner_mode', value ? 'on' : 'off');
      } catch {
        // Locked storage is non-fatal; the profile remains the source of truth.
      }
    }
    if (category === 'studio' && key === 'stageFxEnabled') {
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('stage-fx-off', !value);
      }
      try {
        localStorage.setItem('smuve_stage_fx', value ? 'on' : 'off');
      } catch {
        /* locked storage — degrade silently */
      }
    }
  }



  // Removed: commitSettings() + pendingSettings deferred-write path.
  // All settings now persist immediately through updateSetting() →
  // UserProfileService.updateProfile() with no confirmation dialog.

  setTab(
    tab:
      | 'ui'
      | 'audio'
      | 'ai'
      | 'studio'
      | 'dj'
      | 'security'
      | 'permissions'
      | 'storage'
      | 'hardware'
  ) {
    this.activeTab.set(tab);
    if (tab === 'security') {
      this.securityService.fetchLogs();
      this.securityService.fetchSessions();
    }
    if (tab === 'storage') {
      this.updateStorageStats();
    }
    if (tab === 'permissions') {
      this.permissionService.refreshAllStatuses();
    }
  }

  async revokeSession(id: string) {
    await this.securityService.revokeSession(id);
    this.notificationService.show('Session revoked successfully.', 'success');
  }

  openExternalLink(url: string) {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async onProfileImport(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    const success = await this.profileService.importProfile(file);
    if (success) {
      this.notificationService.show('PROFILE_IMPORTED_SUCCESSFULLY', 'success');
    } else {
      this.notificationService.show('PROFILE_IMPORT_FAILED', 'error');
    }
  }

  async purgeProfile() {
    const confirmed = await this.dialog.confirm({
      title: 'Execute Profile Purge',
      message:
        'This permanently deletes your executive profile and synced neural data. This action cannot be undone.',
      confirmLabel: 'Purge profile',
      cancelLabel: 'Keep profile',
      tone: 'danger',
    });
    if (!confirmed) return;

    const id = this.profileService.profile().id;

    // Real accounts are deleted server-side; local-only sessions skip straight
    // to closing the session. Only claim erasure after the backend confirms.
    if (id && id !== 'current') {
      try {
        const token = this.tokenService.jwtToken();
        await firstValueFrom(
          this.http.delete(`${APP_SECURITY_CONFIG.api_url}/user/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
        );
      } catch (e: any) {
        // 404 = already deleted; anything else is a real failure.
        if (e?.status !== 404) {
          this.notificationService.show(
            'Purge failed. Please try again.',
            'error',
            3000
          );
          return;
        }
      }
    }

    try {
      await this.securityService.logEvent(
        'PROFILE_PURGE',
        'User initiated irreversible profile purge.'
      );
      this.notificationService.show(
        'Profile purge complete. All data has been erased.',
        'success',
        4000
      );
      this.authService.logout();
    } catch {
      this.notificationService.show(
        'Purge failed. Please try again.',
        'error',
        3000
      );
    }
  }
}
