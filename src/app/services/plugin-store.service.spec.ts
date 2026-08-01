import { TestBed } from '@angular/core/testing';
import { PluginStoreService } from './plugin-store.service';
import { WasmLoaderService } from '../studio/wasm/wasm-loader.service';
import { LoggingService } from './logging.service';

describe('PluginStoreService (Sprint B1)', () => {
  let svc: PluginStoreService;

  const loadedModules = new Map<string, any>();
  const mockLoader = {
    loadModule: jest.fn((id: string, config: any) => {
      const mod = config.jsFallback ? config.jsFallback() : null;
      if (mod) loadedModules.set(id, mod);
      return Promise.resolve(mod);
    }),
    getModule: jest.fn((id: string) => loadedModules.get(id) ?? null),
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
    loadedModules.clear();
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

  describe('community store (Phase 2)', () => {
    it('exports a shareable smuve-plugin payload', () => {
      const json = svc.exportCommunityPlugin('smuve.saturation.v2');
      expect(json).not.toBeNull();
      const payload = JSON.parse(json!);
      expect(payload.format).toBe('smuve-plugin');
      expect(payload.manifest.id).toBe('smuve.saturation.v2');
      expect(payload.manifest.params.length).toBe(3);
    });

    it('imports a valid community plugin and persists it', () => {
      const id = svc.importCommunityPlugin(
        JSON.stringify({
          format: 'smuve-plugin',
          manifest: {
            id: 'smuve.chorus.v1',
            name: 'Chorus',
            version: '1.0.0',
            author: 'Community',
            category: 'Saturation',
            description: 'Test chorus',
            icon: 'chorus',
            kernelName: 'process',
            params: [{ id: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, default: 0.5 }],
          },
        })
      );
      expect(id).toBe('smuve.chorus.v1');
      expect(svc.manifestFor('smuve.chorus.v1')).not.toBeNull();
      expect(svc.communityPlugins().length).toBe(1);

      const again = TestBed.inject(PluginStoreService);
      expect(again.manifestFor('smuve.chorus.v1')).not.toBeNull();
    });

    it('rejects malformed payloads and duplicates', () => {
      expect(() => svc.importCommunityPlugin('not json')).toThrow();
      expect(() =>
        svc.importCommunityPlugin(JSON.stringify({ format: 'other' }))
      ).toThrow();
      // Duplicate built-in id
      expect(() =>
        svc.importCommunityPlugin(
          JSON.stringify({
            format: 'smuve-plugin',
            manifest: {
              id: 'smuve.saturation.v2',
              name: 'Clone',
              version: '1.0.0',
              author: 'X',
              category: 'EQ',
              description: 'dup',
              icon: 'x',
              kernelName: 'eq',
              params: [],
            },
          })
        )
      ).toThrow('already exists');
    });

    it('removes community plugins (and their enabled state)', () => {
      svc.importCommunityPlugin(
        JSON.stringify({
          format: 'smuve-plugin',
          manifest: {
            id: 'smuve.tmp.v1',
            name: 'Tmp',
            version: '1.0.0',
            author: 'X',
            category: 'EQ',
            description: 'temp',
            icon: 'x',
            kernelName: 'eq',
            params: [],
          },
        })
      );
      svc.toggle('smuve.tmp.v1');
      expect(svc.isEnabled('smuve.tmp.v1')).toBe(true);
      svc.removeCommunityPlugin('smuve.tmp.v1');
      expect(svc.manifestFor('smuve.tmp.v1')).toBeNull();
      expect(svc.isEnabled('smuve.tmp.v1')).toBe(false);
    });
  });

  describe('live block processing (Phase 2)', () => {
    it('passes a block through a preloaded plugin kernel in-place', async () => {
      // Load the module first so processLiveBlock finds a kernel.
      await svc.loadModule('smuve.saturation.v2');
      const block = new Float32Array(64).fill(0.5);
      const before = block.slice();
      svc.processLiveBlock(['smuve.saturation.v2'], block, 44100);
      let changed = 0;
      for (let i = 0; i < block.length; i++) {
        if (block[i] !== before[i]) changed++;
      }
      expect(changed).toBeGreaterThan(0);
    });

    it('passes through untouched when the chain is empty or unloaded', () => {
      const block = new Float32Array(16).fill(0.25);
      const copy = block.slice();
      svc.processLiveBlock([], block, 44100);
      expect(block).toEqual(copy);
      // Unloaded plugin → silent pass-through (kicks off a background load).
      svc.processLiveBlock(['smuve.eq.mastering.v2'], block, 44100);
      expect(block).toEqual(copy);
    });
  });
});
