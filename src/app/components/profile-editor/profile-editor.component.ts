import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { ALL_GENRES } from '../../services/enhanced-artist-questionnaire-engine';
import { ArtistIdentityService } from '../../services/artist-identity.service';
import { ConnectorPlatform } from '../../types/artist-identity.types';
import { OnboardingService } from '../../services/onboarding.service';
import { RadarChartComponent } from '../radar-chart/radar-chart.component';
import { DatabaseService } from '../../services/database.service';
import {
  PersonaSelectorComponent,
  PersonaOption,
} from '../persona-selector/persona-selector.component';

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
    RadarChartComponent,
    PersonaSelectorComponent,
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
  private destroyRef = inject(DestroyRef);
  private dbService = inject(DatabaseService);
  onboarding = inject(OnboardingService);
  private uplinkService = inject(UplinkService);

  // Auth state
  isAuthenticated = this.authService.isAuthenticated;
  currentUser = this.authService.currentUser;

  // UI state
  showQuestionnaire = signal(false);
  showPersonaSelector = signal(false);
  showUplink = signal(false);
  uploadingImage = signal(false);
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
  /**
   * Commit lifecycle for the header. `failed` exists because a commit can be
   * rejected (the uplink validates the name and genre), and reporting that as
   * `idle` — which is what happened while nothing wrote this signal at all —
   * left the operator staring at "VAULT_STATUS: READY" with no idea the commit
   * never happened.
   */
  saveStatus = signal<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  saveError = signal<string | null>(null);
  activeSection = signal<string>('basic');

  /** Inline roster form state for the Professional Team pane. */
  addingTeamMember = signal(false);
  teamMemberDraft = signal({ name: '', role: '' });

  /**
   * Result of the last archive export/import. `importProfile` answers with a
   * boolean and the builder used to drop it on the floor, so importing a file
   * that was not a profile looked exactly like a successful import.
   */
  archiveNotice = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /**
   * Header status line for the commit lifecycle. `saved`/`failed` describe the
   * last commit rather than the current draft, since field edits are local
   * until the next commit.
   */
  saveStatusLabel = computed(() => {
    switch (this.saveStatus()) {
      case 'saving':
        return 'SYNCING...';
      case 'saved':
        return 'LAST_COMMIT: SAVED';
      case 'failed':
        return 'LAST_COMMIT: FAILED';
      default:
        return 'VAULT_STATUS: READY';
    }
  });

  /** Shared with the Artist DNA Uplink questionnaire — one catalog, no drift. */
  readonly allGenres = ALL_GENRES;
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
    { id: 'persona', label: 'AI Persona', icon: 'fa-robot' },
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
    const syncQuestionnaireQuery = (questionnaire: string | null) => {
      this.showQuestionnaire.set(questionnaire === '1');
    };

    // Query parameters can change while the protected shell stays mounted
    // (for example, the questionnaire CTA navigates to /profile?questionnaire=1
    // without recreating this component). Snapshot-only reads leave the modal
    // stuck in its previous state.
    const queryParamMap = this.route.queryParamMap;
    if (queryParamMap) {
      queryParamMap
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((params) =>
          syncQuestionnaireQuery(params.get('questionnaire'))
        );
    } else {
      // Keeps lightweight unit-test route doubles and embedded hosts safe.
      syncQuestionnaireQuery(
        this.route.snapshot.queryParamMap.get('questionnaire')
      );
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

  async onImageSelected(event: any, target: 'avatarImage' | 'headerImage') {
    const file = event.target.files?.[0];
    if (!file) return;
    // `uploadingImage` drove nothing, so a second pick during a slow upload
    // raced two writes into the same field. The tiles are disabled while it
    // runs; this is the guard for the file input itself.
    if (this.uploadingImage()) return;

    try {
      this.uploadingImage.set(true);
      const url = await this.dbService.uploadAsset(file);
      this.updateProfileField(target, url);
    } catch (err) {
      console.error(`Failed to upload ${target}:`, err);
      alert(`Error uploading ${target}. Please try again.`);
    } finally {
      this.uploadingImage.set(false);
    }
  }

  async saveProfile(): Promise<void> {
    // The commit button is disabled while saving; this also covers a second
    // trigger (the identity console's refresh button) starting mid-commit.
    if (this.saveStatus() === 'saving') return;

    this.showUplink.set(true);
    this.saveStatus.set('saving');
    this.saveError.set(null);
    try {
      const committed = await this.uplinkService.initiateUplink(
        this.editableProfile()
      );
      if (committed) {
        this.saveStatus.set('saved');
      } else {
        this.saveStatus.set('failed');
        this.saveError.set(
          this.uplinkService.status().error ??
            'COMMIT REJECTED. CHECK THE ARTIST NAME AND PRIMARY GENRE.'
        );
      }
    } catch (err: any) {
      this.saveStatus.set('failed');
      this.saveError.set(err?.message || 'COMMIT FAILED. RETRY THE UPLINK.');
    }
  }

  // ── Professional Team roster ──────────────────────────────────────────

  openTeamMemberForm(): void {
    this.teamMemberDraft.set({ name: '', role: '' });
    this.addingTeamMember.set(true);
  }

  cancelTeamMember(): void {
    this.addingTeamMember.set(false);
    this.teamMemberDraft.set({ name: '', role: '' });
  }

  /**
   * Deploy the drafted member onto the roster. The roster rules (trimming, the
   * duplicate-name guard, the share/id defaults) stay in the service, and the
   * stored roster is folded back into the working copy so the new card shows
   * without discarding the fields the operator has not committed yet.
   */
  async deployTeamMember(): Promise<void> {
    const draft = this.teamMemberDraft();
    if (!draft.name.trim()) return;
    const stored = await this.userProfileService.addTeamMember({
      name: draft.name,
      role: draft.role.trim() || undefined,
    });
    this.editableProfile.update((local) => ({ ...local, team: stored.team }));
    this.cancelTeamMember();
  }

  async removeTeamMember(id: string): Promise<void> {
    if (!id) return;
    const stored = await this.userProfileService.removeTeamMember(id);
    this.editableProfile.update((local) => ({ ...local, team: stored.team }));
  }

  async queueConnectorRefresh(connectorId: ConnectorPlatform): Promise<void> {
    this.addLog(`QUEUEING ${connectorId.toUpperCase()} CONNECTOR REFRESH...`);
    try {
      const updated = await this.artistIdentityService.queueConnectorRefresh(
        connectorId,
        this.editableProfile()
      );
      this.editableProfile.set(updated);
      this.addLog(`${connectorId.toUpperCase()} REFRESH QUEUED.`);
    } catch (err: any) {
      // A failed queue used to reject with nothing shown, so the button looked
      // like it had worked.
      this.addLog(
        `${connectorId.toUpperCase()} REFRESH FAILED: ${err?.message || 'UNKNOWN ERROR'}`
      );
    }
  }

  /**
   * Recent connector activity for the identity console. This log existed but
   * was never rendered, so queuing a refresh — the console's primary action —
   * produced no visible response at all.
   */
  private addLog(msg: string) {
    this.syncLog.update((logs) => [msg, ...logs].slice(0, 5));
  }

  /**
   * `*ngFor` tracking for the risk-flag list.
   *
   * The template used to say `track risk`, which is `@for` syntax — inside
   * `*ngFor` it compiled into a `ngForTrack` binding that no element has, so
   * every render of the identity console logged NG0303 and the list went
   * untracked.
   */
  readonly trackRisk = (_index: number, risk: string) => risk;

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

  exportArchive(): void {
    this.userProfileService.exportProfile();
    this.archiveNotice.set({
      kind: 'ok',
      text: 'ARCHIVE EXPORTED. KEEP IT WITH YOUR RELEASES.',
    });
  }

  async onProfileImport(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    const success = await this.userProfileService.importProfile(file);
    if (success) {
      this.editableProfile.set({ ...this.userProfileService.profile() });
      this.archiveNotice.set({
        kind: 'ok',
        text: 'ARCHIVE IMPORTED. COMMIT TO STORE IT IN THE VAULT.',
      });
    } else {
      this.archiveNotice.set({
        kind: 'error',
        text: 'IMPORT FAILED. THE FILE IS NOT A PROFILE ARCHIVE.',
      });
    }
    // Allow re-importing the same filename after a failure.
    event.target.value = '';
  }

  readonly personaOptions = [
    {
      id: 'Aggressive Manager',
      name: 'Aggressive Manager',
      icon: '🔥',
      description: 'Brutal honesty with zero sugar-coating',
      color: '#ef4444',
      intensityLabel: 'MAXIMUM INTENSITY',
    },
    {
      id: 'Elite',
      name: 'Elite Commander',
      icon: '👑',
      description: 'Calculated precision and strategic dominance',
      color: '#0e7c7b',
      intensityLabel: 'STRATEGIC PRECISION',
    },
    {
      id: 'Encouraging Mentor',
      name: 'Encouraging Mentor',
      icon: '🧠',
      description: 'Growth through guidance and patience',
      color: '#10b981',
      intensityLabel: 'CALCULATED SUPPORT',
    },
  ];

  selectPersona(persona: PersonaOption) {
    this.updateProfileField('settings.ai.commanderPersona', persona.id);
  }

  onPersonaSelected(persona: PersonaOption) {
    this.updateProfileField('settings.ai.commanderPersona', persona.id);
    this.showPersonaSelector.set(false);
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
