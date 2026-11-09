import {
  ArtistToolkitService,
  addDaysToIso,
  buildReleaseMilestones,
  buildSplitSheetText,
  estimateRoyalties,
  royaltyPayouts,
  splitTotal,
  validateSplitContributors,
} from './artist-toolkit.service';
import { RIGHTS_TASKS, TOOLKIT_GUIDES } from './artist-toolkit.data';
import { SplitContributor } from '../types/artist-toolkit.types';

const contributor = (
  id: string,
  name: string,
  share: number
): SplitContributor => ({
  id,
  name,
  role: 'Songwriter',
  email: '',
  publisher: '',
  ipi: '',
  share,
});

describe('artist toolkit calculations', () => {
  it('builds a dated runway back from release day', () => {
    const milestones = buildReleaseMilestones('2026-03-01', 'EP');
    expect(milestones.length).toBe(9);
    expect(milestones[0].dueDate).toBe('2026-01-04');
    expect(milestones.find((entry) => entry.id === 'release-day')?.dueDate).toBe(
      '2026-03-01'
    );
    expect(milestones.find((entry) => entry.id === 'month-one')?.dueDate).toBe(
      '2026-03-31'
    );
    expect(milestones[0].done).toBe(false);
  });

  it('returns no runway for an invalid day and adds days across month edges', () => {
    expect(buildReleaseMilestones('2026-02-31', 'Single')).toEqual([]);
    expect(addDaysToIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToIso('2026-03-01', -56)).toBe('2026-01-04');
    expect(addDaysToIso('not-a-day', 5)).toBe('');
  });

  it('validates shares, missing names and duplicates', () => {
    expect(splitTotal([contributor('a', 'A', 60), contributor('b', 'B', 40)])).toBe(
      100
    );
    expect(validateSplitContributors([])).toHaveLength(1);
    expect(validateSplitContributors([contributor('a', 'A', 60)])[0]).toContain(
      '60%'
    );
    const missing = validateSplitContributors([contributor('a', '', 100)]);
    expect(missing.some((warning) => warning.includes('legal name'))).toBe(true);
    const duplicate = validateSplitContributors([
      contributor('a', 'Same Name', 50),
      contributor('b', 'same name', 50),
    ]);
    expect(duplicate.some((warning) => warning.includes('appears 2 times'))).toBe(
      true
    );
    expect(
      validateSplitContributors([
        contributor('a', 'A', 100),
        contributor('b', 'B', 0),
      ]).some((warning) => warning.includes('no share'))
    ).toBe(true);
  });

  it('writes a sheet that shows every share and the total', () => {
    const text = buildSplitSheetText({
      title: 'Test Track',
      iswc: '',
      contributors: [contributor('a', 'Ada Writer', 70), contributor('b', 'Bo Producer', 30)],
    });
    expect(text).toContain('SPLIT SHEET — Test Track');
    expect(text).toContain('Ada Writer — Songwriter · 70%');
    expect(text).toContain('TOTAL WRITER SHARE: 100%');
    expect(text).toContain('not legal advice');
  });

  it('estimates gross, fee and net and clamps hostile input', () => {
    const estimate = estimateRoyalties({
      distributorFeePercent: 15,
      lines: [
        { id: 'a', platform: 'Spotify', streams: 10000, ratePerStream: 0.0035 },
        { id: 'b', platform: 'Apple', streams: -5, ratePerStream: 0.01 },
      ],
    });
    expect(estimate.totalStreams).toBe(10000);
    expect(estimate.gross).toBe(35);
    expect(estimate.distributorFee).toBe(5.25);
    expect(estimate.net).toBe(29.75);
    expect(
      estimateRoyalties({
        distributorFeePercent: 500,
        lines: [{ id: 'a', platform: 'x', streams: 0, ratePerStream: 0 }],
      }).distributorFee
    ).toBe(0);
  });

  it('splits the net across named contributors only', () => {
    const payouts = royaltyPayouts(
      [contributor('a', 'Ada', 70), contributor('b', '', 30)],
      10
    );
    expect(payouts).toHaveLength(2);
    expect(payouts[0]).toMatchObject({ name: 'Ada', amount: 7 });
    expect(payouts[1]).toMatchObject({ name: 'Unnamed contributor', amount: 3 });
  });

  it('keeps rights task ids unique with official https links', () => {
    const ids = RIGHTS_TASKS.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const task of RIGHTS_TASKS) {
      for (const link of task.links ?? []) {
        expect(link.url.startsWith('https://')).toBe(true);
      }
    }
    expect(TOOLKIT_GUIDES.length).toBeGreaterThan(4);
  });
});

describe('artist toolkit persistence', () => {
  beforeEach(() => localStorage.clear());

  it('survives a reload and restores checked work', () => {
    const service = new ArtistToolkitService();
    service.setReleaseMeta({ title: 'Persistence Test' });
    service.toggleMilestone('lock-master');
    service.addContributor();
    service.setSplitField('title', 'Persistence Test');
    service.toggleRightsTask('pro-join');

    const reloaded = new ArtistToolkitService();
    expect(reloaded.blueprint().title).toBe('Persistence Test');
    expect(
      reloaded.blueprint().milestones.find((entry) => entry.id === 'lock-master')
        ?.done
    ).toBe(true);
    expect(reloaded.splitSheet().contributors).toHaveLength(2);
    expect(reloaded.isRightsTaskDone('pro-join')).toBe(true);
  });

  it('ignores a corrupted record and reports it instead of crashing', () => {
    localStorage.setItem('smuve_artist_toolkit_v1', '{not json');
    const service = new ArtistToolkitService();
    expect(service.blueprint().milestones.length).toBeGreaterThan(0);
    expect(service.persistenceError()).toContain('could not be read');
  });

  it('fills an empty loaded split sheet with one contributor', () => {
    localStorage.setItem(
      'smuve_artist_toolkit_v1',
      JSON.stringify({
        splitSheet: { title: 'Empty', iswc: '', contributors: [] },
      })
    );
    const service = new ArtistToolkitService();
    expect(service.splitSheet().contributors).toHaveLength(1);
  });
});
