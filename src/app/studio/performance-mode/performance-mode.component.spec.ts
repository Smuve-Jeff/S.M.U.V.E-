import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerformanceModeComponent, PerformancePad } from './performance-mode.component';
import { HapticService } from '../../services/haptic.service';
import { HardwareService } from '../../services/hardware.service';

describe('PerformanceModeComponent', () => {
  let component: PerformanceModeComponent;
  let fixture: ComponentFixture<PerformanceModeComponent>;
  let haptic: jest.Mocked<HapticService>;
  let hardware: jest.Mocked<HardwareService>;

  const mockPads: PerformancePad[] = [
    { id: 1, name: 'KICK', type: 'one-shot', isPlaying: false },
    { id: 2, name: 'SNARE', type: 'one-shot', isPlaying: false },
    { id: 3, name: 'HAT', type: 'one-shot', isPlaying: false },
    { id: 4, name: 'CLAP', type: 'one-shot', isPlaying: false },
    { id: 5, name: 'BASS', type: 'loop', isPlaying: false },
    { id: 6, name: 'CHORD', type: 'loop', isPlaying: false },
    { id: 7, name: 'LEAD', type: 'loop', isPlaying: false },
    { id: 8, name: 'FX', type: 'one-shot', isPlaying: false },
  ];

  beforeEach(async () => {
    haptic = {
      light: jest.fn(),
      medium: jest.fn(),
      heavy: jest.fn(),
      preset: jest.fn(),
      velocity: jest.fn(),
    } as any;

    hardware = {
      midiInputs: jest.fn().mockReturnValue([]),
      onMidiNoteOn: undefined,
      onMidiNoteOff: undefined,
      onMidiCC: undefined,
      sustainActive: jest.fn().mockReturnValue(false),
    } as any;

    await TestBed.configureTestingModule({
      imports: [PerformanceModeComponent],
      providers: [
        { provide: HapticService, useValue: haptic },
        { provide: HardwareService, useValue: hardware },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerformanceModeComponent);
    component = fixture.componentInstance;
    component.pads = mockPads;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize default MIDI note map for 8 pads', () => {
    const map = component.midiNoteMap();
    expect(Object.keys(map)).toHaveLength(8);
    expect(map[1]).toBe(36); // C2
    expect(map[2]).toBe(37); // C#2
    expect(map[8]).toBe(43); // G2
  });

  it('should trigger pad and emit padClicked', () => {
    const emitSpy = jest.spyOn(component.padClicked, 'emit');
    component.triggerPad(mockPads[0]);
    expect(haptic.medium).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(mockPads[0]);
  });

  it('should not trigger pad if long-press is active on same pad', () => {
    component.longPressPadId.set(1);
    const emitSpy = jest.spyOn(component.padClicked, 'emit');
    component.triggerPad(mockPads[0]);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should set velocity and compute correct zone', () => {
    component.setVelocity(0.3);
    expect(component.activeVelocity()).toBe(0.3);
    expect(component.currentVelocityZone()).toBe('soft');

    component.setVelocity(0.55);
    expect(component.currentVelocityZone()).toBe('medium');

    component.setVelocity(0.85);
    expect(component.currentVelocityZone()).toBe('hard');
  });

  it('should toggle MIDI mapping panel', () => {
    expect(component.showMidiMapping()).toBe(false);
    component.toggleMidiMapping();
    expect(component.showMidiMapping()).toBe(true);
    component.toggleMidiMapping();
    expect(component.showMidiMapping()).toBe(false);
  });

  it('should set MIDI note for a pad', () => {
    component.setMidiNoteForPad(1, 60); // C4
    expect(component.midiNoteMap()[1]).toBe(60);
    expect(haptic.light).toHaveBeenCalled();
  });

  it('should clamp MIDI note to 0–127 range', () => {
    component.setMidiNoteForPad(1, 200);
    expect(component.midiNoteMap()[1]).toBe(127);

    component.setMidiNoteForPad(1, -10);
    expect(component.midiNoteMap()[1]).toBe(0);
  });

  it('should convert MIDI note to readable name', () => {
    expect(component.midiNoteName(36)).toBe('C2');
    expect(component.midiNoteName(60)).toBe('C4');
    expect(component.midiNoteName(69)).toBe('A4');
    expect(component.midiNoteName(48)).toBe('C3');
  });

  it('should handle MIDI note-on and trigger mapped pad', () => {
    const emitSpy = jest.spyOn(component.padClicked, 'emit');
    component.midiNoteMap.set({ 1: 36, 2: 38 });
    // Call the hardware callback directly
    component['handleMidiNoteOn'](36, 100);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'KICK' })
    );
  });

  it('should not trigger pad for unmapped MIDI note', () => {
    const emitSpy = jest.spyOn(component.padClicked, 'emit');
    component['handleMidiNoteOn'](99, 100); // Not in map
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should wire hardware.onMidiNoteOn on init', () => {
    expect(hardware.onMidiNoteOn).toBeDefined();
    // Should be an actual function
    expect(typeof hardware.onMidiNoteOn).toBe('function');
  });

  it('should dismiss long press context menu', () => {
    component.longPressPadId.set(3);
    component.dismissLongPress();
    expect(component.longPressPadId()).toBeNull();
  });

  it('should handle pointer down and start long-press timer', () => {
    jest.useFakeTimers();
    const pad = mockPads[0];
    const preventDefault = jest.fn();
    component.onPointerDown(pad, { preventDefault } as any);
    expect(preventDefault).toHaveBeenCalled();
    expect(component.longPressPadId()).toBeNull();

    // Fast-forward 500ms
    jest.advanceTimersByTime(500);
    expect(haptic.heavy).toHaveBeenCalled();
    expect(component.longPressPadId()).toBe(1);
    jest.useRealTimers();
  });

  it('should handle pointer up before long-press threshold', () => {
    jest.useFakeTimers();
    const pad = mockPads[0];
    const emitSpy = jest.spyOn(component.padClicked, 'emit');

    component.onPointerDown(pad, { preventDefault: jest.fn() } as any);
    component.onPointerUp(pad, { preventDefault: jest.fn() } as any);
    expect(emitSpy).toHaveBeenCalledWith(pad);
    jest.useRealTimers();
  });

  it('should cancel trigger if pointer up after long-press', () => {
    jest.useFakeTimers();
    const pad = mockPads[0];
    const emitSpy = jest.spyOn(component.padClicked, 'emit');

    component.onPointerDown(pad, { preventDefault: jest.fn() } as any);
    jest.advanceTimersByTime(500);
    component.onPointerUp(pad, { preventDefault: jest.fn() } as any);
    // Should not trigger pad because it's in long-press state
    expect(emitSpy).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('should toggle long-press context menu on context menu', () => {
    component.onContextMenu(mockPads[0]);
    expect(component.longPressPadId()).toBe(1);
    component.onContextMenu(mockPads[0]);
    expect(component.longPressPadId()).toBeNull();
  });
});
