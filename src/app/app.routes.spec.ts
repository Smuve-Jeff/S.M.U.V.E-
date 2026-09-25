import { routes } from './app.routes';
import { WORKSPACE_REGISTRY } from './services/workspace-registry';

type LazyComponent = () => Promise<Record<string, unknown>>;

describe('strategy workspace wiring', () => {
  const protectedRoutes = routes.flatMap((route) => route.children ?? []);

  // Command Center, Neural Foundry and the Artist Journey are reached from the
  // workspace registry (sidebar, drawer, palette, total control). Each one needs
  // a lazy route whose path matches the registry's routePath exactly, and a
  // component whose exported name the shell can resolve.
  const wired = [
    { mode: 'command-center', component: 'CommandCenterComponent' },
    { mode: 'neural-foundry', component: 'NeuralFoundryComponent' },
    { mode: 'journey', component: 'JourneyComponent' },
  ];

  it.each(wired)('registers $mode as a lazy protected route', ({ mode }) => {
    const route = protectedRoutes.find((entry) => entry.path === mode);
    expect(route).toBeDefined();
    expect(typeof route?.loadComponent).toBe('function');
  });

  it.each(wired)('resolves $mode to $component', async ({ mode, component }) => {
    const route = protectedRoutes.find((entry) => entry.path === mode);
    const loaded = await (route!.loadComponent as unknown as LazyComponent)();
    // ts-jest hands back the class itself for single-export modules.
    const resolved = (loaded[component] ?? loaded) as { name?: string };
    expect(resolved.name).toBe(component);
  });

  it.each(wired)(
    'keeps the $mode registry path in sync with the route table',
    ({ mode }) => {
      const workspace = WORKSPACE_REGISTRY.find((entry) => entry.mode === mode);
      expect(workspace).toBeDefined();
      expect(workspace!.routePath).toBe(`/${mode}`);
      expect(
        protectedRoutes.some(
          (entry) => entry.path === workspace!.routePath.replace(/^\//, '')
        )
      ).toBe(true);
    }
  );
});

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
