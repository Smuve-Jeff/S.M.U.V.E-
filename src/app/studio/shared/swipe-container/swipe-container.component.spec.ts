import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwipeContainerComponent } from './swipe-container.component';

@Component({
  standalone: true,
  imports: [SwipeContainerComponent],
  template: `<app-swipe-container
    (swipeLeft)="left = left + 1"
    (swipeRight)="right = right + 1"
  ></app-swipe-container>`,
})
class HostComponent {
  left = 0;
  right = 0;
}

describe('SwipeContainerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let component: SwipeContainerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    component = fixture.debugElement.children[0].componentInstance;
  });

  function touchEvent(type: 'touchstart' | 'touchend', x: number, y = 0): TouchEvent {
    const touch = { clientX: x, clientY: y } as Touch;
    return new TouchEvent(type, {
      bubbles: true,
      changedTouches: type === 'touchend' ? [touch] : [],
      touches: type === 'touchstart' ? [touch] : [],
    });
  }

  it('emits a horizontal swipe for a quick touch gesture', () => {
    const host = fixture.componentInstance;
    const container = fixture.nativeElement.querySelector('.swipe-container');

    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1100);
    container.dispatchEvent(touchEvent('touchstart', 10));
    container.dispatchEvent(touchEvent('touchend', 100));
    fixture.detectChanges();

    expect(host.right).toBe(1);
    expect(host.left).toBe(0);
    jest.restoreAllMocks();
  });

  it('removes the exact touch listeners on destroy', () => {
    const element = (component as any).container.nativeElement as HTMLElement;
    const removeSpy = jest.spyOn(element, 'removeEventListener');

    fixture.destroy();

    expect(removeSpy).toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
    );
    expect(removeSpy).toHaveBeenCalledWith(
      'touchend',
      expect.any(Function),
    );

    const startRemoval = removeSpy.mock.calls.find(([type]) => type === 'touchstart');
    const endRemoval = removeSpy.mock.calls.find(([type]) => type === 'touchend');
    expect(startRemoval?.[1]).toBe((component as any).boundTouchStart);
    expect(endRemoval?.[1]).toBe((component as any).boundTouchEnd);
  });
});
