import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ThaSpotComponent } from './tha-spot.component';
import { provideRouter } from '@angular/router';
import { API_KEY_TOKEN } from '../../services/ai.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThaSpotComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        {
          provide: API_KEY_TOKEN,
          useValue: 'MOCK_API_KEY_LONG_ENOUGH_FOR_TESTING',
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThaSpotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should switch gaming rooms', fakeAsync(() => {
    component.setActiveRoom('combat');
    tick(301);
    expect(component.activeRoom()).toBe('combat');
    expect(component.getActiveRoomName()).toBe('Combat');

    component.setActiveRoom('sports');
    tick(301);
    expect(component.activeRoom()).toBe('sports');
  }));

  it('should filter games based on active room', () => {
    component.games.set([
      {
        id: 'g1',
        name: 'Street Fighter',
        genre: 'Fighting',
        tags: ['Combat'],
        url: ''
      },
      {
        id: 'g2',
        name: 'FIFA',
        genre: 'Sports',
        tags: ['Soccer'],
        url: ''
      },
      {
        id: 'g3',
        name: 'Pacman',
        genre: 'Classic',
        tags: ['Retro'],
        url: ''
      }
    ]);

    component.activeRoom.set('combat');
    expect(component.filteredGames().length).toBe(1);
    expect(component.filteredGames()[0].name).toBe('Street Fighter');

    component.activeRoom.set('sports');
    expect(component.filteredGames().length).toBe(1);
    expect(component.filteredGames()[0].name).toBe('FIFA');

    component.activeRoom.set('classics');
    expect(component.filteredGames().length).toBe(1);
    expect(component.filteredGames()[0].name).toBe('Pacman');
  });

  it('should run neural matchmaking for multiplayer games', fakeAsync(() => {
    const multiplayerGame = {
      id: 'm1',
      name: 'Team Up',
      url: 'https://example.com/m1',
      tags: ['Multiplayer'],
    };

    component.playGame(multiplayerGame as any);
    expect(component.isMatchmaking()).toBe(true);

    // Progress through matchmaking
    tick(3000);
    tick(1500);

    expect(component.isMatchmaking()).toBe(false);
    expect(component.currentGame()?.id).toBe('m1');
    expect(component.matchedOpponent()).toContain('CYBER_EXECUTIVE');
  }));

  it('should launch solo games immediately', () => {
    const soloGame = {
      id: 's1',
      name: 'Solo Run',
      url: 'https://example.com/s1',
      tags: ['Single Player'],
    };

    component.playGame(soloGame as any);
    expect(component.isMatchmaking()).toBe(false);
    expect(component.currentGame()?.id).toBe('s1');
  });

  it('should generate gaming directives based on game type', () => {
    const strategyGame = {
      id: '19',
      name: 'Chess AI',
      genre: 'Strategy',
      url: ''
    };

    component.launchGame(strategyGame as any);
    expect(component.gamingDirectives()).toContain('ANALYZE BOARD DEPTH 4 PLIES AHEAD.');
  });
});
