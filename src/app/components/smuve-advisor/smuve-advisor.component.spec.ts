import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SmuveAdvisorComponent } from './smuve-advisor.component';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import { Router } from '@angular/router';
import { AdvisorAdvice } from '../../types/ai.types';

describe('SmuveAdvisorComponent', () => {
  let fixture: ComponentFixture<SmuveAdvisorComponent>;
  let component: SmuveAdvisorComponent;
  let aiService: any;
  let commandPalette: any;

  const sampleAdvice: AdvisorAdvice[] = [
    {
      id: 'adv-1',
      title: 'Finish the current mix',
      description: 'Head to the booth and bounce the session.',
      priority: 'high',
      action: { type: 'command', payload: 'toggle-playback' },
    },
  ];

  beforeEach(() => {
    aiService = {
      advisorAdvice: signal<AdvisorAdvice[]>(sampleAdvice),
    };
    commandPalette = {
      executeCommandById: jest.fn(() => true),
    };

    TestBed.configureTestingModule({
      imports: [SmuveAdvisorComponent],
      providers: [
        { provide: AiService, useValue: aiService },
        {
          provide: UserContextService,
          useValue: { mainViewMode: signal('hub') },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: CommandPaletteService, useValue: commandPalette },
      ],
    });

    fixture = TestBed.createComponent(SmuveAdvisorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the empty state without crashing', () => {
    aiService.advisorAdvice.set([]);
    fixture.detectChanges();
    component.isOpen.set(true);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent || '';
    expect(text).toContain('No active advice.');
  });

  it('executes command-type advice through the command palette and removes it', () => {
    component.isOpen.set(true);
    fixture.detectChanges();

    component.executeAction(sampleAdvice[0]);

    expect(commandPalette.executeCommandById).toHaveBeenCalledWith(
      'toggle-playback'
    );
    expect(aiService.advisorAdvice().length).toBe(0);
  });

  it('dismiss removes only the target advice', () => {
    aiService.advisorAdvice.set([
      sampleAdvice[0],
      {
        id: 'adv-2',
        title: 'Tune identity',
        description: 'Polish your artist profile.',
        priority: 'medium',
      },
    ]);

    component.dismissAdvice(sampleAdvice[0]);

    const remaining = aiService.advisorAdvice();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('adv-2');
  });

  it('provides trackById for the advice list', () => {
    expect(typeof component.trackById).toBe('function');
    expect(component.trackById(0, sampleAdvice[0])).toBe('adv-1');
  });
});