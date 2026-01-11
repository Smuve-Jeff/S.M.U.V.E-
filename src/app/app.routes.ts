import { Routes } from '@angular/router';
import { ProfileEditorComponent } from './components/profile-editor/profile-editor.component';
import { ProjectsComponent } from './components/projects/projects.component'; // Import the new component

export const routes: Routes = [
    { path: '', redirectTo: '/profile', pathMatch: 'full' },
    { path: 'profile', component: ProfileEditorComponent },
    { path: 'projects', component: ProjectsComponent }, // Add the new route
    { path: 'hub', loadChildren: () => import('./hub/hub.routes').then(m => m.HUB_ROUTES) },
];
