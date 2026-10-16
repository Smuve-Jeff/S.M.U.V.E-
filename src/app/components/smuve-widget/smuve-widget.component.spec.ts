import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SmuveWidgetComponent } from './smuve-widget.component';

describe('SmuveWidgetComponent', () => {
  let fixture: ComponentFixture<SmuveWidgetComponent>;
  let component: SmuveWidgetComponent;
  let glyph: () => SVGElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SmuveWidgetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SmuveWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    glyph = () => fixture.nativeElement.querySelector('svg');
  });

  it('renders the brand mark idle by default', () => {
    expect(glyph().getAttribute('data-voice-state')).toBe('idle');
    expect(glyph().getAttribute('aria-label')).toBe('S.M.U.V.E brand mark');
    expect(glyph().classList.contains('is-speaking')).toBe(false);
    expect(glyph().classList.contains('is-listening')).toBe(false);
  });

  it('shows that S.M.U.V.E. is speaking', () => {
    fixture.componentRef.setInput('speaking', true);
    fixture.detectChanges();

    expect(glyph().getAttribute('data-voice-state')).toBe('speaking');
    expect(glyph().classList.contains('is-speaking')).toBe(true);
    expect(glyph().getAttribute('aria-label')).toContain('speaking');
  });

  it('shows that the artist is dictating, which outranks speaking', () => {
    fixture.componentRef.setInput('speaking', true);
    fixture.componentRef.setInput('listening', true);
    fixture.detectChanges();

    expect(component.voiceState).toBe('listening');
    expect(glyph().getAttribute('data-voice-state')).toBe('listening');
    expect(glyph().classList.contains('is-listening')).toBe(true);
    expect(glyph().classList.contains('is-speaking')).toBe(false);
    expect(glyph().getAttribute('aria-label')).toContain('listening');
  });
});
