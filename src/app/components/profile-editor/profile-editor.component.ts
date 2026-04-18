import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  input,
  effect,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AppTheme } from '../../services/user-context.service';
import { UplinkService } from '../../services/uplink.service';
import { UplinkConsoleComponent } from '../uplink-console/uplink-console.component';
import {
  UserProfileService,
  UserProfile,
} from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';
import { FormFieldComponent } from './form-field.component';
import { CatalogManagerComponent } from '../catalog-manager/catalog-manager.component';
import { AiService } from '../../services/ai.service';
import { ArtistQuestionnaireComponent } from '../artist-questionnaire/artist-questionnaire.component';
import { ArtistIdentityService } from '../../services/artist-identity.service';
import { ConnectorPlatform } from '../../types/artist-identity.types';
import { OnboardingService } from '../../services/onboarding.service';

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
    CatalogManagerComponent,
    ArtistQuestionnaireComponent,
    UplinkConsoleComponent,
  ],
})
export class ProfileEditorComponent implements OnInit {
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
  private artistIdentityService = inject(ArtistIdentityService);
  private route = inject(ActivatedRoute);
  onboarding = inject(OnboardingService);
  private uplinkService = inject(UplinkService);

  // Auth state
  isAuthenticated = this.authService.isAuthenticated;
  currentUser = this.authService.currentUser;

  // UI state
  showQuestionnaire = signal(false);
  syncingWithAi = signal(false);
  showUplink = signal(false);
  optimizationScore = computed(
    () => this.userProfileService.profile().strategicHealthScore || 0
  );
  syncLog = signal<string[]>([]);
  intelligenceBriefs = this.aiService.intelligenceBriefs;
  identityPreview = computed(() =>
    this.artistIdentityService.buildIdentitySnapshot(this.editableProfile())
  );
  connectorMatrix = computed(() =>
    this.artistIdentityService.getConnectorMatrix(this.identityPreview())
  );
  topIdentityActions = computed(() =>
    this.identityPreview().recommendations.slice(0, 3)
  );

  // Profile editing
  editableProfile = signal<UserProfile>({
    ...this.userProfileService.profile(),
  });
  saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  activeSection = signal<string>('basic');

  readonly allGenres = [
    'Hip Hop',
    'R&B',
    'Pop',
    'Rock',
    'Electronic',
    'Jazz',
    'Classical',
    'Country',
    'Latin',
    'Afrobeats',
    'Metal',
    'Folk',
    'Reggae',
  ];
  readonly experienceLevels = [
    'Beginner',
    'Intermediate',
    'Advanced',
    'Professional',
  ];
  readonly skillsList = [
    'Vocalist',
    'Producer',
    'Songwriter',
    'DJ',
    'Engineer',
    'Musician',
    'Manager',
    'Marketer',
  ];
  readonly travelOptions = ['Van', 'Bus', 'Flight', 'Private'];
  readonly brandVoices = [
    'Mysterious',
    'Aggressive',
    'Sophisticated',
    'Relatable',
    'Elite',
    'Vulnerable',
    'High-Energy',
    'Cinematic',
    'Underground',
    'Commercial',
  ];

  sections = [
    { id: 'basic', label: 'Identity & Vision', icon: 'fa-user-tie' },
    {
      id: 'identity-console',
      label: 'Identity Console',
      icon: 'fa-project-diagram',
    },
    { id: 'genre-deep-dive', label: 'Genre Intelligence', icon: 'fa-dna' },
    { id: 'touring', label: 'Touring & Live', icon: 'fa-route' },
    { id: 'catalog', label: 'Catalog Assets', icon: 'fa-database' },
    { id: 'business', label: 'Business & Financials', icon: 'fa-briefcase' },
    { id: 'team', label: 'Professional Team', icon: 'fa-users-gear' },
  ];

  constructor() {
    effect(() => {
      if (this.isAuthenticated()) {
        const p = this.userProfileService.profile();
        this.editableProfile.set({ ...p });
      }
    });
  }

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('questionnaire') === '1') {
      this.showQuestionnaire.set(true);
    }
  }

  addToGallery(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.editableProfile.update((p) => ({
          ...p,
          pressGallery: [...(p.pressGallery || []), e.target.result],
        }));
      };
      reader.readAsDataURL(file);
    }
  }

  removeFromGallery(index: number) {
    this.editableProfile.update((p) => ({
      ...p,
      pressGallery: (p.pressGallery || []).filter((_, i) => i !== index),
    }));
  }

  onImageSelected(event: any, target: 'avatarImage' | 'headerImage') {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.updateProfileField(target, e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  async saveProfile(): Promise<void> {
    this.showUplink.set(true);
    await this.uplinkService.initiateUplink(this.editableProfile());
  }

  async queueConnectorRefresh(connectorId: ConnectorPlatform): Promise<void> {
    this.addLog(`QUEUEING ${connectorId.toUpperCase()} CONNECTOR REFRESH...`);
    const updated = await this.artistIdentityService.queueConnectorRefresh(
      connectorId,
      this.editableProfile()
    );
    this.editableProfile.set(updated);
  }

  private addLog(msg: string) {
    this.syncLog.update((logs) => [msg, ...logs].slice(0, 5));
  }

  toggleChip(field: string, value: any, nestedPath?: string) {
    this.editableProfile.update((p) => {
      const updated = { ...p };
      let target: any[] = [];

      if (nestedPath) {
        const pathParts = nestedPath.split('.');
        let current: any = updated;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (
            part === '__proto__' ||
            part === 'constructor' ||
            part === 'prototype'
          )
            continue;
          if (!current[part]) current[part] = {};
          current = current[part];
        }
        const lastPart = pathParts[pathParts.length - 1];
        if (
          lastPart === '__proto__' ||
          lastPart === 'constructor' ||
          lastPart === 'prototype'
        )
          return updated;
        if (!Array.isArray(current[lastPart])) current[lastPart] = [];
        target = current[lastPart];

        if (target.includes(value)) {
          current[lastPart] = target.filter((v) => v !== value);
        } else {
          current[lastPart] = [...target, value];
        }
      } else {
        const obj = updated as any;
        if (
          field === '__proto__' ||
          field === 'constructor' ||
          field === 'prototype'
        )
          return updated;
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
    this.editableProfile.update((p) => {
      const updated = { ...p };
      let current: any = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (
          part === '__proto__' ||
          part === 'constructor' ||
          part === 'prototype'
        )
          continue;
        if (!current[part]) current[part] = {};
        current = current[part];
      }
      const lastPart = parts[parts.length - 1];
      if (
        lastPart !== '__proto__' &&
        lastPart !== 'constructor' &&
        lastPart !== 'prototype'
      ) {
        current[lastPart] = value;
      }
      return updated;
    });
  }
}
