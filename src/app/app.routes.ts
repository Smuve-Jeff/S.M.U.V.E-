import { Routes } from '@angular/router';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: 'hub',
    loadComponent: () =>
      import('./hub/hub.component').then((m) => m.HubComponent),
  },
  {
    path: 'studio',
    loadComponent: () =>
      import('./studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'vocal-suite',
    loadComponent: () =>
      import('./studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./components/profile-editor/profile-editor.component').then(
        (m) => m.ProfileEditorComponent
      ),
  },
  {
    path: 'tha-spot',
    loadComponent: () =>
      import('./components/tha-spot/tha-spot.component').then(
        (m) => m.ThaSpotComponent
      ),
    children: [
      {
        path: 'browse',
        loadComponent: () =>
          import('./components/tha-spot/tha-spot.component').then(
            (m) => m.ThaSpotComponent
          ),
      },
      {
        path: 'room/:id',
        loadComponent: () =>
          import('./components/tha-spot/tha-spot.component').then(
            (m) => m.ThaSpotComponent
          ),
      },
      {
        path: 'game/:id',
        loadComponent: () =>
          import('./components/tha-spot/tha-spot.component').then(
            (m) => m.ThaSpotComponent
          ),
      },
    ],
  },
  {
    path: 'gaming-hub',
    redirectTo: 'tha-spot',
    pathMatch: 'full',
  },
  {
    path: 'practice',
    loadComponent: () =>
      import('./components/practice-space/practice-space.component').then(
        (m) => m.PracticeSpaceComponent
      ),
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./components/analytics-dashboard/analytics-dashboard.component').then(
        (m) => m.AnalyticsDashboardComponent
      ),
  },
  {
    path: 'strategy',
    loadComponent: () =>
      import('./components/strategy-hub/strategy-hub.component').then(
        (m) => m.StrategyHubComponent
      ),
  },
  {
    path: 'career',
    loadComponent: () =>
      import('./components/career-hub/career-hub.component').then(
        (m) => m.CareerHubComponent
      ),
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./components/projects/projects.component').then(
        (m) => m.ProjectsComponent
      ),
  },
  {
    path: 'release-pipeline',
    loadComponent: () =>
      import('./components/release-pipeline/release-pipeline.component').then(
        (m) => m.ReleasePipelineComponent
      ),
  },
  {
    path: 'business-suite',
    loadComponent: () =>
      import('./components/business-suite/business-suite.component').then(
        (m) => m.BusinessSuiteComponent
      ),
  },
  {
    path: 'business-pipeline/:id',
    loadComponent: () =>
      import('./components/business-pipeline-detail/business-pipeline-detail.component').then(
        (m) => m.BusinessPipelineDetailComponent
      ),
  },
  {
    path: 'knowledge-base',
    loadComponent: () =>
      import('./components/knowledge-base/knowledge-base.component').then(
        (m) => m.KnowledgeBaseComponent
      ),
  },
  {
    path: 'lyric-editor',
    loadComponent: () =>
      import('./components/lyric-editor/lyric-editor.component').then(
        (m) => m.LyricEditorComponent
      ),
  },
  {
    path: 'remix-arena',
    loadComponent: () =>
      import('./components/remix-arena/remix-arena.component').then(
        (m) => m.RemixArenaComponent
      ),
  },
  {
    path: 'image-video-lab',
    loadComponent: () =>
      import('./components/image-video-lab/image-video-lab.component').then(
        (m) => m.ImageVideoLabComponent
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./components/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then(
        (m) => m.LoginComponent
      ),
  },
  {
    path: 'dj',
    loadComponent: () =>
      import('./studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'piano-roll',
    loadComponent: () =>
      import('./studio/piano-roll/piano-roll.component').then(
        (m) => m.PianoRollComponent
      ),
  },
  {
    path: 'networking',
    loadComponent: () =>
      import('./components/tha-spot/tha-spot.component').then(
        (m) => m.ThaSpotComponent
      ),
  },
  {
    path: 'player',
    loadComponent: () =>
      import('./hub/hub.component').then((m) => m.HubComponent),
  },
  {
    path: 'image-editor',
    loadComponent: () =>
      import('./components/image-video-lab/image-video-lab.component').then(
        (m) => m.ImageVideoLabComponent
      ),
  },
  {
    path: 'video-editor',
    loadComponent: () =>
      import('./components/image-video-lab/image-video-lab.component').then(
        (m) => m.ImageVideoLabComponent
      ),
  },
  { path: '', redirectTo: 'hub', pathMatch: 'full' },
  { path: '**', redirectTo: 'hub' },
];

for (const route of routes) {
  if (!route.path || route.path === 'login' || route.redirectTo) {
    continue;
  }

  route.canActivate = [authGuard];
}
