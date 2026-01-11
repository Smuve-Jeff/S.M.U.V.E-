
import { Routes } from '@angular/router';
import { HubComponent } from './hub.component';
import { LobbyComponent } from './lobby/lobby.component';

export const HUB_ROUTES: Routes = [
    { path: '', component: HubComponent },
    { path: 'lobby/:gameId', component: LobbyComponent },
    { path: 'lobby/:gameId/:lobbyId', component: LobbyComponent }, // For private lobbies
];
