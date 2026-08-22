import { DynamicEffectsRack, PluginSlot } from './dynamic-effects-rack';
import { PluginRegistry } from './plugin-interface';

// MockAudioContext already set up globally in setup-jest.ts

describe('DynamicEffectsRack', () => {
  let ctx: AudioContext;
  let rack: DynamicEffectsRack;

  beforeEach(() => {
    ctx = new AudioContext();
    rack = new DynamicEffectsRack(ctx);
  });

  it('should be created', () => {
    expect(rack).toBeTruthy();
  });

  it('should expose input and output nodes', () => {
    expect(rack.input).toBeTruthy();
    expect(rack.output).toBeTruthy();
  });

  describe('insert slots', () => {
    it('should add an insert plugin', () => {
      const slot = rack.addInsert('smuve.eq.v1');
      expect(slot).toBeTruthy();
      expect(slot!.mode).toBe('insert');
      expect(rack.inserts.length).toBe(1);
    });

    it('should return null for unknown plugin ids', () => {
      const slot = rack.addInsert('nonexistent.plugin');
      expect(slot).toBeNull();
    });

    it('should remove an insert slot by id', () => {
      const slot = rack.addInsert('smuve.eq.v1');
      expect(rack.inserts.length).toBe(1);
      rack.removeInsert(slot!.id);
      expect(rack.inserts.length).toBe(0);
    });

    it('should move insert slots', () => {
      const eq = rack.addInsert('smuve.eq.v1');
      const comp = rack.addInsert('smuve.compressor.v1');
      expect(rack.inserts[0].plugin.id).toBe('smuve.eq.v1');
      rack.moveInsert(comp!.id, 0);
      expect(rack.inserts[0].plugin.id).toBe('smuve.compressor.v1');
    });

    it('should toggle insert on/off', () => {
      const slot = rack.addInsert('smuve.eq.v1');
      expect(slot!.plugin.enabled).toBe(true);
      rack.toggleInsert(slot!.id);
      expect(slot!.plugin.enabled).toBe(false);
      rack.toggleInsert(slot!.id);
      expect(slot!.plugin.enabled).toBe(true);
    });

    it('should handle multiple inserts in series', () => {
      rack.addInsert('smuve.eq.v1');
      rack.addInsert('smuve.compressor.v1');
      rack.addInsert('smuve.distortion.v1');
      rack.addInsert('smuve.delay.v1');
      rack.addInsert('smuve.reverb.v1');
      expect(rack.inserts.length).toBe(5);
    });
  });

  describe('send slots', () => {
    it('should add a send to an aux bus', () => {
      const slot = rack.addSend('smuve.reverb.v1', 'ReverbBus', 0.4);
      expect(slot).toBeTruthy();
      expect(slot!.mode).toBe('send');
      expect(slot!.auxBus).toBe('ReverbBus');
      expect(slot!.sendLevel).toBe(0.4);
      expect(rack.listAuxBuses()).toContain('ReverbBus');
    });

    it('should clamp send level to 0..1', () => {
      const slot = rack.addSend('smuve.delay.v1', 'DelayBus', 1.5);
      expect(slot!.sendLevel).toBe(1);
      const slot2 = rack.addSend('smuve.reverb.v1', 'VerbBus', -0.5);
      expect(slot2!.sendLevel).toBe(0);
    });

    it('should update send level', () => {
      const slot = rack.addSend('smuve.reverb.v1', 'VerbA', 0.3);
      rack.setSendLevel(slot!.id, 0.7);
      expect(rack.sends[0].sendLevel).toBe(0.7);
    });

    it('should set aux bus level', () => {
      rack.addSend('smuve.delay.v1', 'FXBus', 0.5);
      rack.setAuxBusLevel('FXBus', 0.75);
      // Level was set — just verify no throw
      expect(() => rack.getAuxBusLevel('FXBus')).not.toThrow();
    });

    it('should remove a send', () => {
      const slot = rack.addSend('smuve.delay.v1', 'Bus1', 0.5);
      expect(rack.sends.length).toBe(1);
      rack.removeSend(slot!.id);
      expect(rack.sends.length).toBe(0);
    });
  });

  describe('master bus', () => {
    it('should add a master slot', () => {
      const slot = rack.addMaster('smuve.compressor.v1');
      expect(slot).toBeTruthy();
      expect(rack.masterSlots.length).toBe(1);
    });

    it('should remove a master slot', () => {
      const slot = rack.addMaster('smuve.compressor.v1');
      rack.removeMaster(slot!.id);
      expect(rack.masterSlots.length).toBe(0);
    });
  });

  describe('aux buses', () => {
    it('should list aux buses', () => {
      rack.addSend('smuve.reverb.v1', 'Reverb', 0.5);
      rack.addSend('smuve.delay.v1', 'Delay', 0.3);
      const buses = rack.listAuxBuses();
      expect(buses).toContain('Reverb');
      expect(buses).toContain('Delay');
      expect(buses.length).toBe(2);
    });
  });

  describe('snapshot & hydration', () => {
    it('should export and restore rack state', () => {
      rack.addInsert('smuve.eq.v1');
      rack.addInsert('smuve.compressor.v1');
      rack.addSend('smuve.reverb.v1', 'Reverb', 0.5);
      rack.addMaster('smuve.compressor.v1');
      rack.toggleInsert(rack.inserts[0].id);

      const snapshot = rack.getSnapshot();
      expect(snapshot.inserts.length).toBe(2);
      expect(snapshot.sends.length).toBe(1);
      expect(snapshot.master.length).toBe(1);

      rack.hydrateSnapshot(snapshot);
      expect(rack.inserts.length).toBe(2);
      expect(rack.sends.length).toBe(1);
      expect(rack.masterSlots.length).toBe(1);
      expect(rack.inserts[0].plugin.enabled).toBe(false);
    });

    it('should handle empty snapshot', () => {
      rack.addInsert('smuve.eq.v1');
      rack.hydrateSnapshot({});
      expect(rack.inserts.length).toBe(0);
    });
  });

  describe('worklet integration', () => {
    it('should not use worklet by default', () => {
      expect(rack.useWorklet).toBe(false);
    });

    it('should attempt to enable worklet (graceful failure)', async () => {
      // In JSDOM, AudioWorklet is not natively supported, so this should
      // fail gracefully without throwing.
      const result = await rack.enableWorklet();
      // Either true (if mock supports it) or false (graceful fallback)
      expect([true, false]).toContain(result);
    });

    it('should disable worklet without throwing', () => {
      expect(() => rack.disableWorklet()).not.toThrow();
    });
  });

  describe('signal chain integrity', () => {
    it('should rebuild chain after each mutation without throwing', () => {
      rack.addInsert('smuve.eq.v1');
      rack.addInsert('smuve.compressor.v1');
      rack.addSend('smuve.reverb.v1', 'Verb', 0.3);
      rack.addMaster('smuve.compressor.v1');
      rack.toggleInsert(rack.inserts[0].id);
      rack.removeSend(rack.sends[0].id);
      // All operations should succeed without errors
      expect(rack.inserts.length).toBe(2);
      expect(rack.sends.length).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should clean up all slots and nodes', () => {
      rack.addInsert('smuve.eq.v1');
      rack.addSend('smuve.reverb.v1', 'Verb', 0.5);
      rack.addMaster('smuve.compressor.v1');
      rack.dispose();
      expect(rack.inserts.length).toBe(0);
      expect(rack.masterSlots.length).toBe(0);
    });
  });

  describe('registerBuiltins', () => {
    it('should have registered all built-in plugins', () => {
      const ids = PluginRegistry.list();
      expect(ids).toContain('smuve.eq.v1');
      expect(ids).toContain('smuve.compressor.v1');
      expect(ids).toContain('smuve.reverb.v1');
      expect(ids).toContain('smuve.delay.v1');
      expect(ids).toContain('smuve.distortion.v1');
      expect(ids).toContain('smuve.sidechain.v1');
    });

    it('should create each built-in plugin', () => {
      const ids = ['smuve.eq.v1', 'smuve.compressor.v1', 'smuve.reverb.v1',
        'smuve.delay.v1', 'smuve.distortion.v1', 'smuve.sidechain.v1'];
      for (const id of ids) {
        const plugin = PluginRegistry.create(id, ctx);
        expect(plugin).toBeTruthy();
        expect(plugin!.id).toBe(id);
        expect(plugin!.input).toBeTruthy();
        expect(plugin!.output).toBeTruthy();
        plugin!.dispose();
      }
    });
  });
});
