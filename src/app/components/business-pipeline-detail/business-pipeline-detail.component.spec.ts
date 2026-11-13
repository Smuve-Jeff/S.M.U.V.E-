import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BusinessPipelineDetailComponent } from './business-pipeline-detail.component';
import { BusinessPipelineService } from '../../services/business-pipeline.service';
import { UserContextService } from '../../services/user-context.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import {
  UserProfileService,
  initialProfile,
} from '../../services/user-profile.service';
import type { UserProfile } from '../../types/profile.types';
import type { BusinessPipeline } from '../../types/business.types';

/**
 * The pipeline timeline used to colour every stage up to `currentStageIndex`
 * as if it were finished, so an open first stage looked complete. Its impact
 * panel also quoted fixed "+12.4%" figures. These tests pin the timeline to the
 * stages' own status and the panel to counted evidence.
 */
describe('BusinessPipelineDetailComponent', () => {
  let fixture: ComponentFixture<BusinessPipelineDetailComponent>;
  let component: BusinessPipelineDetailComponent;
  let pipelines: ReturnType<typeof signal<BusinessPipeline[]>>;
  let profileSignal: WritableSignal<UserProfile>;

  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  const pipeline = (): BusinessPipeline => ({
    id: 'biz-1',
    type: 'Merch',
    name: 'Official Merch Pathway',
    status: 'Active',
    currentStageIndex: 1,
    stages: [
      { id: 's1', name: 'Stage One', status: 'Completed', steps: [] },
      { id: 's2', name: 'Stage Two', status: 'In Progress', steps: [] },
      { id: 's3', name: 'Stage Three', status: 'Locked', steps: [] },
    ],
    createdAt: 1,
    updatedAt: 1,
  });

  const circles = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.w-10.h-10')
    ) as HTMLElement[];

  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';

  beforeEach(async () => {
    pipelines = signal<BusinessPipeline[]>([pipeline()]);
    profileSignal = signal(profile());
    await TestBed.configureTestingModule({
      imports: [BusinessPipelineDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { params: of({ id: 'biz-1' }) } },
        {
          provide: BusinessPipelineService,
          useValue: {
            activePipelines: pipelines,
            updateStep: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: UserContextService, useValue: { setMainViewMode: jest.fn() } },
        {
          provide: InteractionDialogService,
          useValue: {
            alert: jest.fn().mockResolvedValue(undefined),
            prompt: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: UserProfileService, useValue: { profile: profileSignal } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BusinessPipelineDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('reads stage state from the stage status, not the active index', () => {
    const [completed, current, upcoming] = component.pipeline()!.stages;

    expect(component.stageState(completed)).toBe('complete');
    expect(component.stageState(current)).toBe('current');
    expect(component.stageState(upcoming)).toBe('upcoming');
  });

  it('draws one check for the finished stage and keeps the open stage numbered', () => {
    const [completed, current, upcoming] = circles();

    expect(completed.querySelector('.fa-check')).not.toBeNull();
    expect(completed.textContent?.trim()).toBe('');

    expect(current.querySelector('.fa-check')).toBeNull();
    expect(current.textContent?.trim()).toBe('2');

    expect(upcoming.querySelector('.fa-check')).toBeNull();
    expect(upcoming.textContent?.trim()).toBe('3');
  });

  it('shows every stage complete once the pipeline is completed', () => {
    const base = pipeline();
    pipelines.set([
      {
        ...base,
        status: 'Completed',
        currentStageIndex: 2,
        stages: base.stages.map((stage) => ({
          ...stage,
          status: 'Completed' as const,
        })),
      },
    ]);
    fixture.detectChanges();

    expect(circles().every((circle) => circle.querySelector('.fa-check'))).toBe(
      true
    );
    // The open-stage label no longer pulses "In Progress" on a finished run.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.animate-pulse')
    ).toBeNull();
  });

  it('explains a missing pathway instead of rendering a blank page', () => {
    pipelines.set([]);
    fixture.detectChanges();

    const nativeElement = fixture.nativeElement as HTMLElement;
    expect(nativeElement.querySelector('.pipeline-missing')).not.toBeNull();
    expect(nativeElement.textContent).toContain(
      'This pathway is not on your record'
    );
  });

  it('lets a finished phase be reviewed and its step reopened', async () => {
    const base = pipeline();
    pipelines.set([
      {
        ...base,
        stages: [
          {
            id: 's1',
            name: 'Stage One',
            status: 'Completed',
            steps: [
              {
                id: 'a',
                title: 'Moodboard',
                description: '',
                status: 'Completed',
                aiGuidance: '',
              },
            ],
          },
          base.stages[1],
          base.stages[2],
        ],
      },
    ]);
    fixture.detectChanges();

    // The open stage is phase two until the artist picks another one.
    expect(text()).toContain('Phase 2: Stage Two');

    component.selectStage(0);
    fixture.detectChanges();

    expect(text()).toContain('Phase 1: Stage One');
    expect(text()).toContain('Reviewing a finished phase');

    const reopen = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((button) => button.textContent?.trim() === 'Reopen')!;
    reopen.click();
    await fixture.whenStable();

    const service = TestBed.inject(BusinessPipelineService) as unknown as {
      updateStep: jest.Mock;
    };
    expect(service.updateStep).toHaveBeenCalledWith(
      'biz-1',
      's1',
      'a',
      'Pending'
    );
  });

  it('renames the pathway from its own header', async () => {
    const rename = jest.fn().mockResolvedValue(true);
    (TestBed.inject(BusinessPipelineService) as any).renamePipeline = rename;
    const dialog = TestBed.inject(InteractionDialogService) as any;
    dialog.prompt.mockResolvedValueOnce('Night Shift Records');

    await component.renamePipeline();

    expect(dialog.prompt).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: 'Official Merch Pathway' })
    );
    expect(rename).toHaveBeenCalledWith('biz-1', 'Night Shift Records');
  });

  it('quotes counted progress and evidence instead of invented percentages', () => {
    expect(text()).toContain('Evidence Impact');
    expect(text()).not.toContain('+12.4%');
    expect(text()).not.toContain('+8.0%');

    // One of this pipeline's three stages is complete.
    expect(component.pipelinePercent()).toBe(33);
    expect(text()).toContain('33%');
    expect(text()).toContain('1/3 stages');

    // Nothing is recorded on an empty profile, so no phase is scored.
    expect(
      component.spinePhases().every((phase) => phase.provenance === 'missing')
    ).toBe(true);
    expect(text()).toContain('No evidence');
    expect(
      component
        .spinePhases()
        .every((phase) => component.phasePercent(phase) === 0)
    ).toBe(true);
  });

  it('reflects evidence the artist records on the profile', () => {
    profileSignal.update(
      (current) =>
        ({
          ...current,
          legalInfrastructure: {
            ...(current as any).legalInfrastructure,
            isIncorporated: true,
          },
        }) as UserProfile
    );
    fixture.detectChanges();

    const business = component
      .spinePhases()
      .find((phase) => phase.id === 'business')!;

    expect(business.provenance).not.toBe('missing');
    expect(business.completed).toBeGreaterThan(0);
    expect(text()).toContain(
      `${business.completed}/${business.total} steps evidenced`
    );
    expect(component.phasePercent(business)).toBeGreaterThan(0);
  });
});
