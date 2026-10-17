import { LoggingService } from './logging.service';
import { Injectable, signal, inject } from '@angular/core';

/**
 * Why voice input can (or cannot) work on this device right now.
 *
 * The Web Speech API is not one capability but several: the constructor can
 * exist while capture is still impossible because the page is served over
 * plain http, because Permissions-Policy forbids the microphone, because the
 * artist blocked it, or because the shell has no speech service at all
 * (an Android WebView, which is what the packaged app runs in). Reporting a
 * single "supported" boolean made the widget's mic look alive and then do
 * nothing, so capability is modelled explicitly.
 */
export type VoiceInputCapability =
  | 'ready'
  | 'unsupported'
  | 'native-shell'
  | 'insecure-context'
  | 'policy-blocked'
  | 'permission-denied'
  | 'no-microphone';

export interface VoiceInputError {
  /** Raw engine code (`not-allowed`, `no-speech`, …) or a capability code. */
  code: string;
  /** Human, actionable sentence the widget shows the artist. */
  message: string;
}

const CAPABILITY_MESSAGES: Record<VoiceInputCapability, string> = {
  ready: 'Voice input ready.',
  unsupported:
    'This browser has no speech recognition. Type your command, or open S.M.U.V.E. in Chrome or Safari.',
  'native-shell':
    "Dictation isn't available inside the mobile app shell. Type your command here, or open S.M.U.V.E. in Chrome to dictate.",
  'insecure-context':
    'Voice input needs a secure (https) connection. Reopen S.M.U.V.E. over https to dictate.',
  'policy-blocked':
    'This page is not allowed to use the microphone. Voice input is disabled here.',
  'permission-denied':
    'Microphone access is blocked. Allow the microphone for this site (browser lock icon → Microphone → Allow), then tap the mic again.',
  'no-microphone':
    'No microphone was found. Connect an input device and try again.',
};

/** Engine error codes that mean "the browser refused the microphone". */
const DENIED_CODES = ['not-allowed', 'service-not-allowed', 'permission-denied'];

@Injectable({
  providedIn: 'root',
})
export class SpeechRecognitionService {
  private logger = inject(LoggingService);
  isListening = signal(false);
  isSupported = signal(false);
  /** Current capability. `ready` and `permission-denied` can both be retried. */
  capability = signal<VoiceInputCapability>('unsupported');
  /** Last normalized failure, for the UI to render. Cleared on a new start. */
  lastError = signal<VoiceInputError | null>(null);
  private speechRecognition: SpeechRecognition | null = null;

  constructor() {
    this.initialize();
  }

  /** True unless the engine explicitly reports an insecure context. */
  private get trustedContext(): boolean {
    if (typeof window === 'undefined') return false;
    return (window as any).isSecureContext !== false;
  }

  /** Permissions-Policy can forbid the microphone for the whole document. */
  private get microphoneAllowedByPolicy(): boolean {
    if (typeof document === 'undefined') return true;
    const doc = document as any;
    const policy = doc.permissionsPolicy ?? doc.featurePolicy;
    if (!policy || typeof policy.allowsFeature !== 'function') return true;
    try {
      return policy.allowsFeature('microphone') !== false;
    } catch {
      return true;
    }
  }

