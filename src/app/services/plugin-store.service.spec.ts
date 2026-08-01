import { TestBed } from '@angular/core/testing';
import { PluginStoreService } from './plugin-store.service';
import { WasmLoaderService } from '../studio/wasm/wasm-loader.service';
import { LoggingService } from './logging.service';

describe('PluginStoreService (Sprint B1)', () => {
  let svc: PluginStoreService;

  const mockLoader = {
    loadModule: jest.fn((id: string, config: any) =>
      Promise.resolve(config.jsFallback ? config.jsFallback() : null)
    ),
    wasmSupported: () => true,
  };

  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  /** Minimal AudioBuffer-shaped object the plugin processor can mutate. */
  function fakeBuffer(channels = 1): any {
    const data: Float32Array[] = [];
    for (let c = 0; c < channels; c++) data.push(new Float32Array(64).fill(0.25));
    return {
      numberOfChannels: channels,
      sampleRate: 44100,
      length: 64,
      getChannelData: (c: number) => data[c],
      copyToChannel: () => {},
    };
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        PluginStoreService,
        { provide: WasmLoaderService, useValue: mockLoader },
        { provide: LoggingService, useValue: mockLogger },
      ],
    });
    svc = TestBed.inject(PluginStoreService);
  });

  it('exposes the built-in plugin catalog across every category', () => {
    const ids = svc.catalog.map((p) => p.id);
    expect(ids).toContain('smuve.dynamics.v2');
    expect(ids).toContain('smuve.eq.mastering.v2');
    expect(ids).toContain('smuve.saturation.v2');
    expect(ids).toContain('smuve.reverb.v2');
    expect(ids).toContain('smuve.master.v2');
    expect(new Set(svc.catalog.map((p) => p.category)).size).toBeGreaterThan(2);
  });

  it('persists the enabled set across instances', () => {
    expect(svc.isEnabled('smuve.saturation.v2')).toBe(false);
    svc.toggle('smuve.saturation.v2');
    expect(svc.isEnabled('smuve.saturation.v2')).toBe(true);

    const again = TestBed.inject(PluginStoreService);
    expect(again.isEnabled('smuve.saturation.v2')).toBe(true);
  });

  it('clamps param overrides to the manifest range', () => {
    svc.setParam('smuve.saturation.v2', 'amount', 5);
    const values = svc.valuesFor('smuve.saturation.v2');
    expect(values['amount']).toBe(1); // max for amount is 1

    svc.setParam('smuve.dynamics.v2', 'ratio', 0.1);
    expect(svc.valuesFor('smuve.dynamics.v2')['ratio']).toBe(1); // min is 1
  });

  it('builds kernel params in kernel order for the master chain (28 floats)', () => {
    const kernel = svc.kernelParamsFor('smuve.master.v2');
    expect(kernel.length).toBe(28);
    expect(kernel[15]).toBe(-20); // comp threshold default
    expect(kernel[24]).toBeCloseTo(-0.3, 4); // limiter ceiling default (Float32)
  });

  it('loads modules through the WasmLoaderService JS fallback', async () => {
    const mod = await svc.loadModule('smuve.eq.mastering.v2');
    expect(mod).not.toBeNull();
    expect(mod!.getKernel('eq')).not.toBeNull();
    expect(mockLoader.loadModule).toHaveBeenCalledWith(
      'smuve.eq.mastering.v2',
      expect.objectContaining({ jsFallback: expect.any(Function) })
    );
  });

  it('processes a buffer through a kernel (saturation changes samples)', async () => {
    const buffer = fakeBuffer(1);
    const before = buffer.getChannelData(0).slice();
    const out = await svc.processBuffer(buffer, 'smuve.saturation.v2');
    const after = out.getChannelData(0);
    let changed = 0;
    for (let i = 0; i < after.length; i++) {
      if (after[i] !== before[i]) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('applies only enabled plugins in catalog order', async () => {
    const buffer = fakeBuffer(1);
    svc.toggle('smuve.saturation.v2');
    const out = await svc.applyEnabledChain(buffer);
    expect(out).toBe(buffer);
    // Both saturation and nothing else ran — the chain returned the buffer.
    expect(mockLoader.loadModule).toHaveBeenCalledWith(
      'smuve.saturation.v2',
      expect.anything()
    );
  });

  it('skips plugins that fail to load without throwing', async () => {
    mockLoader.loadModule.mockRejectedValueOnce(new Error('wasm boom'));
    svc.toggle('smuve.dynamics.v2');
    const buffer = fakeBuffer(1);
    const out = await svc.applyEnabledChain(buffer);
    expect(out).toBe(buffer);
  });
});
