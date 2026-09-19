import { SmuveTvService, smuveTvClock } from './smuve-tv.service';

describe('SmuveTvService', () => {
  let service: SmuveTvService;

  beforeEach(() => {
    service = new SmuveTvService();
  });

  const at = (iso: string) => new Date(iso);

  it('ships a numbered line-up with a full schedule rotation on every station', () => {
    expect(service.channels.length).toBeGreaterThanOrEqual(12);

    for (const channel of service.channels) {
      expect(channel.number).toBeGreaterThanOrEqual(100);
      expect(channel.shows.length).toBeGreaterThanOrEqual(3);
      expect(channel.shows.every((show) => show.durationMin > 0)).toBe(true);
      expect(channel.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('never repeats a channel number or id, so channel entry is unambiguous', () => {
    const numbers = service.channels.map((channel) => channel.number);
    const ids = service.channels.map((channel) => channel.id);

    expect(new Set(numbers).size).toBe(numbers.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every non-empty category with whole stations', () => {
    for (const category of service.categories) {
      const stations = service.channelsIn(category.id);
      if (category.id === 'all') {
        expect(stations.length).toBe(service.channels.length);
      } else {
        expect(stations.length).toBeGreaterThan(0);
        expect(stations.every((s) => s.category === category.id)).toBe(true);
      }
      // Always in channel order, because the rail is a channel guide.
      expect([...stations].sort((a, b) => a.number - b.number)).toEqual(stations);
    }
  });

  describe('linear schedule', () => {
    const station = () => service.channels[0];

    it('is a pure function of the clock — two viewers see the same broadcast', () => {
      const moment = at('2026-09-19T21:04:30Z');

      const first = service.nowPlaying(station(), moment);
      const second = service.nowPlaying(station(), moment);

      expect(second).toEqual(first);
    });

    it('keeps progress inside the slot and reports it as on air', () => {
      const channel = station();
      const rotation = channel.shows.reduce((s, p) => s + p.durationMin, 0);

      for (let minute = 0; minute < rotation; minute += 7) {
        const moment = new Date(at('2026-09-19T00:00:00Z').getTime() + minute * 60000);
        const slot = service.nowPlaying(channel, moment);

        expect(slot.onAir).toBe(true);
        expect(slot.progress).toBeGreaterThanOrEqual(0);
        expect(slot.progress).toBeLessThan(1);
        expect(slot.endsAt - slot.startsAt).toBe(slot.program.durationMin * 60000);
        expect(slot.startsAt).toBeLessThanOrEqual(moment.getTime());
        expect(slot.endsAt).toBeGreaterThan(moment.getTime());
      }
    });

    it('hands off to the next programme exactly when the current one ends', () => {
      const channel = station();
      const first = service.nowPlaying(channel, at('2026-09-19T09:00:00Z'));
      const boundary = new Date(first.endsAt);

      const next = service.nowPlaying(channel, boundary);

      expect(next.startsAt).toBe(first.endsAt);
      expect(next.program.id).not.toBe(first.program.id);
      expect(next.progress).toBe(0);
    });

    it('loops forever without ever running out of programming', () => {
      const channel = station();
      const rotation = channel.shows.reduce((s, p) => s + p.durationMin, 0);
      const start = at('2026-09-19T00:00:00Z');

      const before = service.nowPlaying(channel, start);
      const after = service.nowPlaying(
        channel,
        new Date(start.getTime() + rotation * 60000)
      );

      expect(after.program.id).toBe(before.program.id);
    });

    it('offsets stations so the line-up is not in lockstep', () => {
      const moment = at('2026-09-19T12:00:00Z');
      const titles = service.channels.map(
        (channel) => service.nowPlaying(channel, moment).program.title
      );

      expect(new Set(titles).size).toBeGreaterThan(1);
    });

    it('builds a contiguous guide that opens on air', () => {
      const channel = service.channels[5];
      const moment = at('2026-09-19T18:30:00Z');

      const guide = service.guideFor(channel, moment, 6);

      expect(guide).toHaveLength(6);
      expect(guide[0].onAir).toBe(true);
      expect(guide[0].progress).toBeGreaterThanOrEqual(0);
      for (let i = 1; i < guide.length; i += 1) {
        expect(guide[i].startsAt).toBe(guide[i - 1].endsAt);
        expect(guide[i].onAir).toBe(false);
        expect(guide[i].progress).toBe(0);
      }
    });

    it('always returns at least one slot, whatever it is asked for', () => {
      expect(service.guideFor(station(), at('2026-09-19T18:30:00Z'), 0)).toHaveLength(1);
    });
  });

  describe('channel lookup and search', () => {
    it('tunes by channel number, from a number or a typed string', () => {
      const target = service.channels[3];

      expect(service.channelByNumber(target.number)?.id).toBe(target.id);
      expect(service.channelByNumber(String(target.number))?.id).toBe(target.id);
      expect(service.channelByNumber(` ${target.number} `)?.id).toBe(target.id);
    });

    it('refuses numbers that are not on the line-up', () => {
      expect(service.channelByNumber(999)).toBeNull();
      expect(service.channelByNumber('not a channel')).toBeNull();
      expect(service.channelByNumber('')).toBeNull();
    });

    it('matches name, call sign, tagline, and programme titles', () => {
      const channel = service.channels.find((c) => c.number === 104)!;

      expect(service.search('midnight')).toContainEqual(channel);
      expect(service.search('MV')).toContainEqual(channel);
      expect(service.search('crate dig')).toContainEqual(channel);
    });

    it('returns the whole line-up for a blank query and nothing for a miss', () => {
      expect(service.search('   ')).toHaveLength(service.channels.length);
      expect(service.search('zzzz-no-such-station')).toEqual([]);
    });
  });

  it('formats station time as a 24-hour clock', () => {
    expect(smuveTvClock(new Date(2026, 8, 19, 4, 5).getTime())).toBe('04:05');
    expect(smuveTvClock(new Date(2026, 8, 19, 23, 59).getTime())).toBe('23:59');
    expect(smuveTvClock(new Date(2026, 8, 19, 0, 0).getTime())).toBe('00:00');
  });
});
