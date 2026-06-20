# Elite S.M.U.V.E. 2.0 Integration & Stabilization

## Key Learnings & Patterns

### 1. Angular Signal & Route Reactive Sync
When handling query parameters that should drive view state (e.g., Studio View), use `this.route.queryParamMap.subscribe(...)` in the constructor or `ngOnInit` to ensure the view updates reactively to URL changes. Relying solely on `this.route.snapshot` during initial load can cause tests to fail if they expect immediate reactive updates.

### 2. Cross-Frame Communication Security
For features involving iframes (like 'Tha Spot' game cabinets), always validate the `event.origin` in message listeners.
```typescript
if (event.origin !== window.location.origin) return;
```

### 3. Resolving Circular Dependencies in Services
Use Angular's `Injector` with private lazy getters to resolve circular dependencies between singleton services (e.g., `SocialNetworkingService` <-> `PeerNetworkingService`).
```typescript
private injector = inject(Injector);
private get peerService() { return this.injector.get(PeerNetworkingService); }
```

### 4. Render Deployment Optimization
Ensure `npm install --legacy-peer-deps` is used in the build command on Render to handle legacy dependency conflicts common in Angular 18+ upgrades.

### 5. Social Feature Integration
The Socket.io backend should be configured with permissive CORS for the frontend origin and implement handlers for:
- `register_presence`
- `join_room`
- `send_room_message`
- `send_message` (Private)
- `challenge_player`
- `voice_signal` (WebRTC)

## Build Verification
Always run `npm run build` locally before submission to catch TypeScript type errors and template syntax issues.
