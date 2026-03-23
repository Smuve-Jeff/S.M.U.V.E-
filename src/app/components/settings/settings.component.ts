import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService, AppSettings } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent {
  profileService = inject(UserProfileService);
  uiService = inject(UIService);
  notificationService = inject(NotificationService);

  settings = computed(() => this.profileService.profile().settings);

  activeTab = signal<'ui' | 'audio' | 'ai' | 'studio' | 'privacy'>('ui');

  async updateSetting(category: keyof AppSettings, key: string, value: any) {
    const currentProfile = this.profileService.profile();
    const updatedSettings = {
      ...currentProfile.settings,
      [category]: {
        ...(currentProfile.settings as any)[category],
        [key]: value
      }
    };

    try {
      await this.profileService.updateProfile({
        ...currentProfile,
        settings: updatedSettings
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

      this.notificationService.show('Settings synchronized to cloud.', 'success', 2000);
    } catch (err) {
      this.notificationService.show('Sync failed. Local cache maintained.', 'error', 3000);
    }
  }

  setTab(tab: 'ui' | 'audio' | 'ai' | 'studio' | 'privacy') {
    this.activeTab.set(tab);
  }
}
