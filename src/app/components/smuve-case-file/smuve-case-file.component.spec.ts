import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SmuveCaseFileComponent } from './smuve-case-file.component';
import {
  SmuveMemoryEntry,
  SmuveMemoryService,
} from '../../services/smuve-memory.service';
import { SmuveCareerDirectorService } from '../../services/smuve-career-director.service';
import { UIService } from '../../services/ui.service';
import { UserProfileService } from '../../services/user-profile.service';

const now = Date.now();

const sampleEntries: SmuveMemoryEntry[] = [
  {
    id: 'v1',
    kind: 'verdict',
    text: 'That low end is a corpse.',
    surface: 'mixing',
    surfaceLabel: 'Mix Bus',
    at: now - 60_000,
  },
  {
    id: 'o1',
    kind: 'open-loop',
    text: 'Cut 180Hz and sidechain the kick.',
    surface: 'mixing',
    surfaceLabel: 'Mix Bus',
    at: now - 50_000,
  },
  {
    id: 'o2',
    kind: 'open-loop',
    text: 'Register the work before you upload.',
    surface: 'release',
    surfaceLabel: 'Release Bay',
    at: now - 40_000,
    resolvedAt: now - 30_000,
  },
  {
    id: 'g1',
    kind: 'goal',
    text: 'I want to finish the EP this month.',
    surface: 'chat',
    surfaceLabel: 'Direct Console',
    at: now - 20_000,
  },
  {
    id: 'd1',
    kind: 'decision',
    text: "I'll mix the record myself.",
    surface: 'studio',
    surfaceLabel: 'Studio Floor',
    at: now - 10_000,
  },
];

