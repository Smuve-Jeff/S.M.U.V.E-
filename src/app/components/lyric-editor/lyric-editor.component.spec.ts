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

  it('saves, restores and switches between multiple named pages', () => {
    const { component } = create();
    component.trackTitle.set('Chapter One');
    component.lyrics.set('page one');
    component.addPage();
    component.trackTitle.set('Chapter Two');
    component.lyrics.set('page two');

    component.saveLyrics();

    const again = create().component;
    expect(again.pageCount()).toBe(2);
    expect(again.trackTitle()).toBe('Chapter Two');
    expect(again.lyrics()).toBe('page two');

    again.selectPage('page-1');
    expect(again.trackTitle()).toBe('Chapter One');
    expect(again.lyrics()).toBe('page one');
  });

  it('auto-saves unsaved words when the pad unmounts', () => {
    const { fixture, component } = create();
    component.updatePageTitle('Draft');
    component.updatePageBody('unsaved line');

    fixture.destroy();

    const stored = JSON.parse(localStorage.getItem(draftKey) as string);
    expect(stored.lyrics).toBe('unsaved line');
    expect(stored.title).toBe('Draft');
  });

  it('keeps book-writing and publishing guidance in the pad', () => {
    const { fixture } = create();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('S.M.U.V.E. Book Lab');
    expect(text).toContain('Publishing is a business choice');
    expect(text).toContain('New Page');
  });

  it('labels its prompts as fixed starters, not generated lines', () => {
    const { fixture } = create();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Rhyme Starters');
    expect(text).toContain('Fixed writing prompts');
  });
});
