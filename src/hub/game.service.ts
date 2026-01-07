import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import { Game } from './game';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private defaultGames: Game[] = [
   { id: 1, name: 'Babylon.js FPS', url: 'https://babylonjs-archive.github.io/simple-3d-fps/', image: 'https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/dist/preview release/gui/screenshots/fps.png' },
   { id: 2, name: 'HexGL', url: 'https://hexgl.bkcore.com/', image: 'https://i.ytimg.com/vi/126JgG24n-A/maxresdefault.jpg' },
   { id: 3, name: '3D Hartwig Chess', url: 'https://www.csszengarden.com/212', image: 'https://www.csszengarden.com/212/212.png' }
 ];

 games = signal<Game[]>([...this.defaultGames]);

 addGame(game: Omit<Game, 'id'>) {
   const newId = this.games().length > 0 ? Math.max(...this.games().map(g => g.id)) + 1 : 1;
   const newGame = { ...game, id: newId };
   this.games.update(games => [...games, newGame]);
 }
}
