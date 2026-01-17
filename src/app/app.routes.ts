import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ProfileEditorComponent } from './components/profile-editor/profile-editor.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { RemixArenaComponent } from './components/remix-arena/remix-arena.component';
import { HubComponent } from './hub/hub.component';
import { StrategyHubComponent } from './components/strategy-hub/strategy-hub.component';
import { AnalyticsDashboardComponent } from './components/analytics-dashboard/analytics-dashboard.component';
import { ImageVideoLabComponent } from './components/image-video-lab/image-video-lab.component';
import { ThaSpotComponent } from './components/tha-spot/tha-spot.component';
import { StudioComponent } from './studio/studio.component';

export const routes: Routes = [
  { path: 'profile', component: ProfileEditorComponent },
  { path: 'hub', component: HubComponent },
  { path: 'strategy', component: StrategyHubComponent },
  { path: 'analytics', component: AnalyticsDashboardComponent },
  { path: 'projects', component: ProjectsComponent },
  { path: 'studio', component: StudioComponent },
  { path: 'remix-arena', component: RemixArenaComponent },
  { path: 'image-video-lab', component: ImageVideoLabComponent },
  { path: 'tha-spot', component: ThaSpotComponent },
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'profile', pathMatch: 'full' },
  { path: '**', redirectTo: 'profile' },
];
