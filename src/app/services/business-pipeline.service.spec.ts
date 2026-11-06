import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BusinessPipelineService,
  pipelineProgress,
} from './business-pipeline.service';
import { LoggingService } from './logging.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import type { UserProfile } from '../types/profile.types';
import type { BusinessPipeline } from '../types/business.types';

describe('BusinessPipelineService', () => {
  let service: BusinessPipelineService;
  let profileSignal: WritableSignal<UserProfile>;
  let updateProfile: jest.Mock;

  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(
      JSON.stringify({ ...initialProfile, ...overrides })
    ) as UserProfile;

  const completedPipeline: BusinessPipeline = {
    id: 'biz-old',
    type: 'PRO',
    name: 'Old PRO pathway',
    status: 'Completed',
    currentStageIndex: 1,
    stages: [
      { id: 'old-1', name: 'Affiliation', status: 'Completed', steps: [] },
      { id: 'old-2', name: 'Data Sync', status: 'Completed', steps: [] },
    ],
    createdAt: 1,
    updatedAt: 1,
  };

  const load = (value: UserProfile) => {
    profileSignal = signal(value);
    updateProfile = jest.fn().mockImplementation(async (next: UserProfile) => {
      profileSignal.set(next);
    });
    TestBed.configureTestingModule({
      providers: [
        BusinessPipelineService,
        {
          provide: UserProfileService,
          useValue: { profile: profileSignal, updateProfile },
        },
        {
          provide: LoggingService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    });
    service = TestBed.inject(BusinessPipelineService);
  };

  it('keeps a single open pipeline per module instead of stacking copies', async () => {
    load(profile());

    const first = await service.initializeModule(
      'Merch',
      'Official Merch Pathway'
    );
    const second = await service.initializeModule(
      'Merch',
      'Official Merch Pathway'
    );

    expect(second).toBe(first);
    expect(service.activePipelines()).toHaveLength(1);
    expect(updateProfile).toHaveBeenCalledTimes(1);
  });

  it('still allows a different module to be started', async () => {
    load(profile());

    await service.initializeModule('Merch', 'Official Merch Pathway');
    await service.initializeModule('Website', 'Official Website Pathway');

    expect(service.activePipelines().map((pipeline) => pipeline.type)).toEqual([
      'Merch',
      'Website',
    ]);
  });

  it('starts a new pipeline once the previous one is completed', async () => {
    load(profile({ businessPipelines: [completedPipeline] } as any));

    const id = await service.initializeModule('PRO', 'Official PRO Pathway');

    expect(id).not.toBe(completedPipeline.id);
    expect(service.activePipelines().map((pipeline) => pipeline.status)).toEqual(
      ['Completed', 'Active']
    );
  });

  it('measures progress from completed stages, not the open stage', async () => {
    load(profile());
    const id = await service.initializeModule(
      'Merch',
      'Official Merch Pathway'
    );
    const current = () =>
      service.activePipelines().find((pipeline) => pipeline.id === id)!;

    // Stage one is open, but nothing is done yet.
    expect(current().currentStageIndex).toBe(0);
    expect(pipelineProgress(current())).toBe(0);

    await service.updateStep(id, 'stg-1', 'step-1', 'Completed');
    await service.updateStep(id, 'stg-1', 'step-2', 'Completed');

    expect(current().currentStageIndex).toBe(1);
    expect(pipelineProgress(current())).toBe(33);

    await service.updateStep(id, 'stg-2', 'step-3', 'Completed');
    expect(pipelineProgress(current())).toBe(67);

    await service.updateStep(id, 'stg-3', 'step-4', 'Completed');
    expect(current().status).toBe('Completed');
    expect(pipelineProgress(current())).toBe(100);
  });

  it('has no progress to report for a pipeline without stages', () => {
    expect(pipelineProgress({ ...completedPipeline, stages: [] })).toBe(0);
  });

  it('removes a completed pipeline from the profile', async () => {
    load(profile({ businessPipelines: [completedPipeline] } as any));
    expect(service.activePipelines()).toHaveLength(1);

    const removed = await service.removePipeline(completedPipeline.id);

    expect(removed).toBe(true);
    expect(service.activePipelines()).toEqual([]);
    expect((profileSignal() as any).businessPipelines).toEqual([]);
  });

  it('refuses to remove a pipeline that is still open', async () => {
    load(profile());
    const id = await service.initializeModule(
      'Merch',
      'Official Merch Pathway'
    );

    const removed = await service.removePipeline(id);

    expect(removed).toBe(false);
    expect(service.activePipelines().map((pipeline) => pipeline.id)).toEqual([
      id,
    ]);
    expect(updateProfile).toHaveBeenCalledTimes(1);
  });

  it('archives a completed pipeline without losing it, and restores it', async () => {
    load(profile({ businessPipelines: [completedPipeline] } as any));

    expect(await service.archivePipeline(completedPipeline.id)).toBe(true);
    expect(service.activePipelines()[0].status).toBe('Archived');
    expect((profileSignal() as any).businessPipelines[0].status).toBe(
      'Archived'
    );

    expect(await service.restorePipeline(completedPipeline.id)).toBe(true);
    expect(service.activePipelines()[0].status).toBe('Completed');
  });

  it('refuses to archive a pipeline that is still open', async () => {
    load(profile());
    const id = await service.initializeModule(
      'Merch',
      'Official Merch Pathway'
    );

    expect(await service.archivePipeline(id)).toBe(false);
    expect(service.activePipelines()[0].status).toBe('Active');
  });

  it('starts a fresh pipeline when the previous one is archived', async () => {
    load(
      profile({
        businessPipelines: [{ ...completedPipeline, status: 'Archived' }],
      } as any)
    );

    const id = await service.initializeModule('PRO', 'Official PRO Pathway');

    expect(id).not.toBe(completedPipeline.id);
    expect(service.activePipelines().map((pipeline) => pipeline.status)).toEqual(
      ['Archived', 'Active']
    );
  });
});