describe('SmuveCaseFileComponent', () => {
  let fixture: ComponentFixture<SmuveCaseFileComponent>;
  let component: SmuveCaseFileComponent;
  let entries: WritableSignal<SmuveMemoryEntry[]>;
  let memory: {
    entries: WritableSignal<SmuveMemoryEntry[]>;
    openLoops: Signal<SmuveMemoryEntry[]>;
    verdicts: Signal<SmuveMemoryEntry[]>;
    goals: Signal<SmuveMemoryEntry[]>;
    decisions: Signal<SmuveMemoryEntry[]>;
    resolve: jest.Mock;
    forget: jest.Mock;
    clear: jest.Mock;
  };
  let director: {
    surfaceIntel: jest.Mock;
    announce: jest.Mock;
    homeRouteFor: jest.Mock;
  };
  let ui: { openChatbot: jest.Mock };
  let router: { navigateByUrl: jest.Mock };

  beforeEach(() => {
    entries = signal<SmuveMemoryEntry[]>([...sampleEntries]);
    memory = {
      entries,
      openLoops: computed(() =>
        entries().filter(
          (entry) => entry.kind === 'open-loop' && entry.resolvedAt == null
        )
      ),
      verdicts: computed(() => entries().filter((e) => e.kind === 'verdict')),
      goals: computed(() => entries().filter((e) => e.kind === 'goal')),
      decisions: computed(() => entries().filter((e) => e.kind === 'decision')),
      resolve: jest.fn((id: string) => {
        entries.update((list) =>
          list.map((entry) =>
            entry.id === id ? { ...entry, resolvedAt: Date.now() } : entry
          )
        );
      }),
      forget: jest.fn((id: string) => {
        entries.update((list) => list.filter((entry) => entry.id !== id));
      }),
      clear: jest.fn(() => entries.set([])),
    };
    director = {
      surfaceIntel: jest.fn(() => ({
        surface: 'case-file',
        surfaceLabel: 'Case File',
        genre: 'Hip Hop / Rap',
        stage: 'building',
        stageLabel: 'Building',
        line: 'I remember every verdict I gave you.',
        archetype: 'Androgynous Oracle',
        currency: 'closed loops and receipts',
      })),
      announce: jest.fn(() => ({
        surface: 'case-file',
        surfaceLabel: 'Case File',
        genre: null,
        stage: 'building',
        line: 'A file is not nostalgia. It is evidence.',
        archetype: 'Baritone Authority (Male)',
        stageLabel: 'Building',
      })),
      homeRouteFor: jest.fn((surface: string) =>
        surface === 'mixing' ? '/mixer' : '/hub'
      ),
    };
    ui = { openChatbot: jest.fn() };
    router = { navigateByUrl: jest.fn() };

    TestBed.configureTestingModule({
      imports: [SmuveCaseFileComponent],
      providers: [
        { provide: SmuveMemoryService, useValue: memory },
        { provide: SmuveCareerDirectorService, useValue: director },
        { provide: UIService, useValue: ui },
        { provide: Router, useValue: router },
        {
          provide: UserProfileService,
          useValue: {
            profile: () => ({
              settings: { ai: { commanderPersona: 'S.M.U.V.E. Prime' } },
            }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(SmuveCaseFileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('reports the record and renders every entry kind', () => {
    const text = fixture.nativeElement.textContent || '';
    expect(text).toContain('CASE');
    expect(text).toContain('That low end is a corpse.');
    expect(text).toContain('Cut 180Hz');
    expect(text).toContain('Closed loop');
    expect(text).toContain('Goal');
    expect(text).toContain('Commitment');
    expect(component.counts().open).toBe(1);
    expect(component.counts().all).toBe(5);
  });

  it('groups the record by room with a memory summary and last activity', () => {
    const groups = component.roomGroups();

    // Newest room activity first.
    expect(groups.map((group) => group.surface)).toEqual([
      'studio',
      'chat',
      'release',
      'mixing',
    ]);

    const mixing = groups.find((group) => group.surface === 'mixing');
    expect(mixing?.entries).toHaveLength(2);
    expect(mixing?.label).toBe('Mix Bus');
    expect(mixing?.route).toBe('/mixer');
    expect(mixing?.summary).toContain(
      'My last verdict: “That low end is a corpse.”'
    );
    expect(mixing?.summary).toContain('One loop still open');

    const release = groups.find((group) => group.surface === 'release');
    expect(release?.summary).toContain('Every loop I filed here is closed.');

    const studio = groups.find((group) => group.surface === 'studio');
    expect(studio?.summary).toContain(
      'You committed: “I\'ll mix the record myself.”'
    );

    const chat = groups.find((group) => group.surface === 'chat');
    expect(chat?.summary).toContain('No verdict filed here yet.');
    expect(chat?.summary).toContain(
      'Your goal: “I want to finish the EP this month.”'
    );

    expect(fixture.nativeElement.textContent).toContain('Last activity');
  });

  it('keeps the room summary accurate while a filter hides its rows', () => {
    component.setFilter('open');
    const groups = component.roomGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].surface).toBe('mixing');
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(['o1']);
    // The summary still describes the whole room, not just the filtered row.
    expect(groups[0].openLoops).toHaveLength(1);
  });

  it('closes an open loop and keeps it out of the open view', () => {
    component.setFilter('open');
    fixture.detectChanges();
    expect(component.visibleEntries().map((entry) => entry.id)).toEqual(['o1']);

    component.resolve(sampleEntries[1]);
    fixture.detectChanges();

    expect(memory.resolve).toHaveBeenCalledWith('o1');
    expect(component.visibleEntries()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain(
      'Nothing matches that filter.'
    );
  });

  it('deletes a mis-filed entry through the service', () => {
    component.forget(sampleEntries[0]);

    expect(memory.forget).toHaveBeenCalledWith('v1');
    expect(component.counts().verdict).toBe(0);
  });

  it('filters by kind and searches the record', () => {
    component.setFilter('goal');
    fixture.detectChanges();
    expect(component.visibleEntries().map((entry) => entry.id)).toEqual(['g1']);

    component.setFilter('all');
    component.query.set('release bay');
    fixture.detectChanges();
    expect(component.visibleEntries().map((entry) => entry.id)).toEqual(['o2']);
  });

  it('requires a second press before clearing the whole file', () => {
    component.clearAll();
    fixture.detectChanges();
    expect(memory.clear).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Confirm clear');

    component.clearAll();
    fixture.detectChanges();
    expect(memory.clear).toHaveBeenCalledTimes(1);
    expect(component.hasEntries()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Nothing on record yet.');
  });

  it('speaks the file in a room voice and shows what was said', () => {
    component.hearIt();
    fixture.detectChanges();

    expect(director.announce).toHaveBeenCalledWith('case-file');
    expect(fixture.nativeElement.textContent).toContain(
      'A file is not nostalgia. It is evidence.'
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Baritone Authority (Male)'
    );
  });

  it('jumps back to the room that produced the entry', () => {
    component.openSource(sampleEntries[1]);

    expect(director.homeRouteFor).toHaveBeenCalledWith('mixing');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/mixer');
  });

  it('opens the console from the empty state', () => {
    entries.set([]);
    fixture.detectChanges();
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ).find((element) =>
      (element as HTMLButtonElement).textContent?.includes('Open S.M.U.V.E.')
    ) as HTMLButtonElement | undefined;

    button?.click();

    expect(ui.openChatbot).toHaveBeenCalledTimes(1);
  });
});
