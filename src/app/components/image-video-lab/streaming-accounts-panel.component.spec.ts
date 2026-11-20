import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { BroadcastIngestService } from '../../services/broadcast-ingest.service';
import { StreamingPlatformsService } from '../../services/streaming-platforms.service';
import { StreamingAccountsPanelComponent } from './streaming-accounts-panel.component';

describe('StreamingAccountsPanelComponent', () => {
  let fixture: ComponentFixture<StreamingAccountsPanelComponent>;
  let component: StreamingAccountsPanelComponent;
  let connections: ReturnType<typeof signal<Record<string, { displayName?: string }>>>;
  let destinations: ReturnType<
    typeof signal<
      Record<
        string,
        {
          ready?: boolean;
          verification?: 'verified' | 'unverified' | 'not-applicable';
        }
      >
    >
  >;
  let platforms: {
    connections: typeof connections;
    connecting: ReturnType<typeof signal<string | null>>;
    connect: jest.Mock;
    sync: jest.Mock;
    disconnect: jest.Mock;
  };
  let ingest: {
    platforms: Array<{ id: string; label: string }>;
    destinations: typeof destinations;
    checkError: ReturnType<typeof signal<string | null>>;
    ready: (id: string) => boolean;
    verified: (id: string) => boolean;
    platformLabel: (id: string) => string;
    load: jest.Mock;
  };

  const labels: Record<string, string> = {
    twitch: 'TWITCH',
    kick: 'KICK',
    facebook: 'FACEBOOK',
    custom: 'TikTok Live',
    custom2: 'CUSTOM 2',
    custom3: 'CUSTOM 3',
    custom4: 'CUSTOM 4',
  };

  beforeEach(async () => {
    connections = signal({});
    destinations = signal({});
    platforms = {
      connections,
      connecting: signal<string | null>(null),
      connect: jest.fn(),
      sync: jest.fn(async () => true),
      disconnect: jest.fn(async () => undefined),
    };
    ingest = {
      platforms: Object.keys(labels).map((id) => ({ id, label: labels[id] })),
      destinations,
      checkError: signal<string | null>(null),
      ready: (id: string) => !!destinations()[id]?.ready,
      verified: (id: string) => destinations()[id]?.verification === 'verified',
      platformLabel: (id: string) => labels[id] ?? id,
      load: jest.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [StreamingAccountsPanelComponent],
      providers: [
        provideRouter([]),
        { provide: StreamingPlatformsService, useValue: platforms },
        { provide: BroadcastIngestService, useValue: ingest },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamingAccountsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('reads the shared account and relay state from both services', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('TWITCH');
    expect(text).toContain('NOT LINKED');
    expect(text).toContain('RTMP UNSET');
    expect(text).toContain('CUSTOM RTMP');
    expect(text).toContain('NO SLOTS SET');
  });

  it('shows a linked name and a ready destination', () => {
    connections.set({ twitch: { displayName: 'SmuveJeff' } });
    destinations.set({
      kick: { ready: true, verification: 'verified' },
      custom: { ready: true, verification: 'unverified' },
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('LINKED · SmuveJeff');
    expect(text).toContain('RTMP VERIFIED');
    expect(text).toContain('RTMP UNVERIFIED');
    expect(text).toContain('SET · TikTok Live');
  });

  it('connects through the shared platform service and refreshes destinations', async () => {
    await component.connect(component.rows()[0]);

    expect(platforms.connect).toHaveBeenCalledWith('twitch');
    expect(ingest.load).toHaveBeenCalledTimes(1);
  });

  it('links to the complete Settings → Streaming setup', () => {
    const link = fixture.nativeElement.querySelector(
      '.accounts-link'
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/settings/streaming');
  });

  it('re-syncs both the account list and the destinations', async () => {
    await component.resync();

    expect(platforms.sync).toHaveBeenCalledTimes(1);
    expect(ingest.load).toHaveBeenCalledTimes(1);
    expect(component.resyncing()).toBe(false);
  });

  it('requires a second click before disconnecting an account', async () => {
    connections.set({ twitch: { displayName: 'SmuveJeff' } });
    fixture.detectChanges();
    const row = component.rows().find((entry) => entry.id === 'twitch')!;

    await component.disconnect(row);
    expect(platforms.disconnect).not.toHaveBeenCalled();
    expect(component.pendingDisconnect()).toBe('twitch');

    await component.disconnect(row);
    expect(platforms.disconnect).toHaveBeenCalledWith('twitch');
    expect(ingest.load).toHaveBeenCalledTimes(1);
    expect(component.pendingDisconnect()).toBeNull();
  });

  it('does not offer disconnect for an unlinked account', async () => {
    const row = component.rows().find((entry) => entry.id === 'twitch')!;

    await component.disconnect(row);

    expect(platforms.disconnect).not.toHaveBeenCalled();
    expect(component.pendingDisconnect()).toBeNull();
  });
});
