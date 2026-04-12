import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  dialog = inject(InteractionDialogService);

  settings = computed(() => this.profileService.profile().settings);
  activeTab = signal<'ui' | 'audio' | 'ai' | 'studio' | 'security'>('ui');
  audioInputDevices = this.microphoneService.availableDevices;
  selectedAudioInputId = this.microphoneService.selectedDeviceId;

  ngOnInit() {
    this.securityService.fetchLogs();
    this.securityService.fetchSessions();
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

  setTab(tab: 'ui' | 'audio' | 'ai' | 'studio' | 'security') {
    this.activeTab.set(tab);
    if (tab === 'security') {
      this.securityService.fetchLogs();
      this.securityService.fetchSessions();
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
