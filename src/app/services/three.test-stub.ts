/**
 * Jest-only stand-in for Three.js.
 *
 * Three 0.187 ships ESM only, while this repo's Jest preset runs CommonJS and
 * cannot parse `three.module.js`. Tests never have a WebGL context, so the
 * renderer constructor still fails and exercises the fallback. The small
 * geometry/material classes below let pure object-building code be tested
 * without pulling in the real ESM package.
 */

export class WebGLRenderer {
  constructor() {
    throw new Error('WebGL is unavailable in Jest');
  }
}

class TestGeometry {
  readonly type: string;

  constructor(type: string) {
    this.type = type;
  }

  dispose(): void {}
}

export class BoxGeometry extends TestGeometry {
  constructor(..._args: unknown[]) {
    super('BoxGeometry');
  }
}

export class SphereGeometry extends TestGeometry {
  constructor(..._args: unknown[]) {
    super('SphereGeometry');
  }
}

export class TorusKnotGeometry extends TestGeometry {
  constructor(..._args: unknown[]) {
    super('TorusKnotGeometry');
  }
}

export class CylinderGeometry extends TestGeometry {
  constructor(..._args: unknown[]) {
    super('CylinderGeometry');
  }
}

export class ConeGeometry extends TestGeometry {
  constructor(..._args: unknown[]) {
    super('ConeGeometry');
  }
}

export class Color {
  constructor(public value: unknown = 0) {}

  set(value: unknown): this {
    this.value = value;
    return this;
  }

  copy(other: Color): this {
    this.value = other.value;
    return this;
  }

  getHex(): number {
    return 0;
  }
}

export class Vector3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  copy(other: Vector3): this {
    return this.set(other.x, other.y, other.z);
  }

  multiplyScalar(scale: number): this {
    return this.set(this.x * scale, this.y * scale, this.z * scale);
  }

  setScalar(scale: number): this {
    return this.set(scale, scale, scale);
  }
}

export class MeshStandardMaterial {
  color: Color;
  emissive = new Color();
  metalness: number;
  roughness: number;
  opacity = 1;
  transparent = false;
  emissiveIntensity = 1;
  readonly userData: Record<string, unknown> = {};

  constructor(options: Record<string, unknown> = {}) {
    this.color = new Color(options['color']);
    this.metalness = (options['metalness'] as number | undefined) ?? 0.5;
    this.roughness = (options['roughness'] as number | undefined) ?? 0.5;
  }

  dispose(): void {}
}

export class Mesh {
  readonly userData: Record<string, unknown> = {};
  readonly position = new Vector3();
  readonly rotation = new Vector3();
  readonly scale = new Vector3();

  constructor(
    public geometry: TestGeometry,
    public material: MeshStandardMaterial,
  ) {}

  traverse(visit: (object: Mesh) => void): void {
    visit(this);
  }
}
