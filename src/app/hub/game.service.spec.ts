import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameService],
    });

    service = TestBed.inject(GameService);
  });

  it('should provide a curated mix of online and offline games', async () => {
    const games = await firstValueFrom(service.listGames());

    expect(games.length).toBeGreaterThanOrEqual(8);
    expect(games.some((game) => game.availability === 'Offline')).toBe(true);
    expect(games.some((game) => game.availability === 'Online')).toBe(true);
    expect(games.some((game) => game.url.startsWith('/assets/games/'))).toBe(true);
    expect(games.some((game) => game.name === 'Hextris')).toBe(true);
  });

  it('should return the newest curated games first when requested', async () => {
    const games = await firstValueFrom(service.listGames({}, 'Newest'));

    expect(games[0].id).toBe('32');
    expect(games[1].id).toBe('31');
  });
});
