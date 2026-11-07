import { Injectable, signal } from "@angular/core";
import { BehaviorSubject, Subject } from "rxjs";

/** A MIDI input as exposed by Web MIDI or the Android bridge. */
export interface MidiInputRef {
  id: string;
  name: string;
  manufacturer: string;
  native: boolean;
}

export interface MidiInputMessage {
  /** Raw status + data bytes, copied off the platform callback. */
  data: number[];
  source: MidiInputRef;
}

export interface MidiInputBusState {
  /** At least one MIDI input transport (Web MIDI or native) is open. */
  available: boolean;
  /** The Android bridge is the active transport. */
  native: boolean;
  inputs: MidiInputRef[];
}

const EMPTY_STATE: MidiInputBusState = {
  available: false,
  native: false,
  inputs: [],
};

/**
 * One fan-out point for platform MIDI input.
 *
 * Android's native bridge can only deliver messages through a single callback.
 * Without this bus, the hardware service's callback shadows the DJ/performer
 * handlers, so a controller paired over USB/BLE could play the piano roll while
 * MIDI learn and the performer silently saw nothing. Publishing native input
 * here lets every consumer observe the same controller without fighting over
 * the bridge, and gives the clock a native fallback on WebViews that have no
 * Web MIDI implementation.
 */
@Injectable({ providedIn: "root" })
export class MidiInputBusService {
  private readonly messagesSubject = new Subject<MidiInputMessage>();
  private readonly stateSubject = new BehaviorSubject<MidiInputBusState>(
    EMPTY_STATE,
  );
  private readonly stateSignal = signal<MidiInputBusState>(EMPTY_STATE);

  readonly messages$ = this.messagesSubject.asObservable();
  readonly state = this.stateSignal.asReadonly();
  readonly state$ = this.stateSubject.asObservable();

  publishMessage(data: ArrayLike<number>, source: MidiInputRef): void {
    if (!data || data.length === 0) return;
    this.messagesSubject.next({
      data: Array.from(data, (byte) => Number(byte) & 0xff),
      source,
    });
  }

  publishState(state: Partial<MidiInputBusState>): void {
    const next = {
      ...this.stateSignal(),
      ...state,
      inputs: state.inputs ? [...state.inputs] : this.stateSignal().inputs,
    };
    this.stateSignal.set(next);
    this.stateSubject.next(next);
  }

  reset(): void {
    this.stateSignal.set(EMPTY_STATE);
    this.stateSubject.next(EMPTY_STATE);
  }
}
