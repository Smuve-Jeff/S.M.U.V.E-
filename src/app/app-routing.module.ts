import { NgModule } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: '/hub', pathMatch: 'full' },
  {
    path: 'hub',
    loadChildren: () => import('./hub/hub.module').then(m => m.HubModule)
  },
  {
    path: 'arpeggiator',
    loadChildren: () => import('./components/arpeggiator/arpeggiator.module').then(m => m.ArpeggiatorModule)
  },
  {
    path: 'user-dashboard',
    loadChildren: () => import('./components/user-dashboard/user-dashboard.module').then(m => m.UserDashboardModule)
  },
  {
    path: 'audio-visualizer',
    loadChildren: () => import('./components/audio-visualizer/audio-visualizer.module').then(m => m.AudioVisualizerModule)
  },
  {
    path: 'piano-roll',
    loadChildren: () => import('./components/piano-roll/piano-roll.module').then(m => m.PianoRollModule)
  },
  {
    path: 'networking',
    loadChildren: () => import('./components/networking/networking.module').then(m => m.NetworkingModule)
  },
  {
    path: 'studio',
    loadChildren: () => import('./components/studio/studio.module').then(m => m.StudioModule)
  },
  {
    path: 'dj-deck',
    loadChildren: () => import('./components/dj-deck/dj-deck.module').then(m => m.DjDeckModule)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