  /** Capacitor shells (the packaged Android/iOS app) have no speech engine. */
  private get isNativeShell(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window as any).Capacitor?.isNativePlatform?.();
  }

  private initialize() {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      // A native shell is a different fix from a browser that lacks the API,
      // so it gets its own message instead of the generic "unsupported".
      this.capability.set(this.isNativeShell ? 'native-shell' : 'unsupported');
      this.logger.warn('Speech recognition is unavailable in this browser.');
      return;
    }

    // The API exists: the browser *could* dictate, so `isSupported` is true and
    // `capability` records what is actually blocking capture (context, policy,
    // permission). The widget keeps its mic pressable in those states so the
    // artist gets the reason instead of a dead button.
    this.isSupported.set(true);

    if (!this.trustedContext) {
      this.capability.set('insecure-context');
      this.logger.warn('Speech recognition requires a secure context to capture.');
      return;
    }

    if (!this.microphoneAllowedByPolicy) {
      this.capability.set('policy-blocked');
      this.logger.warn('Permissions-Policy denies microphone access to this page.');
      return;
    }

    try {
      const speechRecognition = new SpeechRecognitionConstructor() as SpeechRecognition;
      speechRecognition.continuous = false;
      speechRecognition.interimResults = false;
      // Dictation follows the device language instead of assuming en-US; a
      // mismatched language is the usual cause of "it never hears me".
      try {
        speechRecognition.lang =
          (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        speechRecognition.maxAlternatives = 1;
      } catch {
        // Older engines expose read-only attributes; defaults are fine.
      }
      this.speechRecognition = speechRecognition;
      this.capability.set('ready');
      void this.refreshPermissionState();
    } catch (error) {
      this.capability.set('unsupported');
      this.isSupported.set(false);
      this.logger.error('Could not initialize speech recognition', error);
    }
  }

  /**
   * Re-read the browser's microphone permission. Only an explicit `denied`
   * downgrades capability: an engine without the Permissions API, or one that
   * refuses the `microphone` descriptor, must stay usable.
   */
  async refreshPermissionState(): Promise<VoiceInputCapability> {
    if (!this.isSupported()) return this.capability();
    try {
      const permissions = (navigator as any)?.permissions;
      if (!permissions?.query) return this.capability();
      const status = await permissions.query({ name: 'microphone' });
      if (status?.state === 'denied') {
        this.capability.set('permission-denied');
      } else if (this.capability() === 'permission-denied') {
        // The artist unblocked the mic while the widget was open.
        this.capability.set('ready');
        this.lastError.set(null);
      }
    } catch {
      // Unsupported descriptor (Safari) or no Permissions API — keep the
      // capability the engine already proved.
    }
    return this.capability();
  }

  /** Human, actionable sentence for the current capability. */
  capabilityMessage(): string {
    if (this.capability() === 'permission-denied' && this.lastError()) {
      return this.lastError()!.message;
    }
    return CAPABILITY_MESSAGES[this.capability()];
  }

  /**
   * Whether starting dictation can do anything useful. A blocked microphone
   * still returns true: asking again is exactly how the artist re-grants it.
   */
  canListen(): boolean {
    return (
      this.isSupported() &&
      (this.capability() === 'ready' ||
        this.capability() === 'permission-denied')
    );
  }

  /** True once the browser has blocked the microphone for this page. */
  isBlocked(): boolean {
    return this.capability() === 'permission-denied';
  }

  /**
   * Ask the platform for the microphone (getUserMedia). This is the only path
   * that makes the browser prompt *and* turns a denial into a specific reason
   * instead of a silent no-op from the recognition engine.
   */
  async requestMicrophoneAccess(): Promise<boolean> {
    const mediaDevices = (navigator as any)?.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      // No permission API to ask through: let the recognition engine try.
      return true;
    }
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      if (this.capability() === 'permission-denied') this.capability.set('ready');
      this.lastError.set(null);
      return true;
    } catch (error: any) {
      const code = error?.name === 'NotFoundError' ? 'no-microphone' : 'permission-denied';
      this.capability.set(code);
      this.lastError.set({
        code,
        message: CAPABILITY_MESSAGES[code as VoiceInputCapability],
      });
      this.logger.error('Microphone access request failed', error);
      return false;
    }
  }

  startListening(
    onResult: (text: string) => void,
    onError?: (error: VoiceInputError) => void,
  ): void {
    const fail = (capability: VoiceInputCapability) => {
      const error: VoiceInputError = {
        code: capability,
        message: this.capabilityMessage(),
      };
      this.lastError.set(error);
      this.logger.error('Voice input is unavailable', error);
      onError?.(error);
    };

    if (!this.speechRecognition || !this.isSupported()) {
      fail(this.capability());
      return;
    }
    if (this.capability() === 'insecure-context') {
      fail('insecure-context');
      return;
    }
    if (this.capability() === 'policy-blocked') {
      fail('policy-blocked');
      return;
    }
    if (this.isListening()) return;

    // A blocked microphone is re-asked explicitly; on the normal path the
    // recognition engine raises the browser's own prompt, so capture still
    // starts synchronously inside the click that asked for it.
    if (this.capability() === 'permission-denied') {
      void this.requestMicrophoneAccess().then((granted) => {
        if (granted) this.beginCapture(onResult, onError);
        else
          onError?.(
            this.lastError() ?? {
              code: 'permission-denied',
              message: CAPABILITY_MESSAGES['permission-denied'],
            },
          );
      });
      return;
    }

    this.beginCapture(onResult, onError);
  }

  private beginCapture(
    onResult: (text: string) => void,
    onError?: (error: VoiceInputError) => void,
  ): void {
    const recognition = this.speechRecognition;
    if (!recognition || this.isListening()) return;

    let delivered = false;
    this.lastError.set(null);

    recognition.onresult = (event: { results: SpeechRecognitionResultList }) => {
      try {
        const result = event.results[event.results.length - 1];
        const transcript = result?.[0]?.transcript?.trim() ?? '';
        if (transcript) {
          delivered = true;
          onResult(transcript);
        }
      } catch (error) {
        this.logger.error('Could not read speech transcript', error);
      } finally {
        this.isListening.set(false);
      }
    };
    recognition.onend = () => {
      this.isListening.set(false);
      // Engines that hear nothing often end without an error event; without
      // this the mic looked like it worked and simply produced no words.
      if (!delivered && !this.lastError()) {
        const error: VoiceInputError = {
          code: 'no-speech',
          message: 'Nothing was heard. Tap the mic and speak again.',
        };
        this.lastError.set(error);
        onError?.(error);
      }
    };
    recognition.onerror = (event: { error: string }) => {
      this.isListening.set(false);
      const error = this.describeError(event?.error);
      if (event?.error === 'aborted') {
        // The artist stopped the capture on purpose — not a failure.
        return;
      }
      this.lastError.set(error);
      if (error.code === 'not-allowed') this.capability.set('permission-denied');
      if (error.code === 'audio-capture') this.capability.set('no-microphone');
      this.logger.error('Speech recognition error', event);
      onError?.(error);
    };

    try {
      recognition.start();
      this.isListening.set(true);
    } catch (error) {
      this.isListening.set(false);
      this.logger.error('Could not start speech recognition', error);
      const failure: VoiceInputError = {
        code: 'start-failed',
        message:
          'Dictation could not start. Check the microphone, then tap the mic again.',
      };
      this.lastError.set(failure);
      onError?.(failure);
    }
  }

  /** Map a raw engine error onto an actionable sentence. */
  private describeError(code: string | undefined): VoiceInputError {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return {
          code: 'not-allowed',
          message: CAPABILITY_MESSAGES['permission-denied'],
        };
      case 'audio-capture':
        return {
          code: 'audio-capture',
          message: CAPABILITY_MESSAGES['no-microphone'],
        };
      case 'network':
        return {
          code: 'network',
          message:
            'Dictation lost its connection to the speech service. Check the network and try again.',
        };
      case 'no-speech':
        return {
          code: 'no-speech',
          message: 'Nothing was heard. Tap the mic and speak again.',
        };
      case 'language-not-supported':
        return {
          code: 'language-not-supported',
          message:
            "This device can't dictate your language. Type your command instead.",
        };
      default:
        return {
          code: code || 'unknown',
          message: 'Dictation failed. Tap the mic and try again.',
        };
    }
  }

  stopListening(): void {
    if (this.speechRecognition && this.isListening()) {
      try {
        this.speechRecognition.stop();
      } catch (error) {
        this.logger.error('Could not stop speech recognition', error);
      } finally {
        this.isListening.set(false);
      }
    }
  }

  /** Hard stop that discards pending results (used on teardown). */
  abort(): void {
    const recognition = this.speechRecognition;
    if (!recognition) return;
    try {
      if (typeof recognition.abort === 'function') recognition.abort();
      else recognition.stop();
    } catch (error) {
      this.logger.error('Could not abort speech recognition', error);
    } finally {
      this.isListening.set(false);
    }
  }

  /** True when the raw engine error means the microphone was refused. */
  static isDeniedCode(code: string | undefined): boolean {
    return !!code && DENIED_CODES.includes(code);
  }
}
