import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  input,
  effect, computed,
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
import { CatalogManagerComponent } from '../catalog-manager/catalog-manager.component';
import { AiService } from '../../services/ai.service';

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
    CatalogManagerComponent,
  ],
})
export class ProfileEditorComponent {
  theme = input<AppTheme | any>({
    name: 'default',
    primary: '#10b981',
    accent: '#d946ef',
    neutral: '#0d0d0d',
    purple: '#a855f7',
    red: '#ef4444',
    blue: '#3b82f6',
  });
  private userProfileService = inject(UserProfileService);
  private authService = inject(AuthService);
  private aiService = inject(AiService);

  // Auth state
  isAuthenticated = this.authService.isAuthenticated;
  currentUser = this.authService.currentUser;

  // UI state
  showLegalEditor = signal(false);
  editingDocument = signal<LegalDocument | undefined>(undefined);
  syncingWithAi = signal(false);
  optimizationScore = computed(() => this.userProfileService.profile().knowledgeBase.strategicHealthScore || 0);
  syncLog = signal<string[]>([]);
  intelligenceBriefs = this.aiService.intelligenceBriefs;

  // Profile editing
  editableProfile = signal<UserProfile>({
    ...this.userProfileService.profile(),
  });
  saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  activeSection = signal<string>('basic');

  readonly allGenres = ['Hip Hop', 'R&B', 'Pop', 'Rock', 'Electronic', 'Jazz', 'Classical', 'Country', 'Latin', 'Afrobeats', 'Metal', 'Folk', 'Reggae'];
  readonly experienceLevels = ['Beginner', 'Intermediate', 'Advanced', 'Professional'];
  readonly skillsList = ['Vocalist', 'Producer', 'Songwriter', 'DJ', 'Engineer', 'Musician', 'Manager', 'Marketer'];
  readonly travelOptions = ['Van', 'Bus', 'Flight', 'Private'];
  readonly brandVoices = ['Mysterious', 'Aggressive', 'Sophisticated', 'Relatable', 'Elite', 'Vulnerable', 'High-Energy', 'Cinematic', 'Underground', 'Commercial'];

  sections = [
    { id: 'basic', label: 'Identity & Vision', icon: 'fa-user-tie' },
    { id: 'genre-deep-dive', label: 'Genre Intelligence', icon: 'fa-dna' },
    { id: 'touring', label: 'Touring & Live', icon: 'fa-route' },
    { id: 'publishing', label: 'Sync & Publishing', icon: 'fa-copyright' },
    { id: 'brand', label: 'Brand & Audience', icon: 'fa-bullseye' },
    { id: 'team', label: 'Executive Team', icon: 'fa-users-cog' },
    { id: 'catalog', label: 'Catalog Assets', icon: 'fa-database' },
    { id: 'legal', label: 'Legal Vault', icon: 'fa-file-shield' },
  ];

  constructor() {
    effect(() => {
      if (this.isAuthenticated()) {
        const p = this.userProfileService.profile();
        this.editableProfile.set({ ...p });
      }
    });
  }

  async saveProfile(): Promise<void> {
    this.saveStatus.set('saving');
    this.addLog('INITIALIZING GLOBAL DATA SYNC...');

    await this.userProfileService.updateProfile(this.editableProfile());

    this.syncingWithAi.set(true);
    this.addLog('NEURAL LINK ESTABLISHED. ANALYZING VECTORS...');

    try {
      await this.aiService.syncKnowledgeBaseWithProfile();
      this.addLog('EXTRACTION COMPLETE. NEURAL VAULT UPDATED.');
    } catch (e) {
      this.addLog('SYNC ERROR: REVERTING TO LOCAL CACHE.');
    } finally {
      setTimeout(() => {
        this.saveStatus.set('saved');
        this.syncingWithAi.set(false);
        setTimeout(() => this.saveStatus.set('idle'), 3000);
      }, 1000);
    }
  }

  private addLog(msg: string) {
    this.syncLog.update(logs => [msg, ...logs].slice(0, 5));
  }

  private calculateScore(): number {
    const p = this.editableProfile();
    let score = 50;
    if (p.artistName) score += 5;
    if (p.bio?.length > 100) score += 10;
    if (p.skills?.length > 2) score += 5;
    if (p.primaryGenre) score += 5;
    if (p.touringDetails.hasRider) score += 5;
    if (p.proIpi) score += 10;
    if (p.team?.length > 0) score += 10;
    return Math.min(100, score);
  }

  toggleChip(field: string, value: any, nestedPath?: string) {
    this.editableProfile.update(p => {
      const updated = { ...p };
      let target: any[] = [];

      if (nestedPath) {
        const pathParts = nestedPath.split('.');
        let current: any = updated;
        for (let i = 0; i < pathParts.length - 1; i++) {
          if (!current[pathParts[i]]) current[pathParts[i]] = {};
          current = current[pathParts[i]];
        }
        const lastPart = pathParts[pathParts.length - 1];
        if (!Array.isArray(current[lastPart])) current[lastPart] = [];
        target = current[lastPart];

        if (target.includes(value)) {
          current[lastPart] = target.filter(v => v !== value);
        } else {
          current[lastPart] = [...target, value];
        }
      } else {
        const obj = updated as any;
        if (!Array.isArray(obj[field])) obj[field] = [];
        target = obj[field];
        if (target.includes(value)) {
          obj[field] = target.filter((v: any) => v !== value);
        } else {
          obj[field] = [...target, value];
        }
      }
      return updated;
    });
  }

  updateProfileField(field: string, value: any) {
    const parts = field.split('.');
    this.editableProfile.update(p => {
      const updated = { ...p };
      let current: any = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  }

  addTeamMember() {
    this.editableProfile.update(p => ({
      ...p,
      team: [...(p.team || []), { role: '', name: '', contact: '', active: true }]
    }));
  }

  removeTeamMember(index: number) {
    this.editableProfile.update(p => ({
      ...p,
      team: p.team.filter((_, i) => i !== index)
    }));
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
}
