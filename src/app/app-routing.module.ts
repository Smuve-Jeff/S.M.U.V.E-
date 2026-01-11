import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HubComponent } from './hub/hub.component';
import { LobbyComponent } from './hub/lobby/lobby.component';

const routes: Routes = [
  { path: '', redirectTo: '/hub', pathMatch: 'full' },
  { path: 'hub', component: HubComponent },
  { path: 'lobby/:gameId', component: LobbyComponent },
  { path: 'lobby/:gameId/:lobbyId', component: LobbyComponent }, // For private lobbies
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
