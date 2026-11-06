import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { PluginStoreComponent } from "./plugin-store.component";
import { PluginStoreService } from "../../services/plugin-store.service";
import { WasmLoaderService } from "../wasm/wasm-loader.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";

/**
 * The Plugin Store had no component spec. It is the visible half of the WASM
 * ecosystem, so a broken binding here silently removes the only third-party
 * DSP surface in the app. These checks cover the catalog render, the enable
 * toggle and parameter writes reaching the store.
 */
describe("PluginStoreComponent", () => {
  const manifest = {
    id: "smuve.test.dynamics",
    name: "Test Compressor",
    version: "1.0.0",
    author: "Test",
    category: "Dynamics",
    description: "A test insert",
    icon: "bolt",
    kernelName: "compressor",
    params: [
      {
        id: "threshold",
        label: "Threshold",
        min: -60,
        max: 0,
        step: 1,
        default: -24,
        unit: "dB",
      },
    ],
    moduleFactory: jest.fn(),
    buildParams: jest.fn(),
  };

  const mockPluginStore = {
    catalog: [manifest],
    communityPlugins: jest.fn(() => []),
    isEnabled: jest.fn(() => false),
    toggle: jest.fn(),
    valuesFor: jest.fn(() => ({ threshold: -24 })),
    setParam: jest.fn(),
    exportCommunityPlugin: jest.fn(() => "{}"),
    importCommunityPlugin: jest.fn(() => "imported"),
    removeCommunityPlugin: jest.fn(),
  };
  const mockLoader = { wasmSupported: signal(true) };
  const mockHaptic = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };
  const mockSnackbar = {
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PluginStoreComponent],
      providers: [
        { provide: PluginStoreService, useValue: mockPluginStore },
        { provide: WasmLoaderService, useValue: mockLoader },
        { provide: HapticService, useValue: mockHaptic },
        { provide: SnackbarService, useValue: mockSnackbar },
      ],
    }).compileComponents();
  });

  it("renders the catalog with the active runtime badge", () => {
    const fixture = TestBed.createComponent(PluginStoreComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll(".ps-card").length).toBe(1);
    expect(element.textContent).toContain("Test Compressor");
    expect(element.textContent).toContain("WebAssembly ready");
  });

  it("enables a plugin through the store", () => {
    const fixture = TestBed.createComponent(PluginStoreComponent);
    const component = fixture.componentInstance;

    component.toggle(manifest as never);

    expect(mockPluginStore.toggle).toHaveBeenCalledWith(manifest.id);
    expect(mockSnackbar.info).toHaveBeenCalledWith(
      "Test Compressor disabled",
    );
  });

  it("parses a range input into a store parameter write", () => {
    const fixture = TestBed.createComponent(PluginStoreComponent);
    const component = fixture.componentInstance;

    component.onParamChange(manifest.id, "threshold", {
      target: { value: "-12" },
    } as unknown as Event);

    expect(mockPluginStore.setParam).toHaveBeenCalledWith(
      manifest.id,
      "threshold",
      -12,
    );
  });
});
