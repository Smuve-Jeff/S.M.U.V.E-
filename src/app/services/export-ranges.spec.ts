import {
  buildFilmManifest,
  planMasterRanges,
  planMusicVideoRanges,
} from './export-ranges';

describe('planMasterRanges', () => {
  it('walks a two-hour feature in 120-second sections', () => {
    const ranges = planMasterRanges(0, 7200);

    expect(ranges).toHaveLength(60);
    expect(ranges[0]).toEqual({ index: 0, start: 0, seconds: 120, end: 120 });
    expect(ranges[59]).toEqual({
      index: 59,
      start: 7080,
      seconds: 120,
      end: 7200,
    });
  });

  it('starts at an offset and carries the final short section', () => {
    const ranges = planMasterRanges(3600, 7200);

    expect(ranges).toHaveLength(30);
    expect(ranges[0]).toEqual({
      index: 0,
      start: 3600,
      seconds: 120,
      end: 3720,
    });
    expect(ranges[29]).toEqual({
      index: 29,
      start: 7080,
      seconds: 120,
      end: 7200,
    });
  });

  it('keeps a final section shorter than the requested window', () => {
    const ranges = planMasterRanges(0, 250, 120);

    expect(ranges).toEqual([
      { index: 0, start: 0, seconds: 120, end: 120 },
      { index: 1, start: 120, seconds: 120, end: 240 },
      { index: 2, start: 240, seconds: 10, end: 250 },
    ]);
  });

  it('does not plan a zero-length pass at the tail', () => {
    expect(planMasterRanges(7200, 7200)).toEqual([]);
    expect(planMasterRanges(9999, 7200)).toEqual([]);
    expect(planMasterRanges(0, 0)).toEqual([]);
  });

  it('clamps a negative or invalid start to the top of the timeline', () => {
    const ranges = planMasterRanges(-10, 300);

    expect(ranges[0]).toEqual({ index: 0, start: 0, seconds: 120, end: 120 });
    expect(planMasterRanges(Number.NaN, 300)[0].start).toBe(0);
  });
});

describe('planMusicVideoRanges', () => {
  it('cuts a song into whole bars at the session tempo', () => {
    // 120 BPM: one 4/4 bar is 2s, so 16 bars is a 32s section.
    const ranges = planMusicVideoRanges(0, 100, 120, 16);

    expect(ranges).toEqual([
      { index: 0, start: 0, seconds: 32, end: 32 },
      { index: 1, start: 32, seconds: 32, end: 64 },
      { index: 2, start: 64, seconds: 32, end: 96 },
      { index: 3, start: 96, seconds: 4, end: 100 },
    ]);
  });

  it('starts on the bar containing the requested offset', () => {
    // 128 BPM: one bar is 1.875s, so 10s floors to the bar at 9.375s.
    const ranges = planMusicVideoRanges(10, 40, 128, 4);

    expect(ranges[0].start).toBe(9.375);
    expect(ranges[0].seconds).toBe(7.5);
    expect(ranges[1].start).toBe(16.875);
  });

  it('caps a section at the recorder window instead of crossing it', () => {
    // 30 BPM: one bar is 8s; 16 bars would be 128s, so only 15 bars fit.
    const ranges = planMusicVideoRanges(0, 200, 30, 16, 120);

    expect(ranges[0].seconds).toBe(120);
    expect(ranges[1].start).toBe(120);
  });

  it('does not plan a pass from the tail or an empty song', () => {
    expect(planMusicVideoRanges(100, 100, 120)).toEqual([]);
    expect(planMusicVideoRanges(0, 0, 120)).toEqual([]);
  });
});

describe('buildFilmManifest', () => {
  it('records section timecodes, filenames, and statuses', () => {
    const manifest = JSON.parse(
      buildFilmManifest(
        {
          project: 'Feature Cut',
          productionMode: 'movie',
          presetId: 'movie-cinema-4k',
          presetName: 'CinemaScope 4K',
          width: 4096,
          height: 1716,
          fps: 30,
          codec: 'mp4',
          bitrate: 30_000_000,
          sectionSeconds: 120,
        },
        [
          {
            index: 0,
            start: 0,
            seconds: 120,
            end: 120,
            fileName: 'part-001.mp4',
            status: 'rendered',
          },
          {
            index: 1,
            start: 120,
            seconds: 30,
            end: 150,
            fileName: null,
            status: 'failed',
          },
        ],
        '2026-11-15T00:00:00.000Z'
      )
    );

    expect(manifest).toMatchObject({
      format: 'smuve-film-manifest/v1',
      generatedAt: '2026-11-15T00:00:00.000Z',
      project: 'Feature Cut',
      productionMode: 'movie',
      deliveryPreset: {
        id: 'movie-cinema-4k',
        name: 'CinemaScope 4K',
        width: 4096,
        height: 1716,
      },
      master: {
        width: 4096,
        height: 1716,
        fps: 30,
        codec: 'mp4',
        bitrate: 30_000_000,
      },
      sectionSeconds: 120,
    });
    expect(manifest.sections).toEqual([
      {
        index: 0,
        start: 0,
        end: 120,
        seconds: 120,
        fileName: 'part-001.mp4',
        status: 'rendered',
      },
      {
        index: 1,
        start: 120,
        end: 150,
        seconds: 30,
        fileName: null,
        status: 'failed',
      },
    ]);
  });

  it('carries the beat grid for a music-video delivery', () => {
    const manifest = JSON.parse(
      buildFilmManifest(
        {
          project: 'Neon Performance',
          productionMode: 'music',
          presetId: 'music-video-master',
          presetName: 'Music Video Master',
          width: 1920,
          height: 1080,
          fps: 30,
          codec: 'mp4',
          bitrate: 16_000_000,
          sectionSeconds: 32,
          music: {
            bpm: 120,
            beatSeconds: 0.5,
            barSeconds: 2,
            barsPerSection: 16,
          },
        },
        [
          {
            index: 0,
            start: 0,
            seconds: 32,
            end: 32,
            fileName: 'music_part-001.mp4',
            status: 'rendered',
          },
        ],
        '2026-11-15T00:00:00.000Z'
      )
    );

    expect(manifest.productionMode).toBe('music');
    expect(manifest.sectionSeconds).toBe(32);
    expect(manifest.music).toEqual({
      bpm: 120,
      beatSeconds: 0.5,
      barSeconds: 2,
      barsPerSection: 16,
    });
    expect(manifest.sections[0]).toMatchObject({
      barStart: 1,
      barEnd: 16,
      fileName: 'music_part-001.mp4',
    });
  });
});
