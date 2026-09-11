import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WaveformRendererComponent } from './waveform-renderer.component';

const CANVAS_RECT = {
  left: 0,
  top: 0,
  right: 800,
  bottom: 160,
  width: 800,
  height: 160,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

describe('WaveformRendererComponent', () => {
  let component: WaveformRendererComponent;
  let fixture: ComponentFixture<WaveformRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WaveformRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WaveformRendererComponent);
    component = fixture.componentInstance;
    component.audioData = new Float32Array([0, 0.5, -0.5, 0.3, -0.2]);
    component.duration = 2;
    component.loopStart = 0.2;
    component.loopEnd = 0.8;
    component.loopInteractive = true;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits loop handle updates when dragged', () => {
    const startSpy = jest.spyOn(component.loopStartChange, 'emit');
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 160,
      width: 800,
      height: 160,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 160, clientY: 10 }));
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 10 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 10 }));

    expect(startSpy).toHaveBeenCalled();
  });

  it('ignores a mouse press that is only near the handle (fine pointer)', () => {
    const startSpy = jest.spyOn(component.loopStartChange, 'emit');
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(CANVAS_RECT);

    // 15px off the start handle: outside the 10px mouse slop.
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 175, clientY: 10 }));
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 220, clientY: 10 }));

    expect(startSpy).not.toHaveBeenCalled();
  });

  it('does not make a display-only waveform claim the touch gesture', () => {
    const plain = TestBed.createComponent(WaveformRendererComponent);
    plain.componentInstance.loopInteractive = false;
    plain.detectChanges();

    expect(plain.nativeElement.classList.contains('wr-interactive')).toBe(false);
  });
});

describe('WaveformRendererComponent (touch)', () => {
  class PointerEventStub extends MouseEvent {
    public readonly pointerType: string;
    public readonly pointerId: number;

    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init as MouseEventInit);
      this.pointerType = (init['pointerType'] as string) ?? 'mouse';
      this.pointerId = (init['pointerId'] as number) ?? 1;
    }
  }

  let component: WaveformRendererComponent;
  let fixture: ComponentFixture<WaveformRendererComponent>;
  let canvas: HTMLCanvasElement;
  let originalPointerEvent: PropertyDescriptor | undefined;

  /** Pointer Events are what Chrome Android dispatches for a finger; jsdom has
   *  no PointerEvent, so the component falls back to mouse-only there. */
  const pointerEvent = (
    type: string,
    init: Record<string, unknown>,
  ): Event => new PointerEventStub(type, init);

  beforeEach(async () => {
    originalPointerEvent = Object.getOwnPropertyDescriptor(
      window,
      'PointerEvent',
    );
    Object.defineProperty(window, 'PointerEvent', {
      value: PointerEventStub,
      configurable: true,
      writable: true,
    });

    await TestBed.configureTestingModule({
      imports: [WaveformRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WaveformRendererComponent);
    component = fixture.componentInstance;
    component.audioData = new Float32Array([0, 0.5, -0.5, 0.3, -0.2]);
    component.duration = 2;
    component.loopStart = 0.2;
    component.loopEnd = 0.8;
    component.loopInteractive = true;
    fixture.detectChanges();

    canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    // 400 CSS px wide for an 800px backing store: the handles have to be
    // resolved in CSS space or a phone-width container loses them entirely.
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      ...CANVAS_RECT,
      right: 400,
      width: 400,
    });
  });

  afterEach(() => {
    if (originalPointerEvent) {
      Object.defineProperty(window, 'PointerEvent', originalPointerEvent);
    } else {
      delete (window as unknown as Record<string, unknown>)['PointerEvent'];
    }
  });

  it('opts the interactive waveform out of browser panning', () => {
    expect(fixture.nativeElement.classList.contains('wr-interactive')).toBe(true);
  });

  it('drags a loop handle with a touch pointer', () => {
    const startSpy = jest.spyOn(component.loopStartChange, 'emit');

    // Start handle sits at 0.2 * 400 = 80 CSS px.
    canvas.dispatchEvent(
      pointerEvent('pointerdown', { clientX: 84, pointerType: 'touch', pointerId: 3 }),
    );
    canvas.dispatchEvent(
      pointerEvent('pointermove', { clientX: 200, pointerType: 'touch', pointerId: 3 }),
    );
    canvas.dispatchEvent(
      pointerEvent('pointerup', { clientX: 200, pointerType: 'touch', pointerId: 3 }),
    );

    expect(startSpy).toHaveBeenCalledWith(0.5);
  });

  it('gives a finger slop the mouse path would reject', () => {
    const startSpy = jest.spyOn(component.loopStartChange, 'emit');

    canvas.dispatchEvent(
      pointerEvent('pointerdown', { clientX: 95, pointerType: 'touch' }),
    );
    canvas.dispatchEvent(
      pointerEvent('pointermove', { clientX: 120, pointerType: 'touch' }),
    );

    expect(startSpy).toHaveBeenCalledWith(0.3);
  });

  it('keeps the tighter radius for a mouse pointer', () => {
    const startSpy = jest.spyOn(component.loopStartChange, 'emit');

    canvas.dispatchEvent(
      pointerEvent('pointerdown', { clientX: 95, pointerType: 'mouse' }),
    );
    canvas.dispatchEvent(
      pointerEvent('pointermove', { clientX: 120, pointerType: 'mouse' }),
    );

    expect(startSpy).not.toHaveBeenCalled();
  });

  it('stops dragging after pointercancel', () => {
    const startSpy = jest.spyOn(component.loopStartChange, 'emit');

    canvas.dispatchEvent(
      pointerEvent('pointerdown', { clientX: 80, pointerType: 'touch' }),
    );
    canvas.dispatchEvent(pointerEvent('pointercancel', { pointerType: 'touch' }));
    canvas.dispatchEvent(
      pointerEvent('pointermove', { clientX: 300, pointerType: 'touch' }),
    );

    expect(startSpy).not.toHaveBeenCalled();
  });
});
