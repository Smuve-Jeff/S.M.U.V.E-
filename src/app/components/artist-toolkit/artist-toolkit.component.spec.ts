import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ArtistToolkitComponent } from './artist-toolkit.component';
import { UIService } from '../../services/ui.service';

describe('ArtistToolkitComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ArtistToolkitComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => (key === 'tab' ? 'rights' : null),
              },
            },
          },
        },
        {
          provide: UIService,
          useValue: { setActiveViewFromRoute: jest.fn() },
        },
      ],
    }).compileComponents();
  });

  it('opens the tab named by the Hub deep link', () => {
    const fixture = TestBed.createComponent(ArtistToolkitComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.activeTab()).toBe('rights');
  });
});
