import { TestBed } from '@angular/core/testing';
import { PeerNetworkingService } from './peer-networking.service';
import { SocialNetworkingService } from './social-networking.service';

describe('PeerNetworkingService', () => {
  let service: PeerNetworkingService;
  let socialMock: { sendVoiceSignal: jest.Mock };

  beforeEach(() => {
    socialMock = { sendVoiceSignal: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        PeerNetworkingService,
        { provide: SocialNetworkingService, useValue: socialMock },
      ],
    });
    service = TestBed.inject(PeerNetworkingService);
  });

  it('knocks on the target user when a call starts', () => {
    service.startCall('peer-1');

    expect(socialMock.sendVoiceSignal).toHaveBeenCalledWith('peer-1', {
      type: 'KNOCK',
    });
    expect(service.isCallActive()).toBe(true);
    expect(service.callState()).toBe('calling');
  });

  it('expires an unanswered knock so the UI never hangs on "calling"', () => {
    jest.useFakeTimers();
    try {
      service.startCall('peer-1');
      expect(service.callState()).toBe('calling');

      // 15s in — still unanswered, still calling.
      jest.advanceTimersByTime(15_000);
      expect(service.callState()).toBe('calling');

      // Past the 30s expiry — the knock must reset cleanly.
      jest.advanceTimersByTime(15_001);
      expect(service.callState()).toBe('idle');
      expect(service.isCallActive()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops the timeout once the callee accepts the knock', async () => {
    jest.useFakeTimers();
    try {
      // KNOCK_ACCEPTED triggers an RTCPeerConnection path we cannot run in
      // jsdom — simulate the failure branch and confirm the timer cleared.
      service.startCall('peer-1');
      const initSpy = jest
        .spyOn(service as any, 'initializePeerConnection')
        .mockRejectedValue(new Error('no webrtc'));
      await service.handleSignal('peer-1', { type: 'KNOCK_ACCEPTED' });
      initSpy.mockRestore();

      // No new timeout may have been armed; advancing well past 30s must not
      // flip state since the flow already failed to idle/failed.
      jest.advanceTimersByTime(40_000);
      expect(service.isCallActive()).toBe(false);
      expect(service.callState()).toBe('failed');
    } finally {
      jest.useRealTimers();
    }
  });

  it('notifies the caller with KNOCK_DECLINED when the callee declines', () => {
    service.handleSignal('peer-1', { type: 'KNOCK' });
    expect(service.isKnocking()).toBe(true);
    expect(service.knockFromUserId()).toBe('peer-1');

    service.declineKnock();

    expect(socialMock.sendVoiceSignal).toHaveBeenCalledWith('peer-1', {
      type: 'KNOCK_DECLINED',
    });
    expect(service.isKnocking()).toBe(false);
    expect(service.knockFromUserId()).toBeNull();
    expect(service.callState()).toBe('idle');
  });
});
