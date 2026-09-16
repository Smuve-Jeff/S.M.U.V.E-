import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ProfileEditorComponent } from './profile-editor.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';
import { AiService } from '../../services/ai.service';
import { ArtistIdentityService } from '../../services/artist-identity.service';
import { DatabaseService } from '../../services/database.service';
import { OnboardingService } from '../../services/onboarding.service';
import { UplinkService } from '../../services/uplink.service';
import { LoggingService } from '../../services/logging.service';
import { initialProfile, TeamMember, UserProfile } from '../../types/profile.types';

/**
 * Child surfaces are stubbed so the REAL profile template renders without
 * pulling in their dependency graphs — the tests below are about the builder's
 * own wiring (commit feedback, the roster, the connector log), which only the
 * real template exercises.
 */
@Component({
  selector: 'app-form-field',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class FormFieldStub {
  @Input() label = '';
  @Input() description = '';
}

@Component({ selector: 'app-radar-chart', standalone: true, template: '' })
class RadarChartStub {
  @Input() expertise: unknown;
}

@Component({ selector: 'app-catalog-manager', standalone: true, template: '' })
class CatalogManagerStub {}

@Component({ selector: 'app-artist-questionnaire', standalone: true, template: '' })
class ArtistQuestionnaireStub {
  @Output() close = new EventEmitter<void>();
  @Output() complete = new EventEmitter<UserProfile>();
}

@Component({ selector: 'app-persona-selector', standalone: true, template: '' })
class PersonaSelectorStub {
  @Output() select = new EventEmitter<unknown>();
  @Output() close = new EventEmitter<void>();
}

@Component({ selector: 'app-uplink-console', standalone: true, template: '' })
class UplinkConsoleStub {
  @Output() close = new EventEmitter<void>();
}

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'tm-1',
  name: 'Dana',
  role: 'Manager',
  share: 0,
  joinedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('ProfileEditorComponent', () => {
  let profile: ReturnType<typeof signal<UserProfile>>;
  let userProfileService: {
    profile: ReturnType<typeof signal<UserProfile>>;
    addTeamMember: jest.Mock;
    removeTeamMember: jest.Mock;
    exportProfile: jest.Mock;
    importProfile: jest.Mock;
    updateProfile: jest.Mock;
  };
  let uplink: { initiateUplink: jest.Mock; status: jest.Mock };
  let identity: {
    buildIdentitySnapshot: jest.Mock;
    getConnectorMatrix: jest.Mock;
    queueConnectorRefresh: jest.Mock;
  };
  let database: { uploadAsset: jest.Mock };
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const identitySnapshot = () => ({
    fingerprint: {
      trustScore: 72,
      changeSummary: ['No drift detected.'],
      riskFlags: [],
    },
    resolution: { confidenceScore: 85, explainability: ['Matched on name.'] },
    sync: { queueDepth: 0 },
    recommendations: [
      {
        title: 'Claim every profile',
        description: 'Unclaimed handles split your identity graph.',
        actionLabel: 'Claim',
        evidence: ['two unclaimed handles'],
        impactScore: 9,
        confidenceScore: 8,
      },
    ],
  });

  const connectors = [
    {
      connector: 'spotify',
      official: true,
      verification: 'verification: official',
      status: 'live',
      health: 'strong',
      followersOrListeners: 1200,
    },
  ];

  const createComponent = async () => {
    TestBed.resetTestingModule();
    queryParams = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [ProfileEditorComponent],
      providers: [
        { provide: UserProfileService, useValue: userProfileService },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(true),
            currentUser: signal({ id: 'u1', name: 'Nova' }),
          },
        },
        {
          provide: AiService,
          useValue: {
            intelligenceBriefs: signal([
              { title: 'Release window', content: 'Ship in Q3.' },
            ]),
          },
        },
        { provide: ArtistIdentityService, useValue: identity },
        { provide: DatabaseService, useValue: database },
        { provide: OnboardingService, useValue: { shouldShow: () => false } },
        { provide: UplinkService, useValue: uplink },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParams.asObservable(),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    })
      .overrideComponent(ProfileEditorComponent, {
        set: {
          imports: [
            CommonModule,
            FormsModule,
            FormFieldStub,
            RadarChartStub,
            CatalogManagerStub,
            ArtistQuestionnaireStub,
            PersonaSelectorStub,
            UplinkConsoleStub,
          ],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ProfileEditorComponent);
    fixture.detectChanges();

    return {
      fixture,
      component: fixture.componentInstance,
      /** The template only mounts the active pane, as the sidebar drives it. */
      show: (section: string) => {
        fixture.componentInstance.activeSection.set(section);
        fixture.detectChanges();
      },
      buttons: () =>
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('button')
        ),
      button: (text: string) => {
        const match = Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('button')
        ).find((button) => button.textContent?.includes(text));
        if (!match) throw new Error(`No button matching "${text}"`);
        return match as HTMLButtonElement;
      },
      text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
    };
  };

  beforeEach(() => {
    profile = signal<UserProfile>({
      ...initialProfile,
      artistName: 'Nova',
      primaryGenre: 'Hip Hop',
      team: [],
    });
    userProfileService = {
      profile,
      addTeamMember: jest.fn(async () => profile()),
      removeTeamMember: jest.fn(async () => profile()),
      exportProfile: jest.fn(),
      importProfile: jest.fn(async () => true),
      updateProfile: jest.fn(async () => undefined),
    };
    uplink = {
      initiateUplink: jest.fn(async () => true),
      status: jest.fn(() => ({ stage: 'idle', message: '', logs: [] })),
    };
    identity = {
      buildIdentitySnapshot: jest.fn(() => identitySnapshot()),
      getConnectorMatrix: jest.fn(() => connectors),
      queueConnectorRefresh: jest.fn(async (id: string, p: UserProfile) => ({
        ...p,
        queuedFor: id,
      })),
    };
    database = { uploadAsset: jest.fn(async () => 'https://cdn/asset.png') };
    // The upload failure path reports through `alert`, which jsdom does not implement.
    (globalThis as unknown as { alert: unknown }).alert = jest.fn();
  });

  describe('route-driven questionnaire', () => {
    it('reacts when the questionnaire query parameter changes in place', async () => {
      const { fixture, component } = await createComponent();

      expect(component.showQuestionnaire()).toBe(false);
      queryParams.next(convertToParamMap({ questionnaire: '1' }));
      fixture.detectChanges();
      expect(component.showQuestionnaire()).toBe(true);

      queryParams.next(convertToParamMap({}));
      fixture.detectChanges();
      expect(component.showQuestionnaire()).toBe(false);
    });
  });

  describe('commit', () => {
    it('commits the draft through the uplink and reports it in the header', async () => {
      const { fixture, component, button, text } = await createComponent();
      component.editableProfile.update((p) => ({ ...p, location: 'Atlanta' }));

      button('Commit Neural Protocol').click();
      await fixture.whenStable();

      expect(uplink.initiateUplink).toHaveBeenCalledWith(
        expect.objectContaining({ artistName: 'Nova', location: 'Atlanta' })
      );
      expect(component.saveStatus()).toBe('saved');
      expect(text()).toContain('LAST_COMMIT: SAVED');
    });

    it('locks the commit control while the uplink runs and ignores a second commit', async () => {
      const { fixture, component, button, text } = await createComponent();
      let finish: (value: boolean) => void = () => undefined;
      uplink.initiateUplink.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
      );

      button('Commit Neural Protocol').click();
      // A second trigger (the identity console's refresh runs the same commit).
      component.saveProfile();
      await Promise.resolve();
      fixture.detectChanges();

      expect(uplink.initiateUplink).toHaveBeenCalledTimes(1);
      expect(component.saveStatus()).toBe('saving');
      expect(text()).toContain('SYNCING...');
      expect(button('Commit Neural Protocol').disabled).toBe(true);

      finish(true);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.saveStatus()).toBe('saved');
      expect(button('Commit Neural Protocol').disabled).toBe(false);
    });

    it('surfaces a rejected commit instead of leaving the header at READY', async () => {
      const { fixture, component, button, text } = await createComponent();
      uplink.initiateUplink.mockResolvedValue(false);
      uplink.status.mockReturnValue({
        stage: 'failed',
        message: 'TRANSMISSION SEVERED',
        logs: [],
        error: 'GENRE_UNDEFINED: Strategic alignment requires a primary domain.',
      });

      button('Commit Neural Protocol').click();
      await fixture.whenStable();

      expect(component.saveStatus()).toBe('failed');
      expect(text()).toContain('LAST_COMMIT: FAILED');
      expect(text()).toContain('GENRE_UNDEFINED');
    });
  });

  describe('professional team', () => {
    it('deploys a drafted member onto the roster', async () => {
      const { fixture, component, button, text } = await createComponent();
      const withMember = { ...profile(), team: [member()] };
      userProfileService.addTeamMember.mockResolvedValue(withMember);
      component.activeSection.set('team');
      fixture.detectChanges();

      button('Deploy Team Member').click();
      fixture.detectChanges();

      const inputs = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('form input')
      ) as HTMLInputElement[];
      expect(inputs).toHaveLength(2);

      inputs[0].value = 'Dana';
      inputs[0].dispatchEvent(new Event('input'));
      inputs[1].value = 'Manager';
      inputs[1].dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (fixture.nativeElement as HTMLElement)
        .querySelector('form')!
        .dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(userProfileService.addTeamMember).toHaveBeenCalledWith({
        name: 'Dana',
        role: 'Manager',
      });
      expect(component.addingTeamMember()).toBe(false);
      expect(text()).toContain('Dana');
    });

    it('keeps the roster from the store without dropping uncommitted edits', async () => {
      const { fixture, component } = await createComponent();
      const withMember = { ...profile(), team: [member()] };
      userProfileService.addTeamMember.mockResolvedValue(withMember);
      component.editableProfile.update((p) => ({
        ...p,
        location: 'Atlanta',
        team: [],
      }));

      component.teamMemberDraft.set({ name: 'Dana', role: '' });
      await component.deployTeamMember();

      expect(component.editableProfile().team).toHaveLength(1);
      expect(component.editableProfile().location).toBe('Atlanta');
    });

    it('does not deploy a blank name', async () => {
      const { fixture, component, button } = await createComponent();
      component.activeSection.set('team');
      fixture.detectChanges();

      button('Deploy Team Member').click();
      fixture.detectChanges();

      expect(button('Deploy').disabled).toBe(true);

      component.teamMemberDraft.set({ name: '   ', role: '' });
      await component.deployTeamMember();

      expect(userProfileService.addTeamMember).not.toHaveBeenCalled();
    });

    it('removes a member from the roster', async () => {
      const { fixture, component, text } = await createComponent();
      profile.set({ ...profile(), team: [member()] });
      userProfileService.removeTeamMember.mockResolvedValue({
        ...profile(),
        team: [],
      });
      component.activeSection.set('team');
      fixture.detectChanges();
      expect(text()).toContain('Dana');

      const removeButton = (fixture.nativeElement as HTMLElement).querySelector(
        '[aria-label="Remove Dana"]'
      ) as HTMLButtonElement;
      removeButton.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(userProfileService.removeTeamMember).toHaveBeenCalledWith('tm-1');
      expect(text()).not.toContain('Dana');
    });
  });

  describe('identity console', () => {
    it('queues a connector refresh and shows it in the activity log', async () => {
      const { fixture, component, button, text } = await createComponent();
      component.activeSection.set('identity-console');
      fixture.detectChanges();

      button('Queue Refresh').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(identity.queueConnectorRefresh).toHaveBeenCalledWith(
        'spotify',
        expect.any(Object)
      );
      expect(text()).toContain('Connector Activity');
      expect(text()).toContain('SPOTIFY REFRESH QUEUED.');
    });

    it('reports a failed queue instead of failing silently', async () => {
      const { fixture, component, button, text } = await createComponent();
      identity.queueConnectorRefresh.mockRejectedValue(
        new Error('offline queue full')
      );
      component.activeSection.set('identity-console');
      fixture.detectChanges();

      button('Queue Refresh').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('SPOTIFY REFRESH FAILED: offline queue full');
    });
  });

  describe('template health', () => {
    it('renders the risk flags without an unknown ngFor binding', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      identity.buildIdentitySnapshot.mockReturnValue({
        ...identitySnapshot(),
        fingerprint: {
          trustScore: 72,
          changeSummary: ['No drift detected.'],
          riskFlags: ['No verified handle on Spotify'],
        },
      });

      const { fixture, component, text } = await createComponent();
      component.activeSection.set('identity-console');
      fixture.detectChanges();

      expect(text()).toContain('No verified handle on Spotify');
      // `track x` is `@for` syntax; inside `*ngFor` it became an unknown
      // `ngForTrack` binding and logged on every render.
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('NG0303');
      errorSpy.mockRestore();
    });
  });

  describe('archive and asset upload', () => {
    it('stops a second upload while the first is still running', async () => {
      const { component } = await createComponent();
      let finish: (url: string) => void = () => undefined;
      database.uploadAsset.mockReturnValue(
        new Promise<string>((resolve) => {
          finish = resolve;
        })
      );
      const file = new File(['bytes'], 'avatar.png', { type: 'image/png' });
      const event = { target: { files: [file] } };

      const first = component.onImageSelected(event, 'avatarImage');
      const second = component.onImageSelected(event, 'headerImage');
      finish('https://cdn/asset.png');
      await Promise.all([first, second]);

      expect(database.uploadAsset).toHaveBeenCalledTimes(1);
      expect(component.editableProfile().avatarImage).toBe(
        'https://cdn/asset.png'
      );
    });

    it('reports an import that could not be read as a profile', async () => {
      const { fixture, text } = await createComponent();
      userProfileService.importProfile.mockResolvedValue(false);

      await fixture.componentInstance.onProfileImport({
        target: { files: [new File(['nope'], 'notes.txt')], value: '' },
      });
      fixture.detectChanges();

      expect(text()).toContain('IMPORT FAILED');
    });

    it('reports a successful import', async () => {
      const { fixture, text } = await createComponent();

      await fixture.componentInstance.onProfileImport({
        target: { files: [new File(['{}'], 'archive.json')], value: '' },
      });
      fixture.detectChanges();

      expect(text()).toContain('ARCHIVE IMPORTED');
    });

    it('reports an export', async () => {
      const { fixture, component, text } = await createComponent();

      component.exportArchive();
      fixture.detectChanges();

      expect(userProfileService.exportProfile).toHaveBeenCalled();
      expect(text()).toContain('ARCHIVE EXPORTED');
    });
  });
});
