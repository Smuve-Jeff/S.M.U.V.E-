import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UplinkConsoleComponent } from './uplink-console.component';
import { UplinkService, type UplinkStatus } from '../../services/uplink.service';

describe('UplinkConsoleComponent', () => {
  let status: ReturnType<typeof signal<UplinkStatus>>;
  let initiateUplink: jest.Mock;

  const build = () => TestBed.createComponent(UplinkConsoleComponent);

  beforeEach(() => {
    status = signal<UplinkStatus>({
      stage: 'failed',
      progress: 40,
      message: 'TRANSMISSION SEVERED',
      logs: [],
      error: 'GENRE_UNDEFINED',
    });
    initiateUplink = jest.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [UplinkConsoleComponent],
      providers: [
        {
          provide: UplinkService,
          useValue: { status: status.asReadonly(), initiateUplink },
        },
      ],
    });
  });

  it('re-runs the uplink with the host payload when a commit failed', async () => {
    const component = build().componentInstance;
    const payload = { artistName: 'Nova', primaryGenre: 'Electronic' } as any;
    component.retryPayload = signal(payload) as any;

    await component.onComplete();

    expect(initiateUplink).toHaveBeenCalledWith(payload);
  });

  it('closes instead of retrying when the host supplied no payload', async () => {
    const component = build().componentInstance;
    const closed = jest.fn();
    component.close.subscribe(closed);
    component.retryPayload = signal(null) as any;

    await component.onComplete();

    expect(initiateUplink).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closes on a completed transmission without retrying', async () => {
    const component = build().componentInstance;
    const closed = jest.fn();
    component.close.subscribe(closed);
    component.retryPayload = signal({ artistName: 'Nova' }) as any;
    status.set({
      stage: 'complete',
      progress: 100,
      message: 'Transmission Secure',
      logs: [],
    });

    await component.onComplete();

    expect(initiateUplink).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
