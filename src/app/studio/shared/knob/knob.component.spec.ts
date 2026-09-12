import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KnobComponent } from './knob.component';
import { HapticService } from '../../../services/haptic.service';

/**
 * The knob is the most-reused control in the Studio (mixer, drum machine,
 * sampler, synth, mastering). These specs pin the behaviours that were
 * previously either missing or broken:
 *
 *  - Pointer Events with the legacy mouse/touch fallback never double-counting
 *    a single gesture (Chrome fires pointerdown AND mousedown for a mouse, so
 *    one tap used to reset the value through the double-tap path).
 *  - Keyboard operability, required once the control advertises role="slider".
 *  - The double-tap timeout dying with the component.
 *  - The fine-mode / at-limit feedback classes that the stylesheet styled but
 *    the template never applied.
 */
describe('KnobComponent', () => {
  let fixture: ComponentFixture<KnobComponent>;
  let component: KnobComponent;
  let originalPointerEvent: unknown;

  const haptic = {
    light: jest.fn(),
    medium: jest.fn(),
    heavy: jest.fn(),
    preset: jest.fn(),
    selection: jest.fn(),
  };

  /** Minimal PointerEvent stand-in so the pointer path is testable in jsdom. */
  class FakePointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }

  const build = (inputs: Partial<KnobComponent> = {}) => {
    fixture = TestBed.createComponent(KnobComponent);
    component = fixture.componentInstance;
    Object.assign(component, {
      min: 0,
      max: 100,
      step: 1,
      value: 50,
      defaultValue: 50,
      label: 'Cutoff',
      ...inputs,
    });
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    originalPointerEvent = (globalThis as { PointerEvent?: unknown })
      .PointerEvent;
    (globalThis as { PointerEvent?: unknown }).PointerEvent =
      FakePointerEvent as unknown;
    await TestBed.configureTestingModule({
      imports: [KnobComponent],
      providers: [{ provide: HapticService, useValue: haptic }],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    (globalThis as { PointerEvent?: unknown }).PointerEvent =
      originalPointerEvent as never;
  });

  it('creates and exposes the value as an ARIA slider', () => {
    const host = build().nativeElement.querySelector('.knob-wrapper');
    expect(host.getAttribute('role')).toBe('slider');
    expect(host.getAttribute('aria-label')).toBe('Cutoff');
    expect(host.getAttribute('aria-valuemin')).toBe('0');
    expect(host.getAttribute('aria-valuemax')).toBe('100');
    expect(host.getAttribute('aria-valuenow')).toBe('50');
    expect(host.getAttribute('tabindex')).toBe('0');
  });

  it('emits on arrow keys and respects the step', () => {
    const emitted: number[] = [];
    build().componentInstance.valueChange.subscribe((v) => emitted.push(v));

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(emitted).toEqual([51]);
    expect(component.value).toBe(51);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(emitted).toEqual([51, 50]);
  });

  it('multiplies the step by ten while Shift is held', () => {
    build();
    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true })
    );
    expect(component.value).toBe(60);
  });

  it('jumps to the limits with Home and End', () => {
    build();
    component.onKeydown(new KeyboardEvent('keydown', { key: 'End' }));
    expect(component.value).toBe(100);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(component.value).toBe(0);
  });

  it('restores the default on Escape', () => {
    build({ value: 12 });
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.value).toBe(50);
  });

  it('clamps keyboard input at the range limits', () => {
    build({ value: 99 });
    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true })
    );
    expect(component.value).toBe(100);

    component.onKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true })
    );
    expect(component.value).toBe(90);
  });

  it('ignores an unknown key', () => {
    build({ value: 42 });
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(component.value).toBe(42);
  });

  it('counts one mouse gesture once, so a single tap never self-resets', () => {
    build({ value: 10 });

    // Chrome order for a physical click: pointerdown, then mousedown.
    component.startDrag(
      new FakePointerEvent('pointerdown', { clientY: 100, pointerId: 7 })
    );
    component.startDrag(new MouseEvent('mousedown', { clientY: 100 }));

    expect(component.value).toBe(10);
    expect(haptic.medium).not.toHaveBeenCalled();
  });

  it('still resets on a genuine double tap', () => {
    build({ value: 10 });
    component.startDrag(new MouseEvent('mousedown', { clientY: 100 }));
    component.startDrag(new MouseEvent('mousedown', { clientY: 100 }));
    expect(component.value).toBe(50);
    expect(haptic.medium).toHaveBeenCalled();
  });

  it('tracks a touch drag and marks two fingers as fine mode', () => {
    build({ value: 0 });
    component.startDrag({ touches: [{ clientY: 200 }] } as unknown as TouchEvent);
    component.onDrag({ touches: [{ clientY: 100 }] } as unknown as TouchEvent);
    expect(component.value).toBeGreaterThan(0);

    component.stopDrag();
    component.startDrag({
      touches: [{ clientY: 10 }, { clientY: 40 }],
    } as unknown as TouchEvent);
    expect(component.isFineMode()).toBe(true);
    component.stopDrag();
    expect(component.isFineMode()).toBe(false);
  });

  it('applies the fine-mode and at-limit feedback classes', () => {
    build();

    component.isFineMode.set(true);
    fixture.detectChanges();
    let host = fixture.nativeElement.querySelector('.knob-wrapper');
    expect(host.classList.contains('fine-mode')).toBe(true);

    component.isFineMode.set(false);
    component.isAtLimit.set(true);
    fixture.detectChanges();
    host = fixture.nativeElement.querySelector('.knob-wrapper');
    expect(host.classList.contains('at-limit')).toBe(true);
  });

  it('clears the double-tap timer on destroy', () => {
    build();
    component.startDrag(new MouseEvent('mousedown', { clientY: 10 }));
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    fixture.destroy();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
