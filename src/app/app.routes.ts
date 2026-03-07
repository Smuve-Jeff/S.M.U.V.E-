import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'profile',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/journey/journey.component').then(
        (m) => m.JourneyComponent
      ),
  },
  {
    path: 'hub',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () => import('./hub/hub.component').then((m) => m.HubComponent),
  },
  {
    path: 'strategy',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/strategy-hub/strategy-hub.component').then(
        (m) => m.StrategyHubComponent
      ),
  },
  {
    path: 'analytics',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/analytics-dashboard/analytics-dashboard.component').then(
        (m) => m.AnalyticsDashboardComponent
      ),
  },
  {
    path: 'practice',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/practice-space/practice-space.component').then(
        (m) => m.PracticeSpaceComponent
      ),
  },
  {
    path: 'career',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/career-hub/career-hub.component').then(
        (m) => m.CareerHubComponent
      ),
  },
  {
    path: 'projects',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/projects/projects.component').then(
        (m) => m.ProjectsComponent
      ),
  },
  {
    path: 'studio',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () => import('./studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'remix-arena',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/remix-arena/remix-arena.component').then(
        (m) => m.RemixArenaComponent
      ),
  },
  {
    path: 'image-video-lab',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/image-video-lab/image-video-lab.component').then(
        (m) => m.ImageVideoLabComponent
      ),
  },
  {
    path: 'tha-spot',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/tha-spot/tha-spot.component').then(
        (m) => m.ThaSpotComponent
      ),
  },
  {
    path: 'networking',
    canActivate: [() => import('./services/auth.guard').then((m) => m.authGuard)],
    loadComponent: () => import('./hub/hub.component').then((m) => m.HubComponent),
    data: { viewMode: 'networking' },
  },
  {
    path: 'player',
    canActivate: [() => import('./services/auth.guard').then((m) => m.authGuard)],
    loadComponent: () => import('./hub/hub.component').then((m) => m.HubComponent),
    data: { viewMode: 'player' },
  },
  {
    path: 'dj',
    canActivate: [() => import('./services/auth.guard').then((m) => m.authGuard)],
    loadComponent: () =>
      import('./studio/studio.component').then((m) => m.StudioComponent),
    data: { viewMode: 'dj' },
  },
  {
    path: 'piano-roll',
    canActivate: [() => import('./services/auth.guard').then((m) => m.authGuard)],
    loadComponent: () =>
      import('./studio/studio.component').then((m) => m.StudioComponent),
    data: { viewMode: 'piano-roll' },
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () => import('./hub/hub.component').then((m) => m.HubComponent),
  },
  {
    path: 'player',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () => import('./hub/hub.component').then((m) => m.HubComponent),
  },
  {
    path: 'dj',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () => import('./studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'piano-roll',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () => import('./studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'image-editor',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/image-video-lab/image-video-lab.component').then(
        (m) => m.ImageVideoLabComponent
      ),
  },
  {
    path: 'video-editor',
    canActivate: [() => import('./services/auth.guard').then(m => m.authGuard)],
    loadComponent: () =>
      import('./components/image-video-lab/image-video-lab.component').then(
        (m) => m.ImageVideoLabComponent
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then((m) => m.LoginComponent),
  },
  { path: '', redirectTo: 'hub', pathMatch: 'full' },
  { path: '**', redirectTo: 'hub' },
];
