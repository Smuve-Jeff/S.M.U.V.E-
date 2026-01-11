import { Component, ChangeDetectionStrategy, inject, signal, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppTheme } from '../../services/user-context.service';
import { UserProfileService, UserProfile } from '../../services/user-profile.service';
import { AuthService, AuthCredentials } from '../../services/auth.service';
import { FormFieldComponent } from './form-field.component';
import { LegalDocumentEditorComponent, LegalDocument } from '../legal-document-editor/legal-document-editor.component';

@Component({
  selector: 'app-profile-editor',
  templateUrl: './profile-editor.component.html',
  styleUrls: ['./profile-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormFieldComponent, LegalDocumentEditorComponent]
})
export class ProfileEditorComponent {
  theme = input.required<AppTheme>();
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
  editableProfile = signal<UserProfile>({ ...this.userProfileService.profile() });
  saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  activeSection = signal<string>('basic');

  constructor() {
    effect(() => {
      if (this.isAuthenticated()) {
        this.editableProfile.set({ ...this.userProfileService.profile() });
      }
    });
  }
  
  readonly socialPlatforms = ['X', 'Instagram', 'TikTok', 'Facebook', 'YouTube', 'Twitch', 'Discord', 'Reddit', 'Snapchat'];
  readonly musicPlatforms = ['Spotify', 'Apple Music', 'SoundCloud', 'Bandcamp', 'Tidal', 'Amazon Music', 'YouTube Music'];

  sections = [
    { id: 'basic', label: 'Basic Info', icon: 'fa-user' },
    { id: 'social', label: 'Social & Links', icon: 'fa-link' },
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
  
  updateLink(type: 'socialMedia' | 'musicPlatforms', platform: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.editableProfile.update(p => ({
      ...p,
      [type]: {
        ...p[type],
        [platform]: value
      }
    }));
  }

  addLink(type: 'socialMedia' | 'musicPlatforms', platform: string) {
    this.editableProfile.update(p => ({
        ...p,
        [type]: {
            ...p[type],
            [platform]: ''
        }
    }));
  }

  removeLink(type: 'socialMedia' | 'musicPlatforms', platform: string) {
    this.editableProfile.update(p => {
        const updatedLinks = { ...p[type] };
        delete updatedLinks[platform];
        return {
            ...p,
            [type]: updatedLinks
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
    this.editableProfile.update(p => {
      const existingDocs = p.legalDocuments || [];
      const index = existingDocs.findIndex(d => d.id === doc.id);
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
    this.editableProfile.update(p => ({
      ...p,
      legalDocuments: (p.legalDocuments || []).filter(d => d.id !== docId)
    }));
  }
  
}