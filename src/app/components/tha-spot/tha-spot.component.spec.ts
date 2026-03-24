import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThaSpotComponent } from './tha-spot.component';
import { provideRouter } from '@angular/router';
import { API_KEY_TOKEN } from '../../services/ai.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ThaSpotComponent', () => {
  let component: ThaSpotComponent;
  let fixture: ComponentFixture<ThaSpotComponent>;

  beforeEach(async () => {
    // Mock AudioContext
    const mockAudioParam = {
      value: 0,
      setTargetAtTime: function () {
        return this;
      },
      setValueAtTime: function () {
        return this;
      },
      linearRampToValueAtTime: function () {
        return this;
      },
      exponentialRampToValueAtTime: function () {
        return this;
      },
    };

    const mockNode = {
      connect: function (target: any) {
        return target;
      },
      disconnect: function () {
        return this;
      },
      gain: mockAudioParam,
      frequency: mockAudioParam,
      Q: mockAudioParam,
      threshold: mockAudioParam,
      knee: mockAudioParam,
      ratio: mockAudioParam,
      attack: mockAudioParam,
      release: mockAudioParam,
      pan: mockAudioParam,
      delayTime: mockAudioParam,
      playbackRate: mockAudioParam,
      start: function () {
        return this;
      },
      stop: function () {
        return this;
      },
      buffer: null,
    };

    (window as any).AudioContext = class {
      createGain() {
        return { ...mockNode };
      }
      createOscillator() {
        return { ...mockNode };
      }
      createDynamicsCompressor() {
        return { ...mockNode };
      }
      createDelay() {
        return { ...mockNode };
      }
      createBiquadFilter() {
        return { ...mockNode };
      }
      createAnalyser() {
        return { ...mockNode, getByteFrequencyData: () => {} };
      }
      createConvolver() {
        return { ...mockNode };
      }
      createStereoPanner() {
        return { ...mockNode };
      }
      createBufferSource() {
        return { ...mockNode };
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(100) };
      }
      get destination() {
        return { connect: () => {}, disconnect: () => {} };
      }
      get currentTime() {
        return 0;
      }
      get sampleRate() {
        return 44100;
      }
    };
    (window as any).webkitAudioContext = (window as any).AudioContext;
    (globalThis as any).indexedDB = {
      open: () => {
        const request: any = {};
        setTimeout(() => {
          request.result = {
            objectStoreNames: { contains: () => true },
            createObjectStore: () => {},
          };
          request.onsuccess?.({ target: { result: request.result } });
        }, 0);
        return request;
      },
    };

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

  it('should switch tabs', () => {
    component.setActiveTab('Multiplayer');
    expect(component.activeTab()).toBe('Multiplayer');

    component.setActiveTab('AI Arena');
    expect(component.activeTab()).toBe('AI Arena');
  });

  it('should add chat message', () => {
    const initialCount = component.chatMessages().length;
    component.newChatMessage = 'Hello Test';
    component.sendChatMessage();
    expect(component.chatMessages().length).toBe(initialCount + 1);
    expect(
      component.chatMessages()[component.chatMessages().length - 1].text
    ).toBe('Hello Test');
    expect(component.newChatMessage).toBe('');
  });

  it('should filter AI multiplayer games with query and rating sort', () => {
    component.games.set([
      {
        id: 'g1',
        name: 'AI Duel One',
        url: 'https://example.com/1',
        genre: 'Strategy',
        rating: 4.5,
        playersOnline: 100,
        tags: ['Multiplayer', 'AI'],
      },
      {
        id: 'g2',
        name: 'AI Duel Two',
        url: 'https://example.com/2',
        genre: 'Strategy',
        rating: 4.9,
        playersOnline: 80,
        tags: ['Multiplayer', 'AI'],
      },
      {
        id: 'g3',
        name: 'Classic Solo',
        url: 'https://example.com/3',
        genre: 'Classic',
        rating: 5,
        playersOnline: 10,
        tags: ['Single Player'],
      },
    ]);

    component.setActiveTab('AI Arena');
    component.setCapabilityFilter('Multiplayer');
    component.searchQuery.set('duel');
    component.setSortMode('Rating');

    expect(component.filteredGames().map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('should map visual quality mode class', () => {
    component.setVisualQuality('Performance');
    expect(component.qualityModeClass()).toBe('quality-performance');

    component.setVisualQuality('Ultra');
    expect(component.qualityModeClass()).toBe('quality-ultra');
  });

  it('should only start matchmaking for multiplayer games', () => {
    const multiplayerGame = {
      id: 'm1',
      name: 'Team Up',
      url: 'https://example.com/m1',
      tags: ['Multiplayer'],
    };
    const soloGame = {
      id: 's1',
      name: 'Solo Run',
      url: 'https://example.com/s1',
      tags: ['Single Player'],
    };

    const matchmakingSpy = jest.spyOn(component, 'startMatchmaking');
    component.playGame(multiplayerGame as any);
    expect(matchmakingSpy).toHaveBeenCalledWith(multiplayerGame);

    component.playGame(soloGame as any);
    expect(component.currentGame()).toEqual(soloGame);
  });

  it('should block non-https and non-local game urls', () => {
    const safeBlocked = component.getSafeUrl('javascript:alert(1)');
    expect((safeBlocked as any).changingThisBreaksApplicationSecurity).toBe(
      'about:blank'
    );
  });
});
