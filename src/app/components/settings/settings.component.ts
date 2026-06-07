import { DatabaseService } from '../../services/database.service';
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HowToOverlayComponent } from './how-to-overlay.component';
import {
  UserProfileService,
  AppSettings,
} from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { NotificationService } from '../../services/notification.service';
import { SecurityService } from '../../services/security.service';
import { MicrophoneService } from '../../services/microphone.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AuthService } from '../../services/auth.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { PermissionService } from '../../services/permission.service';
import { LocalStorageService } from '../../services/local-storage.service';

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
  localStorageService = inject(LocalStorageService);
  databaseService = inject(DatabaseService);
  dialog = inject(InteractionDialogService);
  showHowTo = signal(false);

  settings = computed(() => this.profileService.profile().settings);
  themeOptions = computed(() => this.uiService.getAvailableThemes());
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
    ];
  });

  activeTab = signal<
    'ui' | 'audio' | 'ai' | 'studio' | 'dj' | 'security' | 'permissions' | 'storage'
  >('ui');
  audioInputDevices = this.microphoneService.availableDevices;
  audioOutputDevices = this.audioEngine.availableOutputDevices;
  selectedAudioOutputId = this.audioEngine.outputDeviceId;
  selectedAudioInputId = this.microphoneService.selectedDeviceId;
  storageStats = signal<{
    usedBytes: number;
    totalBytes: number;
    percentUsed: number;
  } | null>(null);
  securityAudit = computed(() => this.securityService.getSecurityAudit());

  ngOnInit() {
    this.securityService.fetchLogs();
    this.securityService.fetchSessions();
    this.updateStorageStats();
  }

  async forceSync() {
    const profile = this.profileService.profile();
    await this.databaseService.saveUserProfile(profile, 'current');
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
    await this.microphoneService.updateAvailableDevices();
  }

  async selectAudioInput(deviceId: string | null) {
    if (!deviceId) return;
    await this.microphoneService.initialize(deviceId);
  }

  async selectAudioOutput(deviceId: string | null) {
    await this.audioEngine.setOutputDevice(deviceId);
  }

  setOutputMode(mode: 'speakers' | 'headphones') {
    this.audioEngine.setOutputMode(mode);
  }

  async updateSetting(category: keyof AppSettings, key: string, value: any) {
    const currentProfile = this.profileService.profile();
    const updatedSettings = {
      ...currentProfile.settings,
      [category]: {
        ...(currentProfile.settings as any)[category],
        [key]: value,
      },
    };

    try {
      await this.profileService.updateProfile({
        ...currentProfile,
        settings: updatedSettings,
      });

      // Immediate UI Feedback/Side effects
      if (category === 'ui' && key === 'theme') {
        this.uiService.setTheme(value);
      }
      if (category === 'ui' && key === 'performanceMode') {
        if (value !== this.uiService.performanceMode()) {
          this.uiService.togglePerformanceMode();
        }
      }

      this.notificationService.show(
        'Settings synchronized to cloud.',
        'success',
        2000
      );
      if (category === 'security') {
        if (key === 'endToEndEncryption' && value === true) {
          await this.securityService.generateE2EKeys();
          this.notificationService.show(
            'E2E Encryption keys generated and stored in secure enclave.',
            'success'
          );
        }
        if (key === 'twoFactorEnabled' && value === true) {
          const setup = await this.securityService.setup2FA();
          await this.dialog.alert({
            title: '2FA Enrollment',
            message: `Scan this URI in your authenticator app: ${setup.qrCodeUri}. Your secret key is: ${setup.secret}`,
            confirmLabel: 'I have saved the key',
          });
        }
        this.securityService.logEvent(
          'SETTING_CHANGED',
          `Updated ${key} to ${value}`
        );
      }
    } catch (_err) {
      this.notificationService.show(
        'Sync failed. Local cache maintained.',
        'error',
        3000
      );
    }
  }

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
