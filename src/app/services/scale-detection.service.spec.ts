import { ScaleDetectionService, scaleIntervals, KEY_NAMES } from './scale-detection.service';

describe('ScaleDetectionService', () => {
  let service: ScaleDetectionService;

  beforeEach(() => {
    service = new ScaleDetectionService();
  });

  it('returns null when there are no notes', () => {
    expect(service.detectKeyAndScale([])).toBeNull();
    expect(service.detectKeyAndScale(null as any)).toBeNull();
  });

  it('detects a C major melody', () => {
    // C major with a weighted tonic (C ×2) — tonic weighting pins the key.
    const notes = [
      { midi: 60, length: 2 }, // C (tonic, doubled)
      { midi: 62, length: 1 }, // D
      { midi: 64, length: 1 }, // E
      { midi: 65, length: 1 }, // F
      { midi: 67, length: 1 }, // G
      { midi: 69, length: 1 }, // A
      { midi: 71, length: 1 }, // B
    ];
    const result = service.detectKeyAndScale(notes);
    expect(result).not.toBeNull();
    expect(result!.key).toBe('C');
    expect(result!.scale).toBe('major');
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('detects A minor (relative minor of C)', () => {
    // Full A natural-minor collection with weighted tonic A.
    const notes = [
      { midi: 57, length: 2 }, // A (tonic, doubled)
      { midi: 59, length: 1 }, // B
      { midi: 60, length: 1 }, // C
      { midi: 62, length: 1 }, // D
      { midi: 64, length: 1 }, // E
      { midi: 65, length: 1 }, // F
      { midi: 67, length: 1 }, // G
    ];
    const result = service.detectKeyAndScale(notes);
    expect(result).not.toBeNull();
    expect(result!.key).toBe('A');
    expect(result!.scale).toBe('minor');
  });

  it('detects pentatonic subsets and reports the pentatonic scale', () => {
    // F# major pentatonic (F# G# A# C# D#) with doubled tonic F#.
    const notes = [
      { midi: 66, length: 2 }, // F#
      { midi: 68, length: 1 }, // G#
      { midi: 70, length: 1 }, // A#
      { midi: 73, length: 1 }, // C#
      { midi: 75, length: 1 }, // D#
      { midi: 78, length: 2 }, // F# (octave, tonic doubled)
    ];
    const result = service.detectKeyAndScale(notes);
    expect(result).not.toBeNull();
    expect(result!.key).toBe('F#');
    expect(result!.scale).toBe('pentatonic');
  });

  it('detects blues phrases as blues, not minor', () => {
    // A blues (A C D Eb E G) with heavily weighted tonic A.
    const notes = [
      { midi: 57, length: 4 }, // A (tonic)
      { midi: 60, length: 1 }, // C
      { midi: 62, length: 1 }, // D
      { midi: 63, length: 1 }, // Eb
      { midi: 64, length: 1 }, // E
      { midi: 67, length: 2 }, // G
    ];
    const result = service.detectKeyAndScale(notes);
    expect(result).not.toBeNull();
    expect(result!.key).toBe('A');
    expect(result!.scale).toBe('blues');
  });

  it('weights longer notes more heavily (sustained tonic wins)', () => {
    // One held A + brief C D E F — sparse phrase, tonic weight decides.
    const notes = [
      { midi: 57, length: 8 }, // A held
      { midi: 60, length: 1 }, // C
      { midi: 62, length: 1 }, // D
      { midi: 64, length: 1 }, // E
      { midi: 65, length: 1 }, // F
    ];
    const result = service.detectKeyAndScale(notes);
    expect(result).not.toBeNull();
    expect(result!.key).toBe('A');
    expect(result!.scale).toBe('minor');
  });

  it('isInScale respects the transposed key', () => {
    // C is in C major but NOT in E major
    expect(service.isInScale(60, 'C', 'major')).toBe(true);
    expect(service.isInScale(60, 'E', 'major')).toBe(false);
    // E is in E major
    expect(service.isInScale(64, 'E', 'major')).toBe(true);
    // D in C major, F# not in C major
    expect(service.isInScale(62, 'C', 'major')).toBe(true);
    expect(service.isInScale(66, 'C', 'major')).toBe(false);
  });

  it('isInScale understands blues and pentatonic sets', () => {
    // C pentatonic: C D E G A — E is in, F is not
    expect(service.isInScale(64, 'C', 'pentatonic')).toBe(true);
    expect(service.isInScale(65, 'C', 'pentatonic')).toBe(false);
    // C blues: C Eb F Gb G Bb
    expect(service.isInScale(63, 'C', 'blues')).toBe(true);
    expect(service.isInScale(62, 'C', 'blues')).toBe(false);
  });

  it('exposes scale intervals and key names helpers', () => {
    expect(scaleIntervals('major')).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scaleIntervals('minor')).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(scaleIntervals('blues')).toEqual([0, 3, 5, 6, 7, 10]);
    expect(scaleIntervals('pentatonic')).toEqual([0, 2, 4, 7, 9]);
    expect(scaleIntervals('chromatic')).toHaveLength(12);
    expect(KEY_NAMES).toHaveLength(12);
    expect(KEY_NAMES[0]).toBe('C');
  });

  it('highlights every key when the chromatic scale is selected', () => {
    expect(service.isInScale(60, 'C', 'chromatic')).toBe(true);
    expect(service.isInScale(61, 'C', 'chromatic')).toBe(true);
    expect(service.isInScale(66, 'C', 'chromatic')).toBe(true);
    expect(service.isInScale(63, 'F', 'chromatic')).toBe(true);
  });

  it('clamps confidence into 0..1', () => {
    const result = service.detectKeyAndScale([{ midi: 60, length: 1 }]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });
});
