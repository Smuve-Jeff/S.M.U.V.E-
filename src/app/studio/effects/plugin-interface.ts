/**
 * Professional Plugin Architecture for S.M.U.V.E. 2.0
 * 
 * Every effect plugin implements IAudioPlugin, making the effects rack
 * dynamically extensible — unlimited inserts, aux sends, and master bus
 * processing without hardcoded switch statements.
 */

/** Plugin parameter descriptor for automation and UI binding */
export interface PluginParam {
  id: string;
  name: string;
  /** Current value */
  value: number;
  /** Default value */
  defaultValue: number;
  /** 0..1 normalised range */
  min: number;
  max: number;
  /** Step size for discrete parameters */
  step?: number;
  /** Display unit suffix */
  unit?: string;
}

/** Plugin category for UI organization */
export type PluginCategory =
  | 'dynamics'
  | 'eq'
  | 'modulation'
  | 'delay-reverb'
  | 'distortion'
  | 'utility'
  | 'spatial';

/** Every audio effect implements this interface */
export interface IAudioPlugin {
  /** Unique plugin identifier (e.g., 'smuve.comp.v1') */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Plugin category for UI grouping */
  readonly category: PluginCategory;
  /** AudioNode that receives input signal */
  readonly input: AudioNode;
  /** AudioNode that outputs processed signal */
  readonly output: AudioNode;
  /** Whether the plugin is currently active */
  enabled: boolean;
  /** Exposed automatable parameters */
  readonly params: PluginParam[];

  /** Get current value of a parameter by id */
  getParam(paramId: string): number;
  /** Set a parameter value (clamped to min/max) */
  setParam(paramId: string, value: number): void;
  /** Reset all parameters to defaults */
  reset(): void;
  /** Clean up audio nodes */
  dispose(): void;
}

/** Plugin constructor type — for dynamic instantiation */
export type PluginConstructor = new (ctx: AudioContext) => IAudioPlugin;

/** Global plugin registry for dynamic loading */
export class PluginRegistry {
  private static plugins = new Map<string, PluginConstructor>();

  /** Register a plugin constructor */
  static register(id: string, ctor: PluginConstructor): void {
    this.plugins.set(id, ctor);
  }

  /** Instantiate a plugin by id */
  static create(id: string, ctx: AudioContext): IAudioPlugin | null {
    const ctor = this.plugins.get(id);
    if (!ctor) return null;
    return new ctor(ctx);
  }

  /** List all registered plugin ids */
  static list(): string[] {
    return Array.from(this.plugins.keys());
  }

  /** Check if a plugin id is registered */
  static has(id: string): boolean {
    return this.plugins.has(id);
  }

  /** Get metadata for all registered plugins (for UI) */
  static getCatalog(ctx: AudioContext): Array<{ id: string; name: string; category: PluginCategory }> {
    return Array.from(this.plugins.entries()).map(([id, ctor]) => {
      const instance = new ctor(ctx);
      const result = { id, name: instance.name, category: instance.category };
      instance.dispose();
      return result;
    });
  }
}

/** Factory: adapt an existing effect class to the IAudioPlugin interface */
export function adaptEffectToPlugin(
  id: string,
  name: string,
  category: PluginCategory,
  factory: (ctx: AudioContext) => { input: AudioNode; output: AudioNode; dispose?: () => void; params?: PluginParam[]; getParam?: (p: string) => number; setParam?: (p: string, v: number) => void }
): PluginConstructor {
  return class AdaptedPlugin implements IAudioPlugin {
    readonly id = id;
    readonly name = name;
    readonly category = category;
    readonly input: AudioNode;
    readonly output: AudioNode;
    enabled = true;
    readonly params: PluginParam[] = [];
    private readonly instance: ReturnType<typeof factory>;
    private readonly _getParam?: (p: string) => number;
    private readonly _setParam?: (p: string, v: number) => void;
    private readonly _dispose?: () => void;

    constructor(private readonly ctx: AudioContext) {
      this.instance = factory(ctx);
      this.input = this.instance.input;
      this.output = this.instance.output;
      this.params = this.instance.params ?? [];
      this._getParam = this.instance.getParam;
      this._setParam = this.instance.setParam;
      this._dispose = this.instance.dispose;
    }

    getParam(paramId: string): number {
      if (this._getParam) return this._getParam(paramId);
      const p = this.params.find((pp) => pp.id === paramId);
      return p?.value ?? 0;
    }

    setParam(paramId: string, value: number): void {
      if (this._setParam) {
        this._setParam(paramId, value);
        return;
      }
      const p = this.params.find((pp) => pp.id === paramId);
      if (p) {
        p.value = Math.max(p.min, Math.min(p.max, value));
      }
    }

    reset(): void {
      for (const p of this.params) {
        p.value = p.defaultValue;
      }
    }

    dispose(): void {
      this._dispose?.();
    }
  };
}
