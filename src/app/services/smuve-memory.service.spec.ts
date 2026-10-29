import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SmuveMemoryService } from './smuve-memory.service';
import { UserProfileService } from './user-profile.service';
import { UserStoreService, AuthUser } from './user-store.service';
import type { SmuveSurfaceId } from './smuve-career-director.service';

const OWNER = 'artist-a';
const KEY = `smuve.casefile.v1:${encodeURIComponent(OWNER)}`;

function configure(owner: string) {
  const user = signal<AuthUser | null>({
    id: owner,
    email: `${owner}@example.test`,
    artistName: 'Test Artist',
    role: 'artist',
    permissions: [],
    createdAt: new Date(),
    lastLogin: new Date(),
    profileCompleteness: 60,
    emailVerified: true,
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: UserStoreService, useValue: { user } },
      { provide: UserProfileService, useValue: { profile: () => ({ id: owner }) } },
    ],
  });
  const service = TestBed.inject(SmuveMemoryService);
  TestBed.flushEffects();
  return service;
}

describe('SmuveMemoryService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('files a verdict, the artist goal and the handed-over action from one turn', () => {
    const memory = configure(OWNER);

    memory.captureTurn(
      'mixing',
      'Mix Bus',
      'I want to finish the EP this month.',
      'That low end is a corpse. Cut 180Hz and sidechain the kick.'
    );

    expect(memory.latestVerdict('mixing')?.text).toBe('That low end is a corpse.');
    expect(memory.goals()[0]?.text).toContain('I want to finish the EP this month');
    expect(memory.openLoops().length).toBe(1);
    expect(memory.openLoops()[0].text).toContain('Cut 180Hz');

    const block = memory.promptBlock('mixing');
    expect(block).toContain('VERDICT IN THIS ROOM (Mix Bus)');
    expect(block).toContain('UNRESOLVED OPEN LOOPS');
    expect(block).toContain('CALLBACK RULE');
  });

  it('keeps one live verdict per room and leaves other rooms intact', () => {
    const memory = configure(OWNER);

    memory.captureTurn(
      'mixing',
      'Mix Bus',
      'Check my mix.',
      'The vocal is losing to the kick. Carve 2dB at 250Hz on the bass.'
    );
    memory.captureTurn(
      'legal',
      'Legal Desk',
      'Is my split sheet fine?',
      'Nothing here is signed. Get the split sheet executed before release.'
    );
    memory.captureTurn(
      'mixing',
      'Mix Bus',
      'I fixed it.',
      'It is better, which is not the same as good. Now check the mono fold.'
    );

    const verdicts = memory.verdicts();
    expect(verdicts.filter((entry) => entry.surface === 'mixing')).toHaveLength(1);
    expect(memory.latestVerdict('mixing')?.text).toContain('better');
    expect(memory.latestVerdict('legal')?.text).toContain('Nothing here is signed');
  });

  it('does not file an offline outage as a verdict', () => {
    const memory = configure(OWNER);

    memory.captureTurn(
      'chat',
      'Direct Console',
      'What next?',
      'Strategic Link Severed. Offline processing active.'
    );

    expect(memory.entries()).toHaveLength(0);
    expect(memory.promptBlock()).toBe('');
  });

  it('closes a loop on demand so the prompt stops chasing it', () => {
    const memory = configure(OWNER);

    memory.captureTurn(
      'release',
      'Release Bay',
      'How do I ship this?',
      'The metadata is incomplete. Register the work before you upload.'
    );
    const loop = memory.openLoops()[0];
    expect(loop).toBeTruthy();

    memory.resolve(loop.id);

    expect(memory.openLoops()).toHaveLength(0);
    expect(memory.latestVerdict('release')?.text).toContain('metadata');
    expect(memory.promptBlock('release')).not.toContain('UNRESOLVED OPEN LOOPS');
  });

  it('does not repeat an identical filing', () => {
    const memory = configure(OWNER);
    const turn: [SmuveSurfaceId, string, string, string] = [
      'chat',
      'Direct Console',
      'I need to grow my audience.',
      'Your hook arrives too late. Rewrite the first eight seconds.',
    ];

    memory.captureTurn(...turn);
    memory.captureTurn(...turn);

    expect(memory.goals()).toHaveLength(1);
    expect(memory.openLoops()).toHaveLength(1);
    expect(memory.verdicts()).toHaveLength(1);
  });

  it('survives a reload for the same artist and stays isolated per account', () => {
    const memory = configure(OWNER);
    memory.captureTurn(
      'mixing',
      'Mix Bus',
      'Rate my mix.',
      'Your low end is a rumour. High-pass the pads and re-check the kick.'
    );
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]').length).toBeGreaterThan(0);

    TestBed.resetTestingModule();
    const reloaded = configure(OWNER);
    expect(reloaded.latestVerdict('mixing')?.text).toContain('low end');

    TestBed.resetTestingModule();
    const otherArtist = configure('artist-b');
    expect(otherArtist.entries()).toHaveLength(0);
  });

  it('offers an in-character callback for the offline path', () => {
    const memory = configure(OWNER);
    memory.captureTurn(
      'mastering',
      'Mastering Suite',
      'Master this.',
      'Your dynamics are already a rumour. Pull the limiter back 1dB.'
    );

    expect(memory.callbackLine('mastering')).toContain('Last time you stood in Mastering Suite');
    expect(memory.callbackLine('chat')).toBeTruthy();
  });
});
