
import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', redirectTo: '/hub', pathMatch: 'full' },
    { path: 'hub', loadChildren: () => import('./hub/hub.routes').then(m => m.HUB_ROUTES) },
];
