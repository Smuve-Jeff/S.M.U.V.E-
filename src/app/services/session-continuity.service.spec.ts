import { SessionContinuityService } from './session-continuity.service';

const KEY = 'smuve.session.continuity.v1';

describe('SessionContinuityService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('records where the artist is and survives a reload', () => {
    const service = new SessionContinuityService();
    service.record('project', 'proj-1', 'Night Bus');
    service.record('route', '/studio', 'Studio');

    expect(service.latest('project')?.label).toBe('Night Bus');
    expect(service.latest('route')?.id).toBe('/studio');

    const reloaded = new SessionContinuityService();
    expect(reloaded.latest('project')?.id).toBe('proj-1');
    expect(reloaded.readable).toBe(true);
  });

  it('ignores a repeat of the same position', () => {
    const service = new SessionContinuityService();
    service.record('project', 'proj-1', 'Night Bus');
    const first = service.latest('project')!.at;
    service.record('project', 'proj-1', 'Night Bus');

    expect(service.latest('project')!.at).toBe(first);
  });

  it('keeps a corrupt index instead of overwriting it', () => {
    localStorage.setItem(KEY, '{not json');
    const service = new SessionContinuityService();
    expect(service.readable).toBe(false);

    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    service.record('project', 'proj-1', 'Night Bus');
    expect(setItem).not.toHaveBeenCalledWith(KEY, expect.any(String));
    expect(localStorage.getItem(KEY)).toBe('{not json');
    // The session still knows where it is.
    expect(service.latest('project')?.id).toBe('proj-1');
  });

  it('drops entries that are not this index shape', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ project: { kind: 'project', id: 3, at: 1 } })
    );

    const service = new SessionContinuityService();
    expect(service.latest('project')).toBeNull();
  });
});
