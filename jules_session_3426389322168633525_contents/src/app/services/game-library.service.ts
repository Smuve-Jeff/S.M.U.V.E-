import { Injectable } from '@angular/core';

export interface Game {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  embedUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class GameLibraryService {

  constructor() { }

  getGames(): Game[] {
    return [
      {
        id: '1',
        title: '2048',
        description: 'Join the numbers and get to the 2048 tile!',
        imageUrl: 'https://img.poki.com/cdn-cgi/image/quality=78,width=600,height=600,fit=cover,f=auto/b12a02b3-d232-4114-b15f-9720f1f14894.png',
        embedUrl: 'https://play2048.co/'
      },
      {
        id: '2',
        title: 'Pac-Man',
        description: 'Eat all the dots and avoid the ghosts in this classic arcade game.',
        imageUrl: 'https://img.poki.com/cdn-cgi/image/quality=78,width=600,height=600,fit=cover,f=auto/d9925232-a56f-420a-995a-f11b4028562d.png',
        embedUrl: 'https://www.google.com/fbx?fbx=pacman'
      },
      {
        id: '3',
        title: 'Slither.io',
        description: 'Play against other people online! Can you become the longest slither?',
        imageUrl: 'https://img.poki.com/cdn-cgi/image/quality=78,width=600,height=600,fit=cover,f=auto/700851e2-1845-4b53-a131-b84439c0d1e5.png',
        embedUrl: 'http://slither.io/'
      },
       {
        id: '4',
        title: 'Krunker',
        description: 'Krunker.io is a fast-paced pixelated first-person shooter.',
        imageUrl: 'https://img.poki.com/cdn-cgi/image/quality=78,width=600,height=600,fit=cover,f=auto/51010720-f193-4a24-9192-f705177baf73.png',
        embedUrl: 'https://krunker.io/'
      },
      {
        id: '5',
        title: 'Shell Shockers',
        description: 'Shell Shockers is a multiplayer .io FPS game featuring eggs armed with guns.',
        imageUrl: 'https://img.poki.com/cdn-cgi/image/quality=78,width=600,height=600,fit=cover,f=auto/c3b069d2-5b12-49de-8728-7657b98a3b2c.png',
        embedUrl: 'https://shellshock.io/'
      }
    ];
  }
}
