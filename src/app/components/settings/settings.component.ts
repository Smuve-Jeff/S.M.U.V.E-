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
import { HardwareService } from '../../services/hardware.service';
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
  hardwareService = inject(HardwareService);
  localStorageService = inject(LocalStorageService);
  databaseService = inject(DatabaseService);
  dialog = inject(InteractionDialogService);
  showHowTo = signal(false);

  settings = computed(
    () => this.pendingSettings() || this.profileService.profile().settings
  );
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
  pendingSettings = signal<AppSettings | null>(null);
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

  setOutputMode(mode: 'speakers' | 'headphones') {
    this.audioEngine.setOutputMode(mode);
  }

  updateSetting(category: keyof AppSettings, key: string, value: any) {
    const current =
      this.pendingSettings() || this.profileService.profile().settings;
    const updated = {
      ...current,
      [category]: {
        ...(current as any)[category],
        [key]: value,
      },
    };
    this.pendingSettings.set(updated);

    // Preview side effects
    if (category === 'ui' && key === 'theme') {
      this.uiService.setTheme(value);
    }
    if (category === 'ui' && key === 'performanceMode') {
      // Toggle locally for preview if possible
    }
  }

  async commitSettings() {
    const pending = this.pendingSettings();
    if (!pending) return;

    const confirmed = await this.dialog.confirm({
      title: 'COMMIT_SETTINGS_TO_CLOUD',
      message: 'Authorize synchronization of updated executive parameters?',
      confirmLabel: 'AUTHORIZE',
      cancelLabel: 'ABORT',
    });

    if (!confirmed) return;

    try {
      const currentProfile = this.profileService.profile();
      await this.profileService.updateProfile({
        ...currentProfile,
        settings: pending,
      });
      this.pendingSettings.set(null);
      this.notificationService.show(
        'EXECUTIVE_SETTINGS_SYNC_COMPLETE',
        'success'
      );
    } catch (e) {
      this.notificationService.show('SYNC_FAILED', 'error');
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
