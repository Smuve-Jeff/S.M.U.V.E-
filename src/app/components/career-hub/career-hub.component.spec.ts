import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CareerHubComponent } from './career-hub.component';
import { API_KEY_TOKEN, AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { UserProfileService } from '../../services/user-profile.service';
import { initialProfile, ProfileAuditLog, UserProfile } from '../../types/profile.types';

describe('CareerHubComponent', () => {
  let component: CareerHubComponent;
  let fixture: ComponentFixture<CareerHubComponent>;
  let profileSig: ReturnType<typeof signal<UserProfile>>;
  let updateProfile: jest.Mock;
  let recordAudit: jest.Mock;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const patchProfile = (patch: Partial<UserProfile>) =>
    profileSig.update((profile) => ({ ...profile, ...patch }));

  beforeEach(async () => {
    profileSig = signal(
      JSON.parse(JSON.stringify(initialProfile)) as UserProfile
    );
    updateProfile = jest.fn(async (patch: Partial<UserProfile>) => {
      profileSig.update((profile) => ({ ...profile, ...patch }));
      return true;
    });
    recordAudit = jest.fn(async (log: ProfileAuditLog) => {
      profileSig.update((profile) => ({
        ...profile,
        strategicHealthScore: log.score,
        criticalDeficits: log.deficits,
        auditHistory: [log, ...(profile.auditHistory ?? [])].slice(0, 20),
      }));
      return true;
    });

    await TestBed.configureTestingModule({
      imports: [
        CareerHubComponent,
        NoopAnimationsModule,
        HttpClientTestingModule,
      ],
      providers: [
        provideRouter([]),
        AiService,
        UIService,
        {
          provide: UserProfileService,
          useValue: {
            profile: profileSig,
            updateProfile,
            recordAudit,
          },
        },
        {
          provide: API_KEY_TOKEN,
          useValue: 'TEST_KEY',
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CareerHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the bento grid sections', () => {
    const matrix = fixture.debugElement.query(
      By.css('.glass-v42.shadow-v42-xl')
    );
    expect(matrix).toBeTruthy();

    expect(text()).toContain('EXECUTIVEHUB');
    expect(text()).toContain('Career Record Audit');
    expect(text()).toContain('Active Pitches');
  });

  /**
   * The hub opened with two invented label pitches, three invented venues, a
   * fixed "Q3 Revenue 4.5K / +18%" tile and a fixed "+12.4% fan growth" tile.
   * None of it belonged to the artist.
   */
  describe('honesty about missing data', () => {
    it('starts with no pitches, rooms, splits or activity', () => {
      expect(component.pitches()).toEqual([]);
      expect(component.venues()).toEqual([]);
      expect(component.activityFeed()).toEqual([]);

      expect(text()).toContain('No pitches tracked yet');
      expect(text()).toContain('No rooms tracked yet');
      expect(text()).toContain('No split sheets generated');
      expect(text()).toContain('No career activity recorded yet');

      expect(text()).not.toContain('Neon Records');
      expect(text()).not.toContain('Obsidian Sound');
      expect(text()).not.toContain('Titanium Arena');
      expect(text()).not.toContain('4.5K');
      expect(text()).not.toContain('+12.4%');
    });

    it('shows the revenue actually recorded on the profile', () => {
      patchProfile({
        financials: {
          ...profileSig().financials,
          totalRevenue: 4500,
          pendingPayouts: 500,
        },
      });
      fixture.detectChanges();

      expect(text()).toContain('$4,500');
      expect(text()).toContain('$500 PENDING');
      expect(component.hasRevenue()).toBe(true);
      expect(component.revenueScenarios().length).toBeGreaterThan(0);
      expect(component.formatCurrency(4500)).toBe('$4.5K');
      expect(component.formatCurrency(500)).toBe('$500');
    });

    it('scores the audit from completed records, not a fixed baseline', () => {
      const audit = component.strategicAudit();

      expect(audit.score).toBe(0);
      expect(audit.deficits.join(' ')).toContain('No catalog works recorded');
      expect(audit.deficits.join(' ')).not.toContain('INVISIBLE');
      expect(audit.recommendations.join(' ')).not.toContain('IMMEDIATELY');
    });

    it('replaces the fake system footer with local record counts', () => {
      expect(text()).toContain('PITCHES: 0 TRACKED');
      expect(text()).toContain('ROOMS: 0 TRACKED');
      expect(text()).toContain('AUDITS: 0 LOGGED');
      expect(text()).toContain('EXTERNAL SYNC: NOT CONNECTED');
      expect(text()).not.toContain('100% OPERATIONAL');
      expect(text()).not.toContain('NEURAL LINK');
      expect(text()).not.toContain('MARKET VOLATILITY');
    });

    it('states that pitch, booking and split records are self-reported', () => {
      expect(text()).toContain('does not send, retract or verify');
      expect(text()).toContain('not a venue confirmation');
      expect(text()).toContain('not legal advice');
    });
  });

  describe('pitch pipeline', () => {
    it('submits a valid pitch and persists it on the profile', async () => {
      component.newLabel.set('Test Label');
      component.newDemo.set('https://test.com/demo');

      await component.submitToLabel();
      fixture.detectChanges();

      expect(updateProfile).toHaveBeenCalledTimes(1);
      const saved = profileSig().careerPitches ?? [];
      expect(saved).toHaveLength(1);
      expect(saved[0].labelName).toBe('Test Label');
      expect(saved[0].demoUrl).toBe('https://test.com/demo');
      expect(saved[0].status).toBe('Pending');
      expect(component.newLabel()).toBe('');
      expect(component.newDemo()).toBe('');
      expect(text()).toContain('Test Label');
    });

    it('keeps the pitch in the form when the profile write fails', async () => {
      component.newLabel.set('Test Label');
      component.newDemo.set('https://test.com/demo');
      updateProfile.mockResolvedValueOnce(false);

      await component.submitToLabel();

      expect(component.pitches()).toEqual([]);
      expect(component.newLabel()).toBe('Test Label');
      expect(component.pitchError()).toContain('could not be saved');
    });

    it('rejects a non-http demo link', async () => {
      component.newLabel.set('Test Label');
      component.newDemo.set('not-a-url');

      await component.submitToLabel();

      expect(updateProfile).not.toHaveBeenCalled();
      expect(component.pitchError()).toContain('http:// or https://');
      expect(component.pitches()).toEqual([]);
    });

    it('refuses a duplicate open pitch to the same label', async () => {
      component.newLabel.set('Test Label');
      component.newDemo.set('https://test.com/one');
      await component.submitToLabel();

      component.newLabel.set('test label');
      component.newDemo.set('https://test.com/two');
      await component.submitToLabel();

      expect(updateProfile).toHaveBeenCalledTimes(1);
      expect(component.pitchError()).toContain('already has an open pitch');
      expect(component.pitches()).toHaveLength(1);
    });

    it('filters by status and advances a pitch through the pipeline', async () => {
      patchProfile({
        careerPitches: [
          {
            id: 'p1',
            labelName: 'Alpha',
            demoUrl: 'https://example.com/a',
            date: '2026-01-01',
            status: 'Pending',
            updatedAt: 1,
          },
          {
            id: 'p2',
            labelName: 'Beta',
            demoUrl: 'https://example.com/b',
            date: '2026-01-02',
            status: 'Signed',
            updatedAt: 2,
          },
        ],
      });
      fixture.detectChanges();

      expect(component.pitchCounts()).toMatchObject({
        all: 2,
        Pending: 1,
        Signed: 1,
      });

      component.setPitchFilter('Pending');
      expect(component.filteredPitches().map((p) => p.id)).toEqual(['p1']);

      await component.setPitchStatus('p1', 'Reviewing');
      expect(component.pitchFilter()).toBe('Pending');
      expect(component.filteredPitches()).toEqual([]);
      expect(component.pitchCounts().Reviewing).toBe(1);
    });

    it('queues overdue open pitches and exposes open pitches without a date', async () => {
      patchProfile({
        careerPitches: [
          {
            id: 'due',
            labelName: 'Alpha',
            demoUrl: 'https://example.com/a',
            date: '2026-01-01',
            status: 'Pending',
            followUpOn: '2000-01-01',
            updatedAt: 1,
          },
          {
            id: 'later',
            labelName: 'Beta',
            demoUrl: 'https://example.com/b',
            date: '2026-01-02',
            status: 'Reviewing',
            followUpOn: '2999-01-01',
            updatedAt: 2,
          },
          {
            id: 'closed',
            labelName: 'Gamma',
            demoUrl: 'https://example.com/c',
            date: '2026-01-03',
            status: 'Signed',
            followUpOn: '2000-01-01',
            updatedAt: 3,
          },
          {
            id: 'none',
            labelName: 'Delta',
            demoUrl: 'https://example.com/d',
            date: '2026-01-04',
            status: 'Pending',
            updatedAt: 4,
          },
        ],
      });
      fixture.detectChanges();

      expect(component.followUpsDue().map((pitch) => pitch.id)).toEqual([
        'due',
      ]);
      expect(component.unscheduledOpenPitches().map((pitch) => pitch.id)).toEqual([
        'none',
      ]);
      expect(component.pitchCounts().due).toBe(1);

      component.setPitchFilter('due');
      fixture.detectChanges();
      expect(component.filteredPitches().map((pitch) => pitch.id)).toEqual([
        'due',
      ]);
      expect(text()).toContain('1 follow-up due');
      expect(text()).toContain('Overdue');
    });

    it('sets and clears a follow-up date on an existing pitch', async () => {
      patchProfile({
        careerPitches: [
          {
            id: 'p1',
            labelName: 'Alpha',
            demoUrl: 'https://example.com/a',
            date: '2026-01-01',
            status: 'Pending',
            updatedAt: 1,
          },
        ],
      });
      fixture.detectChanges();

      await component.setPitchFollowUp('p1', '2999-01-01');
      expect(component.pitches()[0].followUpOn).toBe('2999-01-01');

      await component.setPitchFollowUp('p1', '');
      expect(component.pitches()[0].followUpOn).toBeUndefined();

      await component.setPitchFollowUp('p1', 'not-a-day');
      expect(component.pitches()[0].followUpOn).toBeUndefined();
      expect(component.pitchError()).toContain('valid follow-up date');
    });

    it('stores a follow-up date with a new pitch and clears the field', async () => {
      component.newLabel.set('Test Label');
      component.newDemo.set('https://test.com/demo');
      component.newFollowUp.set('2999-01-01');

      await component.submitToLabel();

      const saved = profileSig().careerPitches ?? [];
      expect(saved[0].followUpOn).toBe('2999-01-01');
      expect(component.newFollowUp()).toBe('');
    });

    it('recalls a pitch only after confirmation', async () => {
      patchProfile({
        careerPitches: [
          {
            id: 'p1',
            labelName: 'Alpha',
            demoUrl: 'https://example.com/a',
            date: '2026-01-01',
            status: 'Pending',
            updatedAt: 1,
          },
        ],
      });
      fixture.detectChanges();

      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      await component.recallPitch(component.pitches()[0]);
      expect(component.pitches()).toHaveLength(1);

      confirmSpy.mockReturnValue(true);
      await component.recallPitch(component.pitches()[0]);
      expect(component.pitches()).toEqual([]);
      confirmSpy.mockRestore();
    });
  });

  describe('live circuit', () => {
    it('validates a venue before tracking it, then cycles its booking', async () => {
      component.newVenueName.set('The Circuit');
      component.newVenueLocation.set('Los Angeles');
      component.newVenueCapacity.set(0);
      await component.addVenue();
      expect(component.venueError()).toContain('Capacity');

      component.newVenueCapacity.set(500);
      await component.addVenue();
      fixture.detectChanges();

      expect(component.venues()).toHaveLength(1);
      expect(component.venues()[0]).toMatchObject({
        name: 'The Circuit',
        location: 'Los Angeles',
        capacity: 500,
        bookingStatus: 'Available',
      });
      expect(component.newVenueName()).toBe('');
      expect(text()).toContain('The Circuit');

      await component.cycleVenueStatus(component.venues()[0]);
      expect(component.venues()[0].bookingStatus).toBe('Pending');

      await component.cycleVenueStatus(component.venues()[0]);
      expect(component.venues()[0].bookingStatus).toBe('Confirmed');
    });

    it('keeps a venue out of the circuit when the write fails', async () => {
      component.newVenueName.set('The Circuit');
      component.newVenueLocation.set('Los Angeles');
      component.newVenueCapacity.set(500);
      updateProfile.mockResolvedValueOnce(false);

      await component.addVenue();

      expect(component.venues()).toEqual([]);
      expect(component.newVenueName()).toBe('The Circuit');
      expect(component.venueError()).toContain('could not be saved');
    });
  });

  describe('audits and split sheets', () => {
    it('logs the live audit to the profile', async () => {
      await component.recordAudit();

      expect(recordAudit).toHaveBeenCalledTimes(1);
      expect(profileSig().auditHistory).toHaveLength(1);
      expect(profileSig().auditHistory[0].score).toBe(
        component.strategicAudit().score
      );
    });

    it('surfaces a failed audit write', async () => {
      recordAudit.mockResolvedValueOnce(false);

      await component.recordAudit();

      expect(component.auditError()).toContain('could not be saved');
    });

    it('plots a trajectory only from recorded audits', () => {
      expect(component.trajectory()).toBeNull();

      patchProfile({
        auditHistory: [
          {
            score: 40,
            status: 'VULNERABLE',
            alerts: [],
            deficits: [],
            timestamp: 1000,
          },
          {
            score: 70,
            status: 'VULNERABLE',
            alerts: [],
            deficits: [],
            timestamp: 2000,
          },
        ],
      });

      const chart = component.trajectory();
      expect(chart).not.toBeNull();
      expect(chart!.points.map((p) => p.score)).toEqual([40, 70]);
      expect(chart!.line.startsWith('M')).toBe(true);
      expect(chart!.area.endsWith('Z')).toBe(true);
    });

    it('creates a split sheet from real parties instead of 50/50 placeholders', async () => {
      component.splitTitle.set('Midnight Run');
      component.splitCollaborator.set('Jules');
      component.splitPercent.set(60);

      await component.generateSplitSheet();
      fixture.detectChanges();

      const split = profileSig().financials.splitSheets[0];
      expect(split.title).toBe('Midnight Run');
      expect(split.splits).toEqual([
        { role: 'Primary Artist', percentage: 60, name: 'New Artist' },
        { role: 'Collaborator', percentage: 40, name: 'Jules' },
      ]);
      expect(component.expandedSplitId()).toBe(split.id);
      expect(text()).toContain('Midnight Run');
      expect(text()).toContain('Jules');
    });

    it('rejects an impossible split percentage', async () => {
      component.splitTitle.set('Midnight Run');
      component.splitCollaborator.set('Jules');
      component.splitPercent.set(150);

      await component.generateSplitSheet();

      expect(component.splitError()).toContain('between 0 and 100');
      expect(profileSig().financials.splitSheets).toEqual([]);
    });
  });
});
