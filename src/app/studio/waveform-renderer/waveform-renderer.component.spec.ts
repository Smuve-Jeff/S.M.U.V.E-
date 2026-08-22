import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WaveformRendererComponent } from './waveform-renderer.component';

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
});
