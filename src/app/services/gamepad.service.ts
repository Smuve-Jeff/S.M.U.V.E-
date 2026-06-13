import { Injectable, signal, NgZone, inject } from '@angular/core';

export interface GamepadState {
  connected: boolean;
  id: string;
  buttons: boolean[];
  axes: number[];
}

@Injectable({ providedIn: 'root' })
export class GamepadService {
  private zone = inject(NgZone);

  connectedGamepad = signal<GamepadState | null>(null);
  private rafId?: number;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', (e: any) => this.onGamepadConnected(e));
      window.addEventListener('gamepaddisconnected', (e: any) => this.onGamepadDisconnected(e));
    }
  }

  private onGamepadConnected(e: GamepadEvent) {
    console.log('Elite controller linked:', e.gamepad.id);
    this.startPolling();
  }

  private onGamepadDisconnected(e: GamepadEvent) {
    console.log('Elite controller severed:', e.gamepad.id);
    this.connectedGamepad.set(null);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private startPolling() {
    this.zone.runOutsideAngular(() => {
      const poll = () => {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[0];
        if (gp) {
          this.zone.run(() => {
            this.connectedGamepad.set({
              connected: true,
              id: gp.id,
              buttons: gp.buttons.map(b => b.pressed),
              axes: [...gp.axes]
            });
          });
        }
        this.rafId = requestAnimationFrame(poll);
      };
      this.rafId = requestAnimationFrame(poll);
    });
  }
}
