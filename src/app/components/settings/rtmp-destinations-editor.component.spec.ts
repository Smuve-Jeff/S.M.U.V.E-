import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BroadcastIngestService } from '../../services/broadcast-ingest.service';
import { RtmpDestinationsEditorComponent } from './rtmp-destinations-editor.component';

describe('RtmpDestinationsEditorComponent', () => {
  let fixture: ComponentFixture<RtmpDestinationsEditorComponent>;
  let component: RtmpDestinationsEditorComponent;
  let destinations: ReturnType<
    typeof signal<Record<string, { ready?: boolean; detail?: string }>>
  >;
  let ingest: {
    platforms: Array<{ id: string; label: string }>;
    destinations: typeof destinations;
    ready: (id: string) => boolean;
    platformLabel: (id: string) => string;
    saveDestination: jest.Mock;
    clearDestination: jest.Mock;
  };

  beforeEach(async () => {
    destinations = signal({});
    ingest = {
      platforms: [
        { id: 'kick', label: 'KICK' },
        { id: 'facebook', label: 'FACEBOOK' },
        { id: 'custom', label: 'CUSTOM 1' },
        { id: 'custom2', label: 'CUSTOM 2' },
        { id: 'custom3', label: 'CUSTOM 3' },
        { id: 'custom4', label: 'CUSTOM 4' },
      ],
      destinations,
      ready: (id: string) => !!destinations()[id]?.ready,
      platformLabel: (id: string) =>
        ingest.platforms.find((platform) => platform.id === id)?.label ?? id,
      saveDestination: jest.fn(async () => true),
      clearDestination: jest.fn(async () => true),
    };

    await TestBed.configureTestingModule({
      imports: [RtmpDestinationsEditorComponent],
      providers: [{ provide: BroadcastIngestService, useValue: ingest }],
    }).compileComponents();

    fixture = TestBed.createComponent(RtmpDestinationsEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders a card for every manual destination', () => {
    const cards = fixture.nativeElement.querySelectorAll('.rtmp-card');
    expect(cards).toHaveLength(6);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('KICK');
    expect(text).toContain('FACEBOOK');
    expect(text).toContain('CUSTOM 1');
    expect(text).toContain('CUSTOM 4');
    expect(text).toContain('Stream keys are never read back');
  });

  it('saves a valid destination and clears the key from the form', async () => {
    component.setField('kick', 'rtmpUrl', 'rtmps://rtmp.kick.com/live');
    component.setField('kick', 'streamKey', 'KICK_KEY_123');

    await component.save('kick');

    expect(ingest.saveDestination).toHaveBeenCalledWith(
      'kick',
      'rtmps://rtmp.kick.com/live',
      'KICK_KEY_123',
      'KICK'
    );
    expect(component.field('kick', 'streamKey')).toBe('');
  });

  it('saves a named custom destination', async () => {
    component.setField('custom2', 'label', 'Instagram');
    component.setField('custom2', 'rtmpUrl', 'rtmps://instagram.example/live');
    component.setField('custom2', 'streamKey', 'IG_KEY');

    await component.save('custom2');

    expect(ingest.saveDestination).toHaveBeenCalledWith(
      'custom2',
      'rtmps://instagram.example/live',
      'IG_KEY',
      'Instagram'
    );
  });

  it('rejects an invalid URL or missing key before calling the server', async () => {
    component.setField('facebook', 'rtmpUrl', 'not-a-url');
    component.setField('facebook', 'streamKey', 'KEY');

    await component.save('facebook');
    expect(ingest.saveDestination).not.toHaveBeenCalled();
    expect(component.error('facebook')).toContain('RTMP OR RTMPS URL');

    component.setField('facebook', 'rtmpUrl', 'rtmps://facebook.example/live');
    component.setField('facebook', 'streamKey', '   ');

    await component.save('facebook');
    expect(ingest.saveDestination).not.toHaveBeenCalled();
    expect(component.error('facebook')).toContain('STREAM KEY');
  });

  it('requires a second click before clearing a saved destination', async () => {
    destinations.set({ kick: { ready: true, detail: 'KICK — ready' } });
    fixture.detectChanges();

    await component.clear('kick');
    expect(ingest.clearDestination).not.toHaveBeenCalled();
    expect(component.pendingClear()).toBe('kick');

    await component.clear('kick');
    expect(ingest.clearDestination).toHaveBeenCalledWith('kick');
    expect(component.pendingClear()).toBeNull();
  });
});
