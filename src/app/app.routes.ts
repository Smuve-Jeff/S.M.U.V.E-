
import { Routes } from '@angular/router';
import { ProfileEditorComponent } from './components/profile-editor/profile-editor.component';

export const routes: Routes = [
    { path: '', redirectTo: '/profile', pathMatch: 'full' },
    { path: 'profile', component: ProfileEditorComponent },
    { path: 'hub', loadChildren: () => import('./hub/hub.routes').then(m => m.HUB_ROUTES) },
];
