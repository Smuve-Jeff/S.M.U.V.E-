import { Routes } from '@angular/router';
import { AuthComponent } from './components/auth/auth.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { ProjectGalleryComponent } from './components/project-gallery/project-gallery.component';
import { RemixArenaComponent } from './components/remix-arena/remix-arena.component';
import { HubComponent } from './hub/hub.component';
import { ImageVideoLabComponent } from './components/image-video-lab/image-video-lab.component';
import { ThaSpotComponent } from './components/tha-spot/tha-spot.component';

export const routes: Routes = [
  { path: 'projects', component: ProjectGalleryComponent },
  { path: 'remix-arena', component: RemixArenaComponent },
  { path: 'profile', component: UserProfileComponent },
  { path: 'hub', component: HubComponent },
  { path: 'image-video-lab', component: ImageVideoLabComponent },
  { path: 'tha-spot', component: ThaSpotComponent },
  { path: 'login', component: AuthComponent },
  { path: '', redirectTo: 'hub', pathMatch: 'full' },
  { path: '**', redirectTo: 'hub' },
];
