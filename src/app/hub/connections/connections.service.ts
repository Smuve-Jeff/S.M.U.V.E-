import { Injectable, signal } from '@angular/core';

export interface Connection {
  userId: string;
  handle: string;
  avatarUrl: string;
  status: 'online' | 'offline' | 'ingame';
}

@Injectable({
  providedIn: 'root',
})
export class ConnectionsService {
  connections = signal<Connection[]>([]);

  constructor() {
    // Mock data for now
    this.connections.set([
      {
        userId: '2',
        handle: 'PlayerOne',
        avatarUrl: 'https://picsum.photos/seed/playerone/100/100',
        status: 'online',
      },
      {
        userId: '3',
        handle: 'PlayerTwo',
        avatarUrl: 'https://picsum.photos/seed/playertwo/100/100',
        status: 'ingame',
      },
      {
        userId: '4',
        handle: 'PlayerThree',
        avatarUrl: 'https://picsum.photos/seed/playerthree/100/100',
        status: 'offline',
      },
    ]);
  }

  getConnections() {
    return this.connections;
  }

  addConnection(connection: Connection) {
    this.connections.update((c) => [...c, connection]);
  }

  removeConnection(userId: string) {
    this.connections.update((c) =>
      c.filter((connection) => connection.userId !== userId)
    );
  }
}
