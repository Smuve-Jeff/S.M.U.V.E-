import { TestBed } from '@angular/core/testing';
import { LyricEditorComponent } from './lyric-editor.component';
import { ReleasePipelineService } from '../../services/release-pipeline.service';

describe('LyricEditorComponent', () => {
  const draftKey = 'smuve_lyric_draft';

  const create = () => {
    const fixture = TestBed.createComponent(LyricEditorComponent);
    return { fixture, component: fixture.componentInstance };
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LyricEditorComponent],
      providers: [{ provide: ReleasePipelineService, useValue: {} }],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('saves the draft in this browser', () => {
    const { component } = create();
    component.lyrics.set('first line');
    component.trackTitle.set('Demo');

    component.saveLyrics();

    const stored = JSON.parse(localStorage.getItem(draftKey) as string);
    expect(stored.lyrics).toBe('first line');
    expect(stored.title).toBe('Demo');
    expect(component.savedAt()).toBeGreaterThan(0);
  });

  it('restores a saved draft when the editor opens again', () => {
    const { component } = create();
    component.lyrics.set('restored line');
    component.saveLyrics();

    const again = create().component;

    expect(again.lyrics()).toBe('restored line');
    expect(again.savedAt()).toBeGreaterThan(0);
  });

  it('labels its prompts as fixed starters, not generated lines', () => {
    const { fixture } = create();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Rhyme Starters');
    expect(text).toContain('Fixed writing prompts');
  });
});
