import { isTrackAudibleUnderSolo } from './mix-routing.util';

describe('isTrackAudibleUnderSolo', () => {
  const channel = (overrides: Record<string, unknown> = {}) => ({
    id: 'channel',
    type: 'midi',
    muted: false,
    soloed: false,
    soloSafe: false,
    ...overrides,
  });

  it('keeps an unmuted channel audible when nothing is soloed', () => {
    const track = channel();
    expect(isTrackAudibleUnderSolo(track, [track])).toBe(true);
  });

  it('keeps a muted channel silent even when it is solo-safe', () => {
    const track = channel({ muted: true, soloSafe: true });
    expect(isTrackAudibleUnderSolo(track, [track])).toBe(false);
  });

  it('opens members of a soloed group bus and closes unrelated channels', () => {
    const member = channel({ id: 'kick', busId: 'drum-bus' });
    const otherMember = channel({ id: 'snare', busId: 'drum-bus' });
    const outsider = channel({ id: 'bass' });
    const bus = channel({ id: 'drum-bus', type: 'bus', soloed: true });
    const tracks = [member, otherMember, outsider, bus];

    expect(isTrackAudibleUnderSolo(member, tracks)).toBe(true);
    expect(isTrackAudibleUnderSolo(otherMember, tracks)).toBe(true);
    expect(isTrackAudibleUnderSolo(outsider, tracks)).toBe(false);
    expect(isTrackAudibleUnderSolo(bus, tracks)).toBe(true);
  });

  it('opens a solo-safe bus under another channel solo', () => {
    const member = channel({ id: 'guide', busId: 'cue-bus' });
    const soloed = channel({ id: 'lead', soloed: true });
    const bus = channel({ id: 'cue-bus', type: 'bus', soloSafe: true });

    expect(isTrackAudibleUnderSolo(member, [member, soloed, bus])).toBe(true);
  });

  it('follows nested bus routing to a soloed ancestor', () => {
    const member = channel({ id: 'kick', busId: 'child-bus' });
    const child = channel({ id: 'child-bus', type: 'bus', busId: 'parent-bus' });
    const parent = channel({ id: 'parent-bus', type: 'bus', soloed: true });

    expect(isTrackAudibleUnderSolo(member, [member, child, parent])).toBe(true);
  });

  it('does not leak non-soloed members when one member is soloed', () => {
    const soloedMember = channel({ id: 'kick', busId: 'drum-bus', soloed: true });
    const sibling = channel({ id: 'snare', busId: 'drum-bus' });
    const bus = channel({ id: 'drum-bus', type: 'bus' });

    expect(isTrackAudibleUnderSolo(soloedMember, [soloedMember, sibling, bus])).toBe(true);
    expect(isTrackAudibleUnderSolo(sibling, [soloedMember, sibling, bus])).toBe(false);
  });
});
