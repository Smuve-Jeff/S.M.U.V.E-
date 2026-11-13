import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';

import { CowriteStudioComponent } from './cowrite-studio.component';
import { CoWriteService } from '../../services/cowrite.service';
import { SongwritingAssistantService } from '../../services/songwriting-assistant.service';
import { SmuveStyleMimicService } from '../../services/smuve-style-mimic.service';
import { AiService } from '../../services/ai.service';
import { SnackbarService } from '../../services/snackbar.service';
import { SongwritingHandoffService } from '../../services/songwriting-handoff.service';

/**
 * The Co-Write room is one half of the Songwriting Studio bridge: it can open
 * with a page handed over from the Writer's Pad, and it can hand its compiled
 * lyrics back. Both directions are covered here because a handoff that silently
 * drops the words is worse than no handoff at all.
 */
describe('CowriteStudioComponent', () => {
  let fixture: ComponentFixture<CowriteStudioComponent>;
  let component: CowriteStudioComponent;
  let cowrite: {
    currentSession: ReturnType<typeof signal<null>>;
    isThinking: ReturnType<typeof signal<boolean>>;
    loadProjects: jest.Mock;
    startSession: jest.Mock;
    addUserContribution: jest.Mock;
    generateSmuveContribution: jest.Mock;
    getSuggestion: jest.Mock;
    getCompiledLyrics: jest.Mock;
  };
  let snackbar: { info: jest.Mock; success: jest.Mock; error: jest.Mock };

  const create = async (seed?: {
    title: string;
    body: string;
  }): Promise<void> => {
    cowrite = {
      currentSession: signal(null),
      isThinking: signal(false),
      loadProjects: jest.fn(),
      startSession: jest.fn(),
      addUserContribution: jest.fn(),
      generateSmuveContribution: jest.fn().mockResolvedValue(undefined),
      getSuggestion: jest.fn().mockReturnValue({
        type: 'line',
        content: 'a suggestion',
        context: 'start',
      }),
      getCompiledLyrics: jest.fn().mockReturnValue(''),
      smuveContributionCount: () => 1,
      userContributionCount: () => 1,
    };
    snackbar = {
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CowriteStudioComponent],
      providers: [
        provideRouter([]),
        SongwritingHandoffService,
        { provide: CoWriteService, useValue: cowrite },
        { provide: SongwritingAssistantService, useValue: {} },
        {
          provide: SmuveStyleMimicService,
          useValue: { getAvailableArtists: () => [] },
        },
        { provide: AiService, useValue: {} },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    // Seed after configuration: injecting before configureTestingModule would
    // instantiate the TestBed and the configure call below would throw.
    if (seed) {
      TestBed.inject(SongwritingHandoffService).handOff({
        ...seed,
        from: 'pad',
        to: 'cowrite',
      });
    }

    fixture = TestBed.createComponent(CowriteStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('renders a contribution as a turn card with its Accept control', async () => {
    await create();
    cowrite.currentSession.set({
      id: 's1',
      title: 'Midnight Drive — Co-Write Session',
      topic: 'Midnight Drive',
      style: 'Pop',
      mood: 'emotional',
      genre: 'Pop',
      artist: null,
      artists: [],
      key: 'Am',
      bpm: 110,
      turns: [
        {
          id: 't1',
          role: 'user',
          sectionType: 'verse',
          text: 'streetlights blur and the radio hums',
          timestamp: Date.now(),
          accepted: false,
          rejected: false,
          lines: [],
        },
      ],
      completedSections: [],
      currentSection: 'verse',
      sectionOrder: ['verse', 'chorus'],
      sectionIndex: 0,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      isActive: true,
      isComplete: false,
    } as never);
    component.showLyrics.set(true);
    fixture.detectChanges();

    const card: HTMLElement = fixture.nativeElement.querySelector(
      '.custom-scrollbar > div'
    );
    expect(card.textContent).toContain('streetlights blur and the radio hums');
    expect(card.textContent).toContain('You');
    expect(
      Array.from(card.querySelectorAll('button')).map((b) =>
        b.textContent?.trim()
      )
    ).toEqual(['Accept', 'Reject']);
  });

  it('starts from a page handed over by the Writer’s Pad', async () => {
    await create({ title: 'Hook Idea', body: 'first line from the pad' });

    expect(component.setupConfig().topic).toBe('Hook Idea');
    expect(component.seededBody()).toBe('first line from the pad');
    expect(component.seedNotice()).toContain('Hook Idea');
    // The draft is consumed, not left lying around for the next visit.
    expect(TestBed.inject(SongwritingHandoffService).pendingFor('cowrite')).toBeNull();
  });

  it('opens with an untouched setup form when nothing was handed over', async () => {
    await create();

    expect(component.setupConfig().topic).toBe('');
    expect(component.seededBody()).toBe('');
    expect(component.seedNotice()).toBe('');
  });

  it('sends the handed-over words in as the artist’s first turn', async () => {
    await create({ title: 'Hook Idea', body: 'first line from the pad' });

    component.startSession();

    expect(cowrite.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Hook Idea' })
    );
    expect(cowrite.addUserContribution).toHaveBeenCalledWith(
      'first line from the pad'
    );
    // Only the first session consumes the seed.
    expect(component.seededBody()).toBe('');
  });

  it('hands the compiled lyrics back to the Writer’s Pad', async () => {
    await create();
    cowrite.getCompiledLyrics.mockReturnValue('compiled words');
    const navigate = jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    component.sendLyricsToPad();

    expect(
      TestBed.inject(SongwritingHandoffService).pendingFor('pad')
    ).toEqual({
      title: 'Co-Write session',
      body: 'compiled words',
      from: 'cowrite',
      to: 'pad',
    });
    expect(navigate).toHaveBeenCalledWith(['/songwriting', 'pad']);
  });

  it('says so instead of navigating when there is nothing to hand over', async () => {
    await create();
    cowrite.getCompiledLyrics.mockReturnValue('   ');
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate');

    component.sendLyricsToPad();

    expect(TestBed.inject(SongwritingHandoffService).pendingFor('pad')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(snackbar.info).toHaveBeenCalled();
  });
});
