import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { BusinessSuiteComponent } from './business-suite.component';
import { BusinessPipelineService } from '../../services/business-pipeline.service';
import { UserContextService } from '../../services/user-context.service';
import { UserProfileService, initialProfile } from '../../services/user-profile.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import type { UserProfile } from '../../types/profile.types';
import {
  BUSINESS_PIPELINE_TYPES,
  type BusinessPipeline,
} from '../../types/business.types';

/**
 * The Business Suite now reports the lifecycle's own business evidence. These
 * tests are about honesty on an empty record and agreement with the pathway
 * once evidence exists — not about the module marketplace.
 */
describe('BusinessSuiteComponent', () => {
  let fixture: ComponentFixture<BusinessSuiteComponent>;
  let component: BusinessSuiteComponent;
  let profileSignal: ReturnType<typeof signal<UserProfile>>;
  let bizMock: {
    activePipelines: WritableSignal<BusinessPipeline[]>;
    initializeModule: jest.Mock;
    removePipeline: jest.Mock;
    archivePipeline: jest.Mock;
    restorePipeline: jest.Mock;
  };
  let dialogMock: { confirm: jest.Mock; alert: jest.Mock };

  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  const pipeline = (
    overrides: Partial<BusinessPipeline> = {}
  ): BusinessPipeline => ({
    id: 'biz-1',
    type: 'Merch',
    name: 'Official Merch Pathway',
    status: 'Active',
    currentStageIndex: 0,
    stages: [
      { id: 's1', name: 'Stage One', status: 'In Progress', steps: [] },
      { id: 's2', name: 'Stage Two', status: 'Locked', steps: [] },
      { id: 's3', name: 'Stage Three', status: 'Locked', steps: [] },
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  const create = async (value: UserProfile) => {
    profileSignal = signal(value);
    bizMock = {
      activePipelines: signal<BusinessPipeline[]>([]),
      initializeModule: jest.fn().mockResolvedValue('biz-new'),
      removePipeline: jest.fn().mockResolvedValue(true),
      archivePipeline: jest.fn().mockResolvedValue(true),
      restorePipeline: jest.fn().mockResolvedValue(true),
    };
    dialogMock = {
      confirm: jest.fn().mockResolvedValue(false),
      alert: jest.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [BusinessSuiteComponent],
      providers: [
        provideRouter([]),
        { provide: BusinessPipelineService, useValue: bizMock },
        { provide: UserContextService, useValue: { setMainViewMode: jest.fn() } },
        { provide: UserProfileService, useValue: { profile: profileSignal } },
        { provide: InteractionDialogService, useValue: dialogMock },
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

  it('opens the pathway the service returns when a module is started', async () => {
    await create(profile());
    const navigate = jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    await component.startModule('Merch');

    expect(bizMock.initializeModule).toHaveBeenCalledWith(
      'Merch',
      'Official Merch Pathway'
    );
    expect(navigate).toHaveBeenCalledWith(['/business-pipeline', 'biz-new']);
  });

  it('offers to resume a module that already has an open pipeline', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([pipeline({ type: 'Merch' })]);
    fixture.detectChanges();

    const cards = Array.from(
      nativeElement.querySelectorAll('.glass-v42')
    ) as HTMLElement[];
    const card = (label: string) =>
      cards.find((candidate) => candidate.textContent?.includes(label))!;

    expect(card('Merch').querySelector('button')?.textContent).toContain('RESUME');
    expect(card('Legal').querySelector('button')?.textContent).toContain(
      'INITIALIZE'
    );
  });

  it('does not promise to resume an archived pathway', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([
      pipeline({ type: 'Merch', status: 'Archived' }),
    ]);
    fixture.detectChanges();

    const cards = Array.from(
      nativeElement.querySelectorAll('.glass-v42')
    ) as HTMLElement[];
    const card = cards.find((candidate) =>
      candidate.textContent?.includes('Merch')
    )!;

    // Nothing to resume: a new pathway is what the click actually creates.
    expect(component.activePipelineFor('Merch')).toBeNull();
    expect(card.querySelector('button')?.textContent).toContain('INITIALIZE');
  });

  it('shows 0% for an untouched pipeline and 100% only when every stage is done', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([pipeline()]);
    fixture.detectChanges();

    // The first stage is open, but no stage has been completed.
    expect(nativeElement.textContent).toContain('0%');

    bizMock.activePipelines.set([
      pipeline({
        status: 'Completed',
        currentStageIndex: 2,
        stages: pipeline().stages.map((stage) => ({
          ...stage,
          status: 'Completed' as const,
        })),
      }),
    ]);
    fixture.detectChanges();

    expect(nativeElement.textContent).toContain('100%');
  });

  it('offers archive and removal only for a completed pipeline', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([
      pipeline({ id: 'biz-open', name: 'Open Merch Pathway' }),
      pipeline({
        id: 'biz-done',
        name: 'Finished Merch Pathway',
        status: 'Completed',
      }),
    ]);
    fixture.detectChanges();

    const cards = Array.from(
      nativeElement.querySelectorAll('.material-depth')
    ) as HTMLElement[];
    const card = (label: string) =>
      cards.find((candidate) => candidate.textContent?.includes(label))!;

    expect(card('Open Merch Pathway').querySelector('button')).toBeNull();
    expect(
      Array.from(card('Finished Merch Pathway').querySelectorAll('button')).map(
        (button) => button.textContent?.trim()
      )
    ).toEqual(['Archive pathway', 'Remove pathway']);
  });

  it('removes a completed pipeline only after confirmation', async () => {
    await create(profile());
    bizMock.activePipelines.set([pipeline({ status: 'Completed' })]);
    fixture.detectChanges();
    const completed = bizMock.activePipelines()[0];

    dialogMock.confirm.mockResolvedValueOnce(false);
    await component.removePipeline(completed);
    expect(bizMock.removePipeline).not.toHaveBeenCalled();

    dialogMock.confirm.mockResolvedValueOnce(true);
    await component.removePipeline(completed);
    expect(bizMock.removePipeline).toHaveBeenCalledWith('biz-1');
  });

  it('removing from the card does not open the pathway', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([pipeline({ status: 'Completed' })]);
    fixture.detectChanges();
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate');
    dialogMock.confirm.mockResolvedValueOnce(true);

    const button = Array.from(
      nativeElement.querySelectorAll('.material-depth button')
    ).find((candidate) =>
      candidate.textContent?.includes('Remove pathway')
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(bizMock.removePipeline).toHaveBeenCalledWith('biz-1');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('names the next step on a pathway card instead of hiding it', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([
      pipeline({
        stages: [
          {
            id: 's1',
            name: 'Stage One',
            status: 'In Progress',
            steps: [
              {
                id: 'a',
                title: 'Moodboard',
                description: '',
                status: 'Completed',
                aiGuidance: '',
              },
              {
                id: 'b',
                title: 'Vendor Setup',
                description: '',
                status: 'Pending',
                aiGuidance: '',
              },
            ],
          },
          { id: 's2', name: 'Stage Two', status: 'Locked', steps: [] },
          { id: 's3', name: 'Stage Three', status: 'Locked', steps: [] },
        ],
      }),
    ]);
    fixture.detectChanges();

    const text = nativeElement.textContent || '';
    expect(text).toContain('Next step');
    expect(text).toContain('Vendor Setup');
    expect(text).toContain('1/2');
  });

  it('gives each module its own icon instead of one shared rocket', async () => {
    const nativeElement = await create(profile());
    const icons = Array.from(
      nativeElement.querySelectorAll(
        '.glass-v42 .material-symbols-outlined'
      )
    ).map((icon) => icon.textContent?.trim());

    expect(icons).toHaveLength(component.availableModules.length);
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons).not.toContain('rocket_launch');
  });

  it('reports a counted pathway status instead of claiming OPERATIONAL', async () => {
    const nativeElement = await create(profile());

    expect(nativeElement.textContent).not.toContain('OPERATIONAL');
    expect(nativeElement.textContent).toContain('NONE STARTED');
    expect(nativeElement.textContent).toContain('Recorded pathways');

    bizMock.activePipelines.set([
      pipeline({ id: 'biz-a', name: 'A', status: 'Active' }),
      pipeline({ id: 'biz-b', name: 'B', status: 'Active' }),
    ]);
    fixture.detectChanges();

    expect(component.pathwayStatus()).toBe('2 IN PROGRESS');
  });

  it('offers every pathway type the engine can build', () => {
    expect(new Set(component.availableModules.map((m) => m.type))).toEqual(
      new Set(BUSINESS_PIPELINE_TYPES)
    );
    // The lane panel and the module grid must describe the same catalog.
    expect(
      new Set([
        ...component.availableModules.map((m) => m.type),
        ...component.expansionLanes.map((l) => l.type),
      ])
    ).toEqual(new Set(BUSINESS_PIPELINE_TYPES));
  });

  it('explains what a pathway is before anything is started', async () => {
    const nativeElement = await create(profile());

    expect(nativeElement.querySelector('.pipeline-empty')).not.toBeNull();
    expect(nativeElement.textContent).toContain('Pick a module and build one');

    bizMock.activePipelines.set([pipeline()]);
    fixture.detectChanges();

    expect(nativeElement.querySelector('.pipeline-empty')).toBeNull();
  });

  it('removes an archived pathway from the archived list', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([
      pipeline({ id: 'biz-arch', name: 'Old Merch Pathway', status: 'Archived' }),
    ]);
    fixture.detectChanges();

    const toggle = Array.from(nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Archived (1)')
    )!;
    toggle.click();
    fixture.detectChanges();

    dialogMock.confirm.mockResolvedValueOnce(true);
    const remove = Array.from(nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Remove'
    )!;
    remove.click();
    await fixture.whenStable();

    expect(bizMock.removePipeline).toHaveBeenCalledWith('biz-arch');
  });

  it('archives a completed pathway on request', async () => {
    await create(profile());
    bizMock.activePipelines.set([pipeline({ status: 'Completed' })]);
    fixture.detectChanges();

    await component.archivePipeline(bizMock.activePipelines()[0]);

    expect(bizMock.archivePipeline).toHaveBeenCalledWith('biz-1');
  });

  it('keeps archived pathways out of the grid but restorable', async () => {
    const nativeElement = await create(profile());
    bizMock.activePipelines.set([
      pipeline({ id: 'biz-open', name: 'Open Merch Pathway' }),
      pipeline({
        id: 'biz-arch',
        name: 'Old Merch Pathway',
        status: 'Archived',
      }),
    ]);
    fixture.detectChanges();

    expect(nativeElement.textContent).toContain('Open Merch Pathway');
    expect(nativeElement.textContent).not.toContain('Old Merch Pathway');
    expect(nativeElement.textContent).toContain('Archived (1)');

    const toggle = Array.from(nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Archived (1)')
    )!;
    toggle.click();
    fixture.detectChanges();
    expect(nativeElement.textContent).toContain('Old Merch Pathway');

    const restore = Array.from(nativeElement.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Restore'
    )!;
    restore.click();
    await fixture.whenStable();

    expect(bizMock.restorePipeline).toHaveBeenCalledWith('biz-arch');
  });
});
