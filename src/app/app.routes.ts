import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'hub', loadComponent: () => import('./hub/hub.component').then(m => m.HubComponent) },
  { path: 'studio', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent) },
  { path: 'vocal-suite', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent) },
  { path: 'profile', loadComponent: () => import('./components/journey/journey.component').then(m => m.JourneyComponent) },
  { path: 'tha-spot', loadComponent: () => import('./components/tha-spot/tha-spot.component').then(m => m.ThaSpotComponent) },
  { path: 'practice', loadComponent: () => import('./components/practice-space/practice-space.component').then(m => m.PracticeSpaceComponent) },
  { path: 'analytics', loadComponent: () => import('./components/analytics-dashboard/analytics-dashboard.component').then(m => m.AnalyticsDashboardComponent) },
  { path: 'strategy', loadComponent: () => import('./components/strategy-hub/strategy-hub.component').then(m => m.StrategyHubComponent) },
  { path: 'career', loadComponent: () => import('./components/career-hub/career-hub.component').then(m => m.CareerHubComponent) },
  { path: 'projects', loadComponent: () => import('./components/projects/projects.component').then(m => m.ProjectsComponent) },
  { path: 'remix-arena', loadComponent: () => import('./components/remix-arena/remix-arena.component').then(m => m.RemixArenaComponent) },
  { path: 'image-video-lab', loadComponent: () => import('./components/image-video-lab/image-video-lab.component').then(m => m.ImageVideoLabComponent) },
  { path: 'login', loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent) },
  { path: 'dj', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent) },
  { path: 'piano-roll', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent) },
  { path: 'networking', loadComponent: () => import('./components/tha-spot/tha-spot.component').then(m => m.ThaSpotComponent) },
  { path: 'player', loadComponent: () => import('./hub/hub.component').then(m => m.HubComponent) },
  { path: 'image-editor', loadComponent: () => import('./components/image-video-lab/image-video-lab.component').then(m => m.ImageVideoLabComponent) },
  { path: 'video-editor', loadComponent: () => import('./components/image-video-lab/image-video-lab.component').then(m => m.ImageVideoLabComponent) },
  { path: '', redirectTo: 'hub', pathMatch: 'full' },
  { path: '**', redirectTo: 'hub' }
];
