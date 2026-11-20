import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BroadcastIngestService } from '../../services/broadcast-ingest.service';
import { StreamingPlatformsService } from '../../services/streaming-platforms.service';
import { StreamingAccountsPanelComponent } from './streaming-accounts-panel.component';

describe('StreamingAccountsPanelComponent', () => {
  let fixture: ComponentFixture<StreamingAccountsPanelComponent>;
  let component: StreamingAccountsPanelComponent;
  let connections: ReturnType<typeof signal<Record<string, { displayName?: string }>>>;
  let destinations: ReturnType<typeof signal<Record<string, { ready?: boolean }>>>;
  let platforms: {
    connections: typeof connections;
    connecting: ReturnType<typeof signal<string | null>>;
    connect: jest.Mock;
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
    };
    const ingest = {
      platforms: Object.keys(labels).map((id) => ({ id, label: labels[id] })),
      destinations,
      checkError: signal<string | null>(null),
      ready: (id: string) => !!destinations()[id]?.ready,
      platformLabel: (id: string) => labels[id] ?? id,
    };

    await TestBed.configureTestingModule({
      imports: [StreamingAccountsPanelComponent],
      providers: [
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
    destinations.set({ kick: { ready: true }, custom: { ready: true } });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('LINKED · SmuveJeff');
    expect(text).toContain('RTMP READY');
    expect(text).toContain('SET · TikTok Live');
  });

  it('connects through the shared platform service', () => {
    component.connect(component.rows()[0]);
    expect(platforms.connect).toHaveBeenCalledWith('twitch');
  });

  it('links to the same Broadcast Push config Tha Spot opens', () => {
    const link = fixture.nativeElement.querySelector(
      '.accounts-link'
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/tha-spot?panel=broadcast');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('links to the shared Settings → Streaming page', () => {
    const link = fixture.nativeElement.querySelector(
      '.accounts-settings'
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/settings/streaming');
  });
});
