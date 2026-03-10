import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'hub', loadComponent: () => import('./hub/hub.component').then(m => m.HubComponent) },
  { path: 'dashboard', redirectTo: 'hub' },
  { path: 'studio', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent) },
  { path: 'profile', loadComponent: () => import('./components/profile-editor/profile-editor.component').then(m => m.ProfileEditorComponent) },
  { path: 'tha-spot', loadComponent: () => import('./components/tha-spot/tha-spot.component').then(m => m.ThaSpotComponent) },
  { path: 'practice', loadComponent: () => import('./components/practice-space/practice-space.component').then(m => m.PracticeSpaceComponent) },
  { path: 'analytics', loadComponent: () => import('./components/analytics-dashboard/analytics-dashboard.component').then(m => m.AnalyticsDashboardComponent) },
  { path: 'strategy', loadComponent: () => import('./components/command-center/command-center.component').then(m => m.CommandCenterComponent) },
  { path: 'career', loadComponent: () => import('./components/career-hub/career-hub.component').then(m => m.CareerHubComponent) },
  { path: 'projects', loadComponent: () => import('./components/projects/projects.component').then(m => m.ProjectsComponent) },
  { path: 'remix-arena', loadComponent: () => import('./components/remix-arena/remix-arena.component').then(m => m.RemixArenaComponent) },
  { path: 'image-video-lab', loadComponent: () => import('./components/image-video-lab/image-video-lab.component').then(m => m.ImageVideoLabComponent) },
  { path: 'login', loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent) },
  { path: 'dj', loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent) },
  { path: 'player', loadComponent: () => import('./hub/hub.component').then(m => m.HubComponent) },
  { path: '', redirectTo: 'hub', pathMatch: 'full' },
  { path: '**', redirectTo: 'hub' }
];
