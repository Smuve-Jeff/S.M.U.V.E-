import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  LegalDocumentEditorComponent,
  type LegalDocument,
} from './legal-document-editor.component';

describe('LegalDocumentEditorComponent', () => {
  let fixture: ComponentFixture<LegalDocumentEditorComponent>;
  let component: LegalDocumentEditorComponent;

  const mount = async (document?: LegalDocument) => {
    await TestBed.configureTestingModule({
      imports: [LegalDocumentEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LegalDocumentEditorComponent);
    component = fixture.componentInstance;
    component.document = document;
    fixture.detectChanges();
    return component;
  };

  it('opens a typed-but-empty draft with its clause pack already loaded', async () => {
    await mount({
      id: 'doc_1',
      title: 'Split Sheet',
      content: '',
      type: 'Split Sheet',
    });

    // The clause pack is what makes the surface usable — an empty body would
    // hand the artist a blank page instead of a draft to edit.
    expect(component.content).toContain('DIGITAL SPLIT SHEET');
    expect(component.content).toContain('PARTIES & OWNERSHIP');
    // The caller's title still wins over the template's placeholder.
    expect(component.title).toBe('Split Sheet');
  });

  it('loads the work-for-hire clause pack on demand', async () => {
    await mount();

    component.loadTemplate('Work-for-Hire');

    expect(component.title).toBe(
      'Work-for-Hire Agreement - Session Musician'
    );
    expect(component.content).toContain('WORK-FOR-HIRE AGREEMENT');
  });

  it('mints an id when saving a brand-new draft', async () => {
    await mount();
    const saved: LegalDocument[] = [];
    component.save.subscribe((doc) => saved.push(doc));

    component.title = 'Roster Contract';
    component.content = 'CLAUSE ONE';
    component.saveDocument();

    expect(saved).toHaveLength(1);
    expect(saved[0].id).toMatch(/^doc_/);
    expect(saved[0].title).toBe('Roster Contract');
    expect(saved[0].content).toBe('CLAUSE ONE');
  });

  it('preserves the id when saving an existing draft', async () => {
    await mount({ id: 'doc_existing', title: 'Old', content: 'BODY' });
    const saved: LegalDocument[] = [];
    component.save.subscribe((doc) => saved.push(doc));

    component.saveDocument();

    expect(saved[0].id).toBe('doc_existing');
  });

  it('emits cancel without emitting save', async () => {
    await mount({ id: 'doc_cancel', title: 'Draft', content: 'BODY' });
    const save = jest.fn();
    const cancel = jest.fn();
    component.save.subscribe(save);
    component.cancel.subscribe(cancel);

    component.cancel.emit();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
