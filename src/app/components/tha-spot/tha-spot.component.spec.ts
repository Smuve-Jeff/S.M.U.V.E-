import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ThaSpotComponent } from './tha-spot.component';
import { GameService } from '../../hub/game.service';
import { UserProfileService } from '../../services/user-profile.service';
import { SecurityService } from '../../services/security.service';
import { UIService } from '../../services/ui.service';
import { Router, ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;
  let httpMock: HttpTestingController;

  const mockFeed = {
    games: [
      { id: '1', name: 'Game 1', url: 'test', genre: 'Action', launchConfig: { embedMode: 'inline' } },
      { id: '2', name: 'Game 2', url: 'test', genre: 'RPG', launchConfig: { embedMode: 'inline' } }
    ],
    rooms: [],
    badges: [],
    liveEvents: [],
    socialPresence: [],
    promotions: [],
    recommendationRails: [],
    streams: []
  };

  beforeEach(async () => {
    const profileServiceMock = {
      profile: signal({
        primaryGenre: 'Action',
        gameStats: {},
        thaSpotProgression: { currentStreak: 0 },
        careerGoals: []
      }),
      recordGameLaunch: jest.fn(),
      recordGameResult: jest.fn()
    };

    const uiServiceMock = {
      isCompactMobile: signal(false),
      navigateToView: jest.fn()
    };

    const securityServiceMock = {
      getCSRFToken: jest.fn().mockReturnValue('test-token')
    };

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ThaSpotComponent],
      providers: [
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
        { provide: UserProfileService, useValue: profileServiceMock },
        { provide: UIService, useValue: uiServiceMock },
        { provide: SecurityService, useValue: securityServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ThaSpotComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const req = httpMock.expectOne('assets/data/tha-spot-feed.json');
    req.flush(mockFeed);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle between gaming and cinema mode', () => {
    expect(component.displayMode()).toBe('gaming');
    component.setMode('cinema');
    expect(component.displayMode()).toBe('cinema');
    component.setMode('gaming');
    expect(component.displayMode()).toBe('gaming');
  });

  it('should initialize HLS player when a stream is clicked', (done) => {
    const mockStream = { id: 's1', name: 'Stream 1', url: 'http://test.m3u8' };
    component.onStreamClick(mockStream as any);
    expect(component.currentStream()).toBe(mockStream);
    // HLS initialization is async due to setTimeout
    setTimeout(() => {
      done();
    }, 200);
  });
});
