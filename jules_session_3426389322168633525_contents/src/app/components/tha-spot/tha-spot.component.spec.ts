import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThaSpotComponent } from './tha-spot.component';
import { GameLibraryService, Game } from '../../services/game-library.service';
import { DomSanitizer } from '@angular/platform-browser';
import { of } from 'rxjs';

class MockGameLibraryService {
  getGames(): Game[] {
    return [
      { id: '1', title: 'Test Game 1', description: 'Test Desc 1', imageUrl: 'url1', embedUrl: 'embed1' },
      { id: '2', title: 'Test Game 2', description: 'Test Desc 2', imageUrl: 'url2', embedUrl: 'embed2' }
    ];
  }
}

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;
  let gameLibraryService: GameLibraryService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThaSpotComponent],
      providers: [
        { provide: GameLibraryService, useClass: MockGameLibraryService },
        { provide: DomSanitizer, useValue: { bypassSecurityTrustResourceUrl: (url: string) => url } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ThaSpotComponent);
    component = fixture.componentInstance;
    gameLibraryService = TestBed.inject(GameLibraryService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load games and set a featured game on init', () => {
    expect(component.games.length).toBe(2);
    expect(component.featuredGame).toBe(component.games[0]);
  });

  it('should select a game when selectGame is called', () => {
    const game = component.games[1];
    component.selectGame(game);
    expect(component.selectedGame).toBe(game);
  });

  it('should close the game viewer when closeGame is called', () => {
    component.selectGame(component.games[0]);
    expect(component.selectedGame).toBeDefined();
    component.closeGame();
    expect(component.selectedGame).toBeUndefined();
  });

  it('should return a safe URL when getSafeGameUrl is called', () => {
    const game = component.games[0];
    component.selectGame(game);
    const url = component.getSafeGameUrl();
    expect(url).toBe(game.embedUrl);
  });
});
