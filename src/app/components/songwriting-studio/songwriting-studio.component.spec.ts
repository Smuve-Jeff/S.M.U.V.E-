import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SongwritingStudioComponent } from './songwriting-studio.component';

@Component({ standalone: true, template: `<p>pad stub</p>` })
class PadStubComponent {}

@Component({ standalone: true, template: `<p>cowrite stub</p>` })
class CowriteStubComponent {}

describe('SongwritingStudioComponent', () => {
  let fixture: ComponentFixture<SongwritingStudioComponent>;
  let router: Router;

  const text = () =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  const activeTab = () =>
    (
      fixture.nativeElement as HTMLElement
    ).querySelector('.songwriting-tab.is-active .tab-label')?.textContent ??
    '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SongwritingStudioComponent],
      providers: [
        provideRouter([
          {
            path: '',
            component: SongwritingStudioComponent,
            children: [
              { path: 'pad', component: PadStubComponent },
              { path: 'cowrite', component: CowriteStubComponent },
              { path: '', redirectTo: 'pad', pathMatch: 'full' },
            ],
          },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SongwritingStudioComponent);
  });

  it('defaults to the Writer\u2019s Pad tab', async () => {
    await router.navigate(['/']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('pad stub');
    expect(activeTab()).toContain("Writer's Pad");
  });

  it('switches to the Co-Write tab without leaving the studio', async () => {
    await router.navigate(['/cowrite']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('cowrite stub');
    expect(activeTab()).toContain('Co-Write');
    expect(text()).toContain("Writer's Pad");
  });
});
