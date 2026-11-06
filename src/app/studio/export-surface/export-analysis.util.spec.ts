import {
  DELIVERY_TARGETS,
  compareToDeliveryTarget,
  describeExportAnalysis,
} from './export-analysis.util';

describe('describeExportAnalysis', () => {
  const clean = {
    peakDb: -1.4,
    truePeakDb: -1.2,
    lufs: -11.5,
    lra: 7.8,
    correlation: 0.62,
  };

  it('passes a healthy master without warnings', () => {
    expect(describeExportAnalysis(clean).warnings).toEqual([]);
  });

  it('calls out a silent render instead of a headroom list', () => {
    const result = describeExportAnalysis({
      ...clean,
      peakDb: -80,
      truePeakDb: -80,
      lufs: -70,
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('effectively silent');
  });

  it('warns about clipping, excessive loudness and negative phase together', () => {
    const result = describeExportAnalysis({
      ...clean,
      peakDb: 0.2,
      truePeakDb: 0.4,
      lufs: -7,
      correlation: -0.3,
    });

    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.join(' ')).toContain('0.4 dBTP');
    expect(result.warnings.join(' ')).toContain('-7 LUFS');
    expect(result.warnings.join(' ')).toContain('-0.3');
  });

  it('warns when the master is quiet against streaming releases', () => {
    const result = describeExportAnalysis({ ...clean, lufs: -22 });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('-22 LUFS');
  });

  it('accepts the standard -1 dBTP ceiling exactly', () => {
    expect(
      describeExportAnalysis({ ...clean, truePeakDb: -1 }).warnings,
    ).toEqual([]);
  });
});

describe('compareToDeliveryTarget', () => {
  const streaming = DELIVERY_TARGETS.find((t) => t.id === 'spotify')!;
  const cd = DELIVERY_TARGETS.find((t) => t.id === 'cd')!;
  const healthy = {
    peakDb: -1.8,
    truePeakDb: -1.4,
    lufs: -14.2,
    lra: 6.4,
    correlation: 0.3,
  };

  it('passes a streaming master inside the tolerance and ceiling', () => {
    const result = compareToDeliveryTarget(healthy, streaming);

    expect(result.allPass).toBe(true);
    expect(result.checks.map((check) => check.pass)).toEqual([true, true, true]);
    expect(result.checks[0].target).toBe('-14 ±1 LUFS');
    expect(result.checks[1].target).toBe('≤ -1 dBTP');
  });

  it('flags loudness outside the tolerance and keeps other checks honest', () => {
    const result = compareToDeliveryTarget({ ...healthy, lufs: -11.5 }, streaming);

    expect(result.allPass).toBe(false);
    expect(result.checks[0]).toMatchObject({ id: 'loudness', pass: false });
    expect(result.checks[1].pass).toBe(true);
  });

  it('flags an over-ceiling peak and negative mono phase', () => {
    const result = compareToDeliveryTarget(
      { ...healthy, truePeakDb: -0.8, correlation: -0.1 },
      streaming,
    );

    expect(result.allPass).toBe(false);
    expect(result.checks[1].pass).toBe(false);
    expect(result.checks[2].pass).toBe(false);
  });

  it('treats the tolerance edge and exact ceiling as passing', () => {
    const result = compareToDeliveryTarget(
      { ...healthy, lufs: -13, truePeakDb: -1, correlation: 0 },
      streaming,
    );

    expect(result.allPass).toBe(true);
  });

  it('uses the CD ceiling and level', () => {
    const result = compareToDeliveryTarget(
      { ...healthy, lufs: -9.4, truePeakDb: 0.2 },
      cd,
    );

    expect(result.checks[0].pass).toBe(true);
    expect(result.checks[1]).toMatchObject({ target: '≤ -0.1 dBTP', pass: false });
  });
});
