import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  input,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppTheme } from '../../services/user-context.service';
import {
  UserProfileService,
  UserProfile,
} from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';
import { FormFieldComponent } from './form-field.component';
import {
  LegalDocumentEditorComponent,
  LegalDocument,
} from '../legal-document-editor/legal-document-editor.component';

@Component({
  selector: 'app-profile-editor',
  templateUrl: './profile-editor.component.html',
  styleUrls: ['./profile-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FormFieldComponent,
    LegalDocumentEditorComponent,
  ],
})
export class ProfileEditorComponent {
  theme = input<AppTheme | any>({
    name: 'default',
    primary: '#8b5cf6',
    accent: '#d946ef',
    neutral: '#1e293b',
    purple: '#a855f7',
    red: '#ef4444',
    blue: '#3b82f6',
  });
  private userProfileService = inject(UserProfileService);
  private authService = inject(AuthService);

  // Auth state
  isAuthenticated = this.authService.isAuthenticated;
  currentUser = this.authService.currentUser;

  // UI state
  authMode = signal<'login' | 'register'>('login');
  authError = signal<string | null>(null);
  showLegalEditor = signal(false);
  editingDocument = signal<LegalDocument | undefined>(undefined);

  // Profile editing
  editableProfile = signal<UserProfile>({
    ...this.userProfileService.profile(),
    careerGoals: this.userProfileService.profile().careerGoals || [],
  });
  saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  activeSection = signal<string>('basic');

  constructor() {
    effect(() => {
      if (this.isAuthenticated()) {
        this.editableProfile.set({
          ...this.userProfileService.profile(),
          careerGoals: this.userProfileService.profile().careerGoals || [],
        });
      }
    });
  }

  readonly socialPlatforms = [
    'X',
    'Instagram',
    'TikTok',
    'Facebook',
    'YouTube',
    'Twitch',
    'Discord',
    'Reddit',
    'Snapchat',
  ];
  readonly musicPlatforms = [
    'Spotify',
    'Apple Music',
    'SoundCloud',
    'Bandcamp',
    'Tidal',
    'Amazon Music',
    'YouTube Music',
  ];

  sections = [
    { id: 'basic', label: 'Basic Info', icon: 'fa-user' },
    { id: 'social', label: 'Social & Links', icon: 'fa-link' },
    { id: 'professional', label: 'Professional ID', icon: 'fa-id-card' },
    { id: 'legal', label: 'Legal Docs', icon: 'fa-file-contract' },
  ];

  saveProfile(): void {
    this.saveStatus.set('saving');
    this.userProfileService.updateProfile(this.editableProfile());
    setTimeout(() => {
      this.saveStatus.set('saved');
      setTimeout(() => this.saveStatus.set('idle'), 2000);
    }, 500);
  }

  updateLink(
    type: 'socialMedia' | 'musicPlatforms',
    platform: string,
    event: Event
  ) {
    const value = (event.target as HTMLInputElement).value;
    this.editableProfile.update((p) => ({
      ...p,
      [type]: {
        ...p[type],
        [platform]: value,
      },
    }));
  }

  addLink(type: 'socialMedia' | 'musicPlatforms', platform: string) {
    this.editableProfile.update((p) => ({
      ...p,
      [type]: {
        ...p[type],
        [platform]: '',
      },
    }));
  }

  removeLink(type: 'socialMedia' | 'musicPlatforms', platform: string) {
    this.editableProfile.update((p) => {
      const updatedLinks = { ...(p[type] as any) };
      delete updatedLinks[platform];
      return {
        ...p,
        [type]: updatedLinks,
      };
    });
  }

  // --- Legal Document Methods ---
  openNewDocument() {
    this.editingDocument.set(undefined);
    this.showLegalEditor.set(true);
  }

  openEditDocument(doc: LegalDocument) {
    this.editingDocument.set(doc);
    this.showLegalEditor.set(true);
  }

  saveLegalDocument(doc: LegalDocument) {
    this.editableProfile.update((p) => {
      const existingDocs = p.legalDocuments || [];
      const index = existingDocs.findIndex((d) => d.id === doc.id);
      if (index > -1) {
        const updatedDocs = [...existingDocs];
        updatedDocs[index] = doc;
        return { ...p, legalDocuments: updatedDocs };
      } else {
        return { ...p, legalDocuments: [...existingDocs, doc] };
      }
    });
    this.showLegalEditor.set(false);
  }

  deleteLegalDocument(docId: string) {
    this.editableProfile.update((p) => ({
      ...p,
      legalDocuments: (p.legalDocuments || []).filter((d) => d.id !== docId),
    }));
  }

  verifyPlatform(
    type: 'officialMusicProfiles' | 'personalSocialProfiles',
    platform: string
  ) {
    this.editableProfile.update((p) => {
      const updated = { ...p };
      const category = { ...(updated[type] as any) };
      category[platform] = { ...category[platform], status: 'syncing' };
      return { ...updated, [type]: category };
    });

    // Simulate verification process
    setTimeout(() => {
      this.editableProfile.update((p) => {
        const updated = { ...p };
        const category = { ...(updated[type] as any) };
        category[platform] = {
          ...category[platform],
          status: 'verified',
          verified: true,
          lastSynced: new Date().toISOString(),
        };
        return { ...updated, [type]: category };
      });
      this.userProfileService.updateProfile(this.editableProfile());
    }, 2000);
  }

  updatePlatformUrl(
    type: 'officialMusicProfiles' | 'personalSocialProfiles',
    platform: string,
    event: Event
  ) {
    const value = (event.target as HTMLInputElement).value;
    this.editableProfile.update((p) => {
      const updated = { ...p };
      const category = { ...(updated[type] as any) };
      category[platform] = { ...category[platform], url: value };
      return { ...updated, [type]: category };
    });
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  updateProfileField(field: keyof UserProfile, value: any) {
    this.editableProfile.update((p) => ({ ...p, [field]: value }));
  }
}
