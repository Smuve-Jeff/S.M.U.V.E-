import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
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
        provideRouter([]),
        {
          provide: StreamingPlatformsService,
          useValue: {
            connections: signal({}),
            connecting: signal<string | null>(null),
            connect: jest.fn(),
            sync: jest.fn(async () => true),
            disconnect: jest.fn(async () => undefined),
            facebookPages: signal([]),
            loadingFacebookPages: signal(false),
            selectingFacebookPage: signal(false),
            facebookPagesError: signal<string | null>(null),
            facebookSelectedPageId: () => '',
            facebookPagePickerVisible: () => false,
            selectFacebookPage: jest.fn(async () => true),
            loadFacebookPages: jest.fn(async () => undefined),
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
            verified: () => false,
            verification: () => 'not-applicable',
            verifiedAt: () => null,
            platformLabel: (id: string) => labels[id] ?? 'CUSTOM 1',
            load: jest.fn(async () => undefined),
            saveDestination: jest.fn(async () => true),
            clearDestination: jest.fn(async () => true),
            testingDestination: signal(null),
            destinationTest: () => ({ status: 'idle', detail: '', at: null }),
            testDestination: jest.fn(async () => true),
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
    expect(panel?.textContent).toContain('TWITCH');
    expect(panel?.textContent).toContain('YOUTUBE');
    expect(panel?.textContent).toContain('KICK');
    expect(panel?.textContent).toContain('FACEBOOK');
    // The page is the settings destination, so the panel must not link to itself.
    expect(fixture.nativeElement.querySelector('.accounts-link')).toBeNull();
  });

  it('includes the RTMP editor so the page is the complete setup path', () => {
    const editor = fixture.nativeElement.querySelector(
      'app-rtmp-destinations-editor'
    ) as HTMLElement | null;
    expect(editor).not.toBeNull();
    expect(editor?.textContent).toContain('RTMP Destinations');
    expect(editor?.textContent).toContain('KICK');
    expect(editor?.textContent).toContain('FACEBOOK');
    expect(editor?.textContent).toContain('CUSTOM 4');
  });

  it('links back to Settings and out to both broadcast surfaces', () => {
    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a')
    ).map((link) => (link as HTMLAnchorElement).getAttribute('href'));

    expect(hrefs).toContain('/settings');
    expect(hrefs).toContain('/image-video-lab');
    expect(hrefs).toContain('/tha-spot');
  });

  it('explains where account links and RTMP keys live', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('The complete streaming setup');
    expect(text).toContain('Keys are write-only');
  });
});
