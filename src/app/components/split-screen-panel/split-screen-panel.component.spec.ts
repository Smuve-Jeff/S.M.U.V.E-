import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SplitScreenPanelComponent } from './split-screen-panel.component';
import { Game } from '../../hub/game';
import { GameService } from '../../hub/game.service';
import { MatchmakingService } from '../../hub/matchmaking.service';
import { ShareableInviteService } from '../../services/shareable-invite.service';
import { GamepadService } from '../../services/gamepad.service';
import { HapticService } from '../../services/haptic.service';
import { NotificationService } from '../../services/notification.service';

describe('SplitScreenPanelComponent', () => {
  let component: SplitScreenPanelComponent;
  let fixture: ComponentFixture<SplitScreenPanelComponent>;

  const activeSplitLobby = signal<{
    id: string;
    gameId: string;
    gameName: string;
    hostId: string;
    guestId: string;
    role: 'host' | 'guest';
    status: 'lobby' | 'ready' | 'in-progress' | 'ended';
    created: number;
  } | null>(null);
  const latestSnapshots = signal<Record<string, any>>({});

  const matchmakingMock = {
    activeSplitLobby,
    latestSplitScreenSnapshots: latestSnapshots,
    exitSplitScreen: jest.fn(),
    pushSplitScreenSnapshot: jest.fn(),
  };

  const gameSvcMock = {
    buildIframeSandbox: jest.fn(() => 'allow-scripts'),
    buildIframeAllowAttr: jest.fn(() => 'autoplay'),
  };

  const inlineGame = (): Game =>
    ({
      id: 'rg-12345-demo-game',
      name: 'Demo Racer',
      url: 'https://www.retrogames.cc/embed/12345-demo-game.html',
      launchConfig: {
        embedMode: 'inline',
        approvedEmbedUrl:
          'https://www.retrogames.cc/embed/12345-demo-game.html',
      },
    }) as Game;

  const externalGame = (): Game =>
    ({
      id: 'chess-com-online',
      name: 'Chess.com',
      url: 'https://www.chess.com/play/online',
      launchConfig: {
        embedMode: 'external-only',
        approvedExternalUrl: 'https://www.chess.com/play/online',
      },
    }) as Game;

  beforeEach(async () => {
    activeSplitLobby.set(null);
    latestSnapshots.set({});
    await TestBed.configureTestingModule({
      imports: [SplitScreenPanelComponent],
      providers: [
        { provide: MatchmakingService, useValue: matchmakingMock },
        { provide: GameService, useValue: gameSvcMock },
        {
          provide: ShareableInviteService,
          useValue: {
            buildPublicShareUrl: jest.fn(() => 'https://smuve.test/share'),
            copy: jest.fn(),
            nativeShare: jest.fn(),
          },
        },
        {
          provide: GamepadService,
          useValue: { connectedGamepad: jest.fn(() => null) },
        },
        { provide: HapticService, useValue: { medium: jest.fn() } },
        { provide: NotificationService, useValue: { show: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SplitScreenPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders inline cabinets with a trusted iframe src', () => {
    fixture.componentRef.setInput('game', inlineGame());
    fixture.detectChanges();
    expect(component.inlineUnavailable()).toBe(false);
    const trusted = component.trustedIframeUrl();
    expect(trusted).not.toBeNull();
    expect(
      (trusted as any)?.changingThisBreaksApplicationSecurity
    ).toContain('12345-demo-game');
    expect(gameSvcMock.buildIframeSandbox).toHaveBeenCalled();
    expect(gameSvcMock.buildIframeAllowAttr).toHaveBeenCalled();
    // NG0910 forbids template-binding sandbox/allow — verify they were
    // applied imperatively to the rendered frame.
    const frame = fixture.nativeElement.querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame?.getAttribute('allow')).toBe('autoplay');
  });

  it('refuses to iframe external-only cabinets and offers an external launch', () => {
    fixture.componentRef.setInput('game', externalGame());
    fixture.detectChanges();
    expect(component.trustedIframeUrl()).toBeNull();
    expect(component.inlineUnavailable()).toBe(true);
    expect(component.externalLaunchUrl()).toBe(
      'https://www.chess.com/play/online'
    );

    const openSpy = jest
      .spyOn(window, 'open')
      .mockImplementation(() => null);
    component.openExternally();
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.chess.com/play/online',
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('prefers the registered peer slot when picking the peer snapshot', () => {
    activeSplitLobby.set({
      id: 'split_x',
      gameId: 'rg-12345-demo-game',
      gameName: 'Demo Racer',
      hostId: 'host-1',
      guestId: 'guest-2',
      role: 'host',
      status: 'ready',
      created: 1,
    });
    // A stale snapshot from an old peer must lose to the live peer's frame.
    latestSnapshots.set({
      'old-peer': { score: 9, level: 'LV_09', progress: 90 },
      'guest-2': { score: 7, level: 'LV_02', progress: 42 },
    });
    fixture.detectChanges();
    expect(component.peerSnapshot()?.score).toBe(7);
    expect(component.peerSnapshot()?.level).toBe('LV_02');
  });

  it('shows no cabinet state when the game input is missing', () => {
    expect(component.trustedIframeUrl()).toBeNull();
    expect(component.inlineUnavailable()).toBe(false);
    expect(component.externalLaunchUrl()).toBe('');
  });
});