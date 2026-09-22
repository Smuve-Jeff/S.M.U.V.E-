import { routes } from './app.routes';
import { WORKSPACE_REGISTRY } from './services/workspace-registry';

type LazyComponent = () => Promise<Record<string, unknown>>;

describe('canvas piano roll wiring', () => {
  const protectedRoutes = routes.flatMap((route) => route.children ?? []);
  const route = protectedRoutes.find(
    (entry) => entry.path === 'canvas-piano-roll'
  );

  it('is registered as a lazy protected route', () => {
    expect(route).toBeDefined();
    expect(typeof route?.loadComponent).toBe('function');
  });

  it('resolves to the canvas piano roll component', async () => {
    const loaded = await (route!.loadComponent as unknown as LazyComponent)();
    // ts-jest hands back the class itself for single-export modules.
    const component = (loaded['PianoRollComponent'] ?? loaded) as { name?: string };
    expect(component.name).toBe('PianoRollComponent');
  });

  it('keeps the workspace registry path in sync with the route table', () => {
    const workspace = WORKSPACE_REGISTRY.find(
      (entry) => entry.mode === 'canvas-piano-roll'
    );
    expect(workspace).toBeDefined();
    expect(workspace!.routePath).toBe('/canvas-piano-roll');

    const path = workspace!.routePath.replace(/^\//, '');
    expect(protectedRoutes.some((entry) => entry.path === path)).toBe(true);
  });
});
