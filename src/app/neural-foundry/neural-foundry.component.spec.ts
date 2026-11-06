import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { NeuralFoundryComponent } from './neural-foundry.component';
import { AiService, UpgradeRecommendation } from '../services/ai.service';
import { UIService } from '../services/ui.service';

describe('NeuralFoundryComponent', () => {
  let component: NeuralFoundryComponent;
  let fixture: ComponentFixture<NeuralFoundryComponent>;
  let upgrades: WritableSignal<UpgradeRecommendation[]>;
  const uiService = { navigateToView: jest.fn() };

  const recommendation = (
    overrides: Partial<UpgradeRecommendation> = {}
  ): UpgradeRecommendation => ({
    id: 'upg-ovr-mastering',
    title: 'Mastering chain review',
    type: 'Software',
    description: 'Open Mastering and check the chain yourself.',
    cost: 'Included',
    url: '',
    impact: 'High',
    rationale: 'A master is only as good as the checks the artist makes.',
    targetArea: 'Production',
    priority: 'High',
    prerequisites: [],
    actionLabel: 'Open Mastering',
    toolId: 'mastering',
    state: 'suggested',
    ...overrides,
  });

  beforeEach(async () => {
    upgrades = signal([recommendation()]);

    await TestBed.configureTestingModule({
      imports: [NeuralFoundryComponent],
      providers: [
        { provide: AiService, useValue: { availableUpgrades: upgrades } },
        { provide: UIService, useValue: uiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NeuralFoundryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => jest.clearAllMocks());

  function pageText(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(
      /\s+/g,
      ' '
    );
  }

  it('presents included tools without prices, outcome metrics, or unlock claims', () => {
    const text = pageText();

    expect(text).toContain('INCLUDED WORKSPACE TOOLS');
    expect(text).toContain('Nothing is purchased or gated');
    expect(text).not.toContain('Metric');
    expect(text).not.toContain('ETH');
    expect(text).not.toContain('UNLOCK');
  });

  it('opens the workspace tool named on the card', () => {
    const button = fixture.nativeElement.querySelector(
      'button.tool-button'
    ) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    button.click();

    expect(uiService.navigateToView).toHaveBeenCalledWith('mastering');
  });

  it('shows the stored recommendation state instead of a local unlock', () => {
    upgrades.set([recommendation({ state: 'completed' })]);
    fixture.detectChanges();

    const text = pageText();
    expect(text).toContain('Completed');
    expect(text).toContain('Open Mastering');
    expect(text).not.toContain('UNLOCKED');
  });

  it('hides recommendations the artist dismissed or marked not relevant', () => {
    upgrades.set([
      recommendation({ id: 'upg-dismissed', state: 'dismissed' }),
      recommendation({ id: 'upg-not-relevant', state: 'not-relevant' }),
      recommendation(),
    ]);
    fixture.detectChanges();

    expect(component.filteredUpgrades().map((item) => item.id)).toEqual([
      'upg-ovr-mastering',
    ]);
  });
});
