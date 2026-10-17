import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ProjectService } from './project.service';
import { LocalStorageService } from './local-storage.service';
import { SessionHistoryService } from './session-history.service';
import { LoggingService } from './logging.service';

const release = { id: 'release-1', name: 'Release', bpm: 120, tracks: [], tasks: [], status: 'Draft' };
const bundle = { id: 'project_session-1', metadata: { id: 'session-1', name: 'Studio Session', bpm: 128 }, tracks: [], audioAssets: [{ id: 'audio-1' }], mixState: { volume: 0.7 } };

describe('ProjectService persistence', () => {
  let service: ProjectService;
  let records: any[];
  let storage: { getAllItems: jest.Mock; saveItem: jest.Mock; deleteItems: jest.Mock; persistenceStatus: jest.Mock };

  beforeEach(async () => {
    records = [release, bundle, { ...bundle, id: 'autosave_session-1' }, { ...bundle, id: 'recovery_session-1' },
      { id: 'legacy', title: 'Legacy Project', data: { bpm: 100, tracks: [] } }, { id: 'invalid' }, null];
    storage = {
      getAllItems: jest.fn(async () => records),
      saveItem: jest.fn(async (_store, record) => {
        records = [...records.filter((item) => item?.id !== record.id), record];
      }),
      deleteItems: jest.fn(async (_store, ids) => { records = records.filter((item) => !ids.includes(item?.id)); }),
      persistenceStatus: jest.fn().mockResolvedValue('ready'),
    };
    TestBed.configureTestingModule({ providers: [
      ProjectService,
      { provide: LocalStorageService, useValue: storage },
      { provide: SessionHistoryService, useValue: { autoRecord: jest.fn().mockResolvedValue(undefined) } },
      { provide: LoggingService, useValue: { error: jest.fn(), warn: jest.fn() } },
    ] });
    service = TestBed.inject(ProjectService);
    await service.refresh();
  });

  it('normalizes release rows, Studio bundles and API envelopes without exposing version records', async () => {
    const projects = await firstValueFrom(service.list$);
    expect(projects.map((project) => project.name)).toEqual(['Release', 'Studio Session', 'Legacy Project']);
    expect(projects.every((project) => Array.isArray(project.tasks) && Array.isArray(project.masterChain))).toBe(true);
    expect(projects[1].bpm).toBe(128);
    expect(records.find((item) => item?.id === bundle.id)).toEqual(bundle);
  });

  it('deletes exactly the chosen bundle and its versions, clears selection and survives refresh', async () => {
    const deleted: string[] = [];
    service.projectDeleted$.subscribe((id) => deleted.push(id));
    service.select(bundle.id);
    expect(service.currentProject()?.name).toBe('Studio Session');
    await expect(service.remove(bundle.id)).resolves.toBe(true);
    expect(storage.deleteItems).toHaveBeenCalledWith('projects', [bundle.id, 'autosave_session-1', 'recovery_session-1']);
    expect(service.currentProject()).toBeNull();
    expect(deleted).toEqual(['session-1']);
    await service.refresh();
    expect((await firstValueFrom(service.list$)).map((project) => project.id)).toEqual(['release-1', 'legacy']);
  });

  it('does not remove other projects or detach selection when deletion fails', async () => {
    service.select(bundle.id);
    storage.deleteItems.mockRejectedValueOnce(new Error('Disk failure'));
    await expect(service.remove(bundle.id)).rejects.toThrow('Disk failure');
    expect(service.currentProject()?.id).toBe(bundle.id);
    expect((await firstValueFrom(service.list$))).toHaveLength(3);
  });

  it('reports unavailable storage instead of claiming successful deletion', async () => {
    storage.persistenceStatus.mockResolvedValue('blocked');
    await expect(service.remove('release-1')).rejects.toThrow('storage is blocked');
    expect(storage.deleteItems).not.toHaveBeenCalled();
  });

  it('preserves bundle assets and metadata when updating the release projection', async () => {
    const project = (await firstValueFrom(service.list$)).find((item) => item.id === bundle.id)!;
    await service.update({ ...project, name: 'Renamed Session' });
    expect(storage.saveItem).toHaveBeenCalledTimes(1);
    expect(storage.saveItem).toHaveBeenCalledWith('projects', expect.objectContaining({
      id: bundle.id, audioAssets: bundle.audioAssets, mixState: bundle.mixState,
      metadata: expect.objectContaining({ id: 'session-1', name: 'Renamed Session' }),
    }));
  });

  it('rejects invalid imports and failed saves without inserting phantom list entries', async () => {
    await expect(service.add({ id: 'invalid' } as any)).rejects.toThrow('valid id and name');
    storage.saveItem.mockRejectedValueOnce(new Error('Disk full'));
    await expect(service.add({ ...release, id: 'new-id' } as any)).rejects.toThrow('Disk full');
    expect((await firstValueFrom(service.list$))).toHaveLength(3);
  });
});
