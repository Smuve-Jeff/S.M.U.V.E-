import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BroadcastIngestService } from '../../services/broadcast-ingest.service';
import { StreamingPlatformsService } from '../../services/streaming-platforms.service';
import { StreamingSettingsComponent } from './streaming-settings.component';

const labels: Record<string, string> = {
  twitch: 'TWITCH',
  kick: 'KICK',
  facebook: 'FACEBOOK',
  custom: 'CUSTOM 1',
};

describe('StreamingSettingsComponent', () => {
  let fixture: ComponentFixture<StreamingSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StreamingSettingsComponent],
      providers: [
        {
          provide: StreamingPlatformsService,
          useValue: {
            connections: signal({}),
            connecting: signal<string | null>(null),
            connect: jest.fn(),
          },
        },
        {
          provide: BroadcastIngestService,
          useValue: {
            platforms: [
              { id: 'twitch', label: 'TWITCH' },
              { id: 'kick', label: 'KICK' },
              { id: 'facebook', label: 'FACEBOOK' },
              { id: 'custom', label: 'CUSTOM 1' },
            ],
            destinations: signal({}),
            checkError: signal<string | null>(null),
            ready: () => false,
            platformLabel: (id: string) => labels[id] ?? 'CUSTOM 1',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamingSettingsComponent);
    fixture.detectChanges();
  });

  it('wraps the shared streaming accounts panel', () => {
    const panel = fixture.nativeElement.querySelector(
      'app-streaming-accounts-panel'
    ) as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('Streaming Accounts');
    // The page is the settings destination, so the panel must not link to itself.
    expect(
      fixture.nativeElement.querySelector('.accounts-settings')
    ).toBeNull();
  });

  it('links back to Settings and out to both broadcast surfaces', () => {
    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a')
    ).map((link) => (link as HTMLAnchorElement).getAttribute('href'));

    expect(hrefs).toContain('/settings');
    expect(hrefs).toContain('/image-video-lab');
    expect(hrefs).toContain('/tha-spot');
    expect(hrefs).toContain('/tha-spot?panel=broadcast');
  });

  it('explains where account links and RTMP keys live', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('One account list feeds every broadcast surface');
    expect(text).toContain("Tha Spot's Broadcast Push config");
  });
});
