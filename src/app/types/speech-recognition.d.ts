declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognitionResultList {
  [index: number]: { [index: number]: { transcript: string } };
  length: number;
}

/**
 * The subset of the Web Speech API this app drives. `lang`, `maxAlternatives`
 * and `abort()` are part of the spec and are used to follow the device
 * language and to tear a capture down without delivering a partial transcript.
 */
interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: (event: { results: SpeechRecognitionResultList }) => void;
  onend: () => void;
  onerror: (event: { error: string; message?: string }) => void;
  start(): void;
  stop(): void;
  abort(): void;
}
