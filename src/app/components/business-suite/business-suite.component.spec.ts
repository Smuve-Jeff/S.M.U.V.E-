import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { BusinessSuiteComponent } from './business-suite.component';
import { BusinessPipelineService } from '../../services/business-pipeline.service';
import { UserContextService } from '../../services/user-context.service';
import { UserProfileService, initialProfile } from '../../services/user-profile.service';
import type { UserProfile } from '../../types/profile.types';

/**
 * The Business Suite now reports the lifecycle's own business evidence. These
 * tests are about honesty on an empty record and agreement with the pathway
 * once evidence exists — not about the module marketplace.
 */
describe('BusinessSuiteComponent', () => {
  let fixture: ComponentFixture<BusinessSuiteComponent>;
  let component: BusinessSuiteComponent;
  let profileSignal: ReturnType<typeof signal<UserProfile>>;

  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  const create = async (value: UserProfile) => {
    profileSignal = signal(value);
    await TestBed.configureTestingModule({
      imports: [BusinessSuiteComponent],
      providers: [
        provideRouter([]),
        { provide: BusinessPipelineService, useValue: { activePipelines: signal([]) } },
        { provide: UserContextService, useValue: { setMainViewMode: jest.fn() } },
        { provide: UserProfileService, useValue: { profile: profileSignal } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BusinessSuiteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('reports the spine as unevidenced instead of scoring it zero', async () => {
    const nativeElement = await create(profile());
    const text = nativeElement.textContent || '';

    expect(nativeElement.querySelector('.lifecycle-spine')).not.toBeNull();
    expect(text).toContain('Rights, structure, and revenue');
    expect(component.spineCompleted()).toBe(0);
    expect(text).toContain(
      `0 of ${component.spineTotal()} rights, business, and money steps are evidenced`
    );
    expect(component.spinePhases().map((phase) => phase.id)).toEqual([
      'rights',
      'business',
      'money',
    ]);
    expect(component.spinePhases().every((phase) => phase.provenance === 'missing')).toBe(true);
    expect(component.phaseScoreLabel(component.spinePhases()[1])).toBe('No evidence');
    // A missing phase must not be dressed up as a failed 0% score.
    expect(text).not.toContain('0%');
  });

  it('counts business evidence the artist actually recorded', async () => {
    const nativeElement = await create(
      profile({
        team: [{ id: 't1', name: 'Dana', role: 'Engineer' }] as any,
        legalInfrastructure: {
          proAffiliation: 'BMI',
          hasStandardSplitSheet: 'In Use',
          isIncorporated: true,
          trademarkStatus: 'Registered',
        } as any,
      })
    );

    const business = component.spinePhases().find((phase) => phase.id === 'business')!;
    expect(business.completed).toBeGreaterThan(0);
    expect(business.provenance).not.toBe('missing');
    expect(component.phaseScoreLabel(business)).toMatch(/%$/);
    expect(nativeElement.textContent).toContain(`${business.completed}/${business.total} steps`);
  });

  it('leads with a business step that can be started now, quoted with its evidence', async () => {
    await create(profile());

    const next = component.spineNext();
    expect(next).not.toBeNull();
    expect(['rights', 'business', 'money']).toContain(next!.phase);
    expect(next!.status).not.toBe('blocked');
    expect(next!.action.length).toBeGreaterThan(0);
  });

  it('names the career-wide move when it sits outside this workspace', async () => {
    const nativeElement = await create(profile());

    const move = component.lifecycle().nextBestMove;
    expect(move).not.toBeNull();
    expect(component.careerNextMove()?.id).toBe(
      ['rights', 'business', 'money'].includes(move!.phase) ? undefined : move!.id
    );
    if (component.careerNextMove()) {
      expect(nativeElement.textContent).toContain(
        `The career-wide next move is in ${move!.phase}`
      );
    }
  });

  it('updates with the profile instead of caching the first snapshot', async () => {
    await create(profile());
    const before = component.spineCompleted();

    profileSignal.update((current) => ({
      ...current,
      legalInfrastructure: { ...(current as any).legalInfrastructure, isIncorporated: true },
    }) as UserProfile);
    fixture.detectChanges();

    expect(component.spineCompleted()).toBeGreaterThan(before);
  });
});
