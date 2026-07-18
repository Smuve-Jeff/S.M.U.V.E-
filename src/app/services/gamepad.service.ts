import { Injectable, signal, NgZone, inject } from '@angular/core';

export interface GamepadState {
  connected: boolean;
  id: string;
  buttons: boolean[];
  axes: number[];
}

export enum GamepadButton {
  A = 0,
  B = 1,
  X = 2,
  Y = 3,
  LB = 4,
  RB = 5,
  LT = 6,
  RT = 7,
  SELECT = 8,
  START = 9,
  L_STICK_CLICK = 10,
  R_STICK_CLICK = 11,
  DPAD_UP = 12,
  DPAD_DOWN = 13,
  DPAD_LEFT = 14,
  DPAD_RIGHT = 15,
  HOME = 16,
}

@Injectable({ providedIn: 'root' })
export class GamepadService {
  private zone = inject(NgZone);

  connectedGamepad = signal<GamepadState | null>(null);

  // High-level signals for easier UI consumption
  lastButtonPressed = signal<number | null>(null);
  dpadX = signal<number>(0);
  dpadY = signal<number>(0);

  private rafId?: number;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', (e: any) =>
        this.onGamepadConnected(e)
      );
      window.addEventListener('gamepaddisconnected', (e: any) =>
        this.onGamepadDisconnected(e)
      );

      // Check for already connected gamepads
      const gps = navigator.getGamepads();
      if (gps[0]) this.startPolling();
    }
  }

  private onGamepadConnected(e: GamepadEvent) {
    this.startPolling();
  }

  private onGamepadDisconnected(e: GamepadEvent) {
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
            const buttons = gp.buttons.map((b) => b.pressed);
            const axes = [...gp.axes];

            this.connectedGamepad.set({
              connected: true,
              id: gp.id,
              buttons,
              axes,
            });

            // Detect last button pressed
            buttons.forEach((pressed, idx) => {
              if (pressed && this.lastButtonPressed() !== idx) {
                this.lastButtonPressed.set(idx);
              }
            });

            // Map D-Pad from buttons 12-15 (Standard mapping)
            let dx = 0;
            let dy = 0;
            if (buttons[GamepadButton.DPAD_LEFT]) dx = -1;
            if (buttons[GamepadButton.DPAD_RIGHT]) dx = 1;
            if (buttons[GamepadButton.DPAD_UP]) dy = -1;
            if (buttons[GamepadButton.DPAD_DOWN]) dy = 1;

            // Fallback to Stick 0 if D-Pad buttons are not used (Some controllers)
            if (dx === 0 && Math.abs(axes[0]) > 0.5) dx = Math.sign(axes[0]);
            if (dy === 0 && Math.abs(axes[1]) > 0.5) dy = Math.sign(axes[1]);

            this.dpadX.set(dx);
            this.dpadY.set(dy);
          });
        }
        this.rafId = requestAnimationFrame(poll);
      };
      this.rafId = requestAnimationFrame(poll);
    });
  }

  isButtonPressed(button: GamepadButton): boolean {
    const state = this.connectedGamepad();
    return state ? !!state.buttons[button] : false;
  }
}
