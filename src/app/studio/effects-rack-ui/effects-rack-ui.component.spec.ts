import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import {
  EffectsRackUiComponent,
  FX_PARAM_SPECS,
} from './effects-rack-ui.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { PluginStoreService } from '../../services/plugin-store.service';

/**
 * The rack's Add Effect button had no handler, the parameters panel rendered
 * hard-coded knobs that could not change anything, and the slot row nested a
 * <button> inside a <button>. These specs pin the repaired behaviour.
 */
describe('EffectsRackUiComponent', () => {
  let fixture: ComponentFixture<EffectsRackUiComponent>;
  let component: EffectsRackUiComponent;

  const track = {
    id: 'track-1',
    name: 'Lead Vox',
    type: 'audio',
    fxSlots: [
      { id: 'fx1', type: 'Reverb', params: { wet: 20 }, enabled: true },
    ],
    pluginIds: [] as string[],
  };

  // Mirrors the real service: selectedTrack is derived from the track list, so
  // writing the list re-renders the rack exactly like production does.
  const tracksSignal = signal([track]);

  const musicManagerMock = {
    tracks: tracksSignal,
    selectedTrack: computed(() => tracksSignal()[0]),
    setTrackPlugins: jest.fn(),
    addFxSlot: jest.fn((_trackId: string, type: string) => {
      track.fxSlots = [
        ...track.fxSlots,
        { id: 'fx-new', type, params: {}, enabled: true },
      ];
      tracksSignal.set([{ ...track }]);
      return 'fx-new';
    }),
    removeFxSlot: jest.fn(),
    setFxSlotParam: jest.fn(
      (_t: string, _s: string, param: string, value: number) => {
        track.fxSlots[0].params = {
          ...track.fxSlots[0].params,
          [param]: value,
        };
        tracksSignal.set([{ ...track }]);
      }
    ),
    toggleFxSlot: jest.fn(),
  };

  const audioEngineMock = {
    masterPluginIds: signal<string[]>([]),
    installMasterPluginInsertAfterWidth: jest.fn(),
  };

  const pluginStoreMock = {
    catalog: [
      {
        id: 'smuve.reverb.v2',
        name: 'Algorithmic Reverb',
        description: 'Room',
        icon: 'blur_on',
        kernelName: 'process',
      },
    ],
    preload: jest.fn(),
    manifestFor: jest.fn(() => ({ kernelName: 'process' })),
    loader: { getModule: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset shared fixture state between specs.
    track.fxSlots = [
      { id: 'fx1', type: 'Reverb', params: { wet: 20 }, enabled: true },
    ];
    track.pluginIds = [];
    tracksSignal.set([{ ...track }]);

    await TestBed.configureTestingModule({
      imports: [EffectsRackUiComponent],
      providers: [
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: PluginStoreService, useValue: pluginStoreMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EffectsRackUiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture?.destroy());

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('exposes the active slot and its type specs', () => {
    expect(component.activeSlot()).toBe(1);
    expect(component.paramSpecs('Reverb')).toBe(FX_PARAM_SPECS['Reverb']);
    // Unknown types still get an editable surface rather than an empty grid.
    expect(component.paramSpecs('Mystery').length).toBeGreaterThan(0);
  });

  it('falls back to the spec default when a parameter was never set', () => {
    const spec = FX_PARAM_SPECS['Reverb'].find((s) => s.id === 'decay')!;
    const slot = component.activeFxSlot()!;
    expect(component.paramValue(slot, spec)).toBe(spec.default);

    // Set values are read straight off the slot.
    const wetSpec = FX_PARAM_SPECS['Reverb'].find((s) => s.id === 'wet')!;
    expect(component.paramValue(slot, wetSpec)).toBe(20);
  });

  it('writes a knob move through to the manager', () => {
    const slot = component.activeFxSlot()!;
    component.setFxParam(slot.id, 'decay', 3.4);
    expect(musicManagerMock.setFxSlotParam).toHaveBeenCalledWith(
      'track-1',
      'fx1',
      'decay',
      3.4
    );
  });

  it('renders one bound knob per spec and wires their change events', () => {
    const knobs: NodeListOf<HTMLElement> =
      fixture.nativeElement.querySelectorAll('.er-knob-cell app-knob');
    expect(knobs.length).toBe(FX_PARAM_SPECS['Reverb'].length);

    // The first knob shows the slot's stored wet value, not a hard-coded one.
    expect(knobs[0].textContent).toContain('20');
  });

  it('adds a slot from the effect picker and focuses it', () => {
    const addButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.er-add-slot'
    );
    expect(addButton).toBeTruthy();
    addButton.click();
    fixture.detectChanges();

    const items = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.er-add-menu-item'
      ) as NodeListOf<HTMLButtonElement>
    );
    expect(items.map((b) => b.textContent?.trim())).toEqual(component.fxTypes);

    const delay = items.find((b) => b.textContent?.trim() === 'Delay')!;
    delay.click();
    fixture.detectChanges();

    expect(musicManagerMock.addFxSlot).toHaveBeenCalledWith('track-1', 'Delay');
    expect(component.addMenuOpen()).toBe(false);
    // Selection follows the new slot instead of staying on the old one.
    expect(component.activeSlot()).toBe(2);
  });

  it('removes a slot and keeps the selection inside the shortened list', () => {
    component.activeSlot.set(1);
    component.removeFxSlot(0);
    expect(musicManagerMock.removeFxSlot).toHaveBeenCalledWith('track-1', 'fx1');
    expect(component.activeSlot()).toBe(1);
  });

  it('resets every parameter of the active slot to its defaults', () => {
    component.resetFxParams();
    const specs = FX_PARAM_SPECS['Reverb'];
    expect(musicManagerMock.setFxSlotParam).toHaveBeenCalledTimes(specs.length);
    expect(musicManagerMock.setFxSlotParam).toHaveBeenCalledWith(
      'track-1',
      'fx1',
      'decay',
      2.5
    );
  });

  it('reports the slot mix from the real wet value', () => {
    const slot = component.activeFxSlot()!;
    expect(component.mixPercentFor(slot)).toBe(20);
    expect(component.mixPercentFor(null)).toBe(50);
  });

  it('only offers the live-chain bridge for slot types with a WASM kernel', () => {
    expect(component.canSendToLiveChain()).toBe(true);
    component.sendActiveToLiveChain();
    expect(musicManagerMock.setTrackPlugins).toHaveBeenCalledWith('track-1', [
      'smuve.reverb.v2',
    ]);

    // A type with no matching kernel hides the action.
    track.fxSlots = [{ id: 'fx1', type: 'Chorus', params: {}, enabled: true }];
    tracksSignal.set([{ ...track }]);
    fixture.detectChanges();
    expect(component.canSendToLiveChain()).toBe(false);
  });

  it('does not double-install a live kernel that is already present', () => {
    audioEngineMock.masterPluginIds.set([]);
    component.sendActiveToLiveChain();
    expect(musicManagerMock.setTrackPlugins).toHaveBeenCalledTimes(1);
  });
});
