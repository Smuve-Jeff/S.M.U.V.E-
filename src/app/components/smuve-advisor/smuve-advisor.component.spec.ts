import { TestBed, ComponentFixture } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { SmuveAdvisorComponent } from './smuve-advisor.component';
import { AiService } from '../../services/ai.service';
import { UserContextService } from '../../services/user-context.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import { Router } from '@angular/router';
import { AdvisorAdvice } from '../../types/ai.types';
import {
  ArtistLifecycleAlertService,
  LifecycleAlert,
} from '../../services/artist-lifecycle-alert.service';

describe('SmuveAdvisorComponent', () => {
  let fixture: ComponentFixture<SmuveAdvisorComponent>;
  let component: SmuveAdvisorComponent;
  let aiService: any;
  let commandPalette: any;
  let router: { navigate: jest.Mock; navigateByUrl: jest.Mock };
  let lifecycleAlerts: {
    alerts: WritableSignal<LifecycleAlert[]>;
    dismiss: jest.Mock;
  };

  const sampleAdvice: AdvisorAdvice[] = [
    {
      id: 'adv-1',
      title: 'Finish the current mix',
      description: 'Head to the booth and bounce the session.',
      priority: 'high',
      action: { type: 'command', payload: 'toggle-playback' },
    },
  ];

  const sampleTransition: LifecycleAlert = {
    id: 'lifecycle-alert-1',
    kind: 'blocked',
    severity: 'warning',
    phase: 'identity',
    title: 'Identity is now blocked',
    message:
      'Nothing in Identity can advance until "Lock the official artist name" is done.',
    evidence: ['Lock the official artist name'],
    actionRoute: '/artist-development',
    raisedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    aiService = {
      advisorAdvice: signal<AdvisorAdvice[]>(sampleAdvice),
    };
    commandPalette = {
      executeCommandById: jest.fn(() => true),
    };
    router = { navigate: jest.fn(), navigateByUrl: jest.fn() };
    lifecycleAlerts = { alerts: signal<LifecycleAlert[]>([]), dismiss: jest.fn() };

    TestBed.configureTestingModule({
      imports: [SmuveAdvisorComponent],
      providers: [
        { provide: AiService, useValue: aiService },
        {
          provide: UserContextService,
          useValue: { mainViewMode: signal('hub') },
        },
        { provide: Router, useValue: router },
        { provide: CommandPaletteService, useValue: commandPalette },
        { provide: ArtistLifecycleAlertService, useValue: lifecycleAlerts },
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

  it('shows lifecycle transitions with their evidence beside the advice', () => {
    lifecycleAlerts.alerts.set([sampleTransition]);
    component.isOpen.set(true);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent || '';
    expect(text).toContain('Changed since you opened');
    expect(text).toContain(sampleTransition.title);
    expect(text).toContain(sampleTransition.evidence[0]);
    // Standing advice is still there; the two are different claims.
    expect(text).toContain(sampleAdvice[0].title);
  });

  it('opens the surface that owns a transition and dismisses it', () => {
    lifecycleAlerts.alerts.set([sampleTransition]);
    component.isOpen.set(true);

    component.openTransition(sampleTransition);

    expect(lifecycleAlerts.dismiss).toHaveBeenCalledWith(sampleTransition.id);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/artist-development');
    expect(component.isOpen()).toBe(false);
  });

  it('dismissing a transition does not touch the advice queue', () => {
    lifecycleAlerts.alerts.set([sampleTransition]);

    component.dismissTransition(sampleTransition.id);

    expect(lifecycleAlerts.dismiss).toHaveBeenCalledWith(sampleTransition.id);
    expect(aiService.advisorAdvice().length).toBe(1);
  });

  it('provides trackById for the advice list', () => {
    expect(typeof component.trackById).toBe('function');
    expect(component.trackById(0, sampleAdvice[0])).toBe('adv-1');
  });
});