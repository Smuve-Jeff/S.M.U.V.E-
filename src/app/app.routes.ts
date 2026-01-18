import { Routes } from '@angular/router';
import { ProfileEditorComponent } from './components/profile-editor/profile-editor.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { RemixArenaComponent } from './components/remix-arena/remix-arena.component';
import { HubComponent } from './hub/hub.component';
import { StrategyHubComponent } from './components/strategy-hub/strategy-hub.component';
import { AnalyticsDashboardComponent } from './components/analytics-dashboard/analytics-dashboard.component';
import { PracticeSpaceComponent } from './components/practice-space/practice-space.component';
import { CareerHubComponent } from './components/career-hub/career-hub.component';
import { ImageVideoLabComponent } from './components/image-video-lab/image-video-lab.component';
import { ThaSpotComponent } from './components/tha-spot/tha-spot.component';
import { StudioComponent } from './studio/studio.component';

export const routes: Routes = [
  { path: 'profile', component: ProfileEditorComponent },
  { path: 'hub', component: HubComponent },
  { path: 'strategy', component: StrategyHubComponent },
  { path: 'analytics', component: AnalyticsDashboardComponent },
  { path: 'practice', component: PracticeSpaceComponent },
  { path: 'career', component: CareerHubComponent },
  { path: 'projects', component: ProjectsComponent },
  { path: 'studio', component: StudioComponent },
  { path: 'remix-arena', component: RemixArenaComponent },
  { path: 'image-video-lab', component: ImageVideoLabComponent },
  { path: 'tha-spot', component: ThaSpotComponent },
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then(
        (m) => m.LoginComponent
      ),
  },
  { path: '', redirectTo: 'hub', pathMatch: 'full' },
  { path: '**', redirectTo: 'hub' },
];
