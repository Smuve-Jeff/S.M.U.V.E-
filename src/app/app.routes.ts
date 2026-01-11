import { Routes } from '@angular/router';
import { MainLayoutComponent } from './components/main-layout/main-layout.component';
import { AuthComponent } from './components/auth/auth.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { ProjectGalleryComponent } from './components/project-gallery/project-gallery.component';
import { RemixArenaComponent } from './components/remix-arena/remix-arena.component';
import { HubComponent } from './hub/hub.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'projects', component: ProjectGalleryComponent },
      { path: 'remix-arena', component: RemixArenaComponent },
      { path: 'profile', component: UserProfileComponent },
      { path: 'hub', component: HubComponent },
      { path: '', redirectTo: 'hub', pathMatch: 'full' },
    ],
  },
  { path: 'login', component: AuthComponent },
  { path: '**', redirectTo: '' },
];
