import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveChatComponent } from './live-chat.component';
import { LiveVideoService } from '../../services/live-video.service';

describe('LiveChatComponent', () => {
  let fixture: ComponentFixture<LiveChatComponent>;
  let component: LiveChatComponent;
  let live: {
    chatMessages: ReturnType<typeof signal<Array<Record<string, unknown>>>>;
    chatAvailable: ReturnType<typeof signal<boolean>>;
    sendLiveChat: jest.Mock;
  };

  beforeEach(() => {
    live = {
      chatMessages: signal([]),
      chatAvailable: signal(true),
      sendLiveChat: jest.fn(() => true),
    };
    TestBed.configureTestingModule({
      imports: [LiveChatComponent],
      providers: [{ provide: LiveVideoService, useValue: live }],
    });
    fixture = TestBed.createComponent(LiveChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders live-room messages from the service', () => {
    live.chatMessages.set([
      {
        id: 'chat-1',
        fromUserId: 'viewer-1',
        fromUserName: 'Viewer One',
        message: 'what is good',
        timestamp: 1,
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Viewer One');
    expect(fixture.nativeElement.textContent).toContain('what is good');
  });

  it('sends only a non-empty message and clears the draft', () => {
    component.draft.set('  hello room  ');
    component.send();

    expect(live.sendLiveChat).toHaveBeenCalledWith('hello room');
    expect(component.draft()).toBe('');

    live.sendLiveChat.mockReturnValueOnce(false);
    component.draft.set('retry me');
    component.send();
    expect(component.draft()).toBe('retry me');
  });

  it('does not send while live chat is unavailable', () => {
    live.chatAvailable.set(false);
    component.draft.set('hello');
    component.send();

    expect(live.sendLiveChat).not.toHaveBeenCalled();
  });
});
