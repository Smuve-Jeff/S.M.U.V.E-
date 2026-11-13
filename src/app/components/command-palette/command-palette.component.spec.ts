import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CommandPaletteComponent } from './command-palette.component';
import { CommandPaletteService } from '../../services/command-palette.service';
import { GLOBAL_KEYBOARD_SHORTCUTS } from '../../services/global-keyboard-shortcuts';

describe('CommandPaletteComponent keyboard reference', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;

  beforeEach(async () => {
    const palette = {
      isOpen: signal(true),
      showGuide: signal(true),
      query: signal(''),
      activeIndex: signal(0),
      keyboardShortcuts: GLOBAL_KEYBOARD_SHORTCUTS,
      activeTips: () => [],
      filteredActions: () => [],
      updateQuery: jest.fn(),
      setActiveIndex: jest.fn(),
      runAction: jest.fn(),
      toggleGuide: jest.fn(),
      closePalette: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
      providers: [{ provide: CommandPaletteService, useValue: palette }],
    }).compileComponents();

    fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('renders the shared keyboard reference in guide mode', () => {
    const items = fixture.nativeElement.querySelectorAll(
      '.palette-keyboard-item'
    );
    const text = fixture.nativeElement.textContent as string;

    expect(items.length).toBe(GLOBAL_KEYBOARD_SHORTCUTS.length);
    expect(text).toContain('Global keyboard shortcuts');
    expect(text).toContain('Alt + L');
    expect(text).toContain('Teach this screen');
    expect(text).toContain('Close overlay');
  });
});
