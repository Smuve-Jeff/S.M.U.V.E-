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

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: { results: SpeechRecognitionResultList }) => void;
  onend: () => void;
  onerror: (event: { error: string }) => void;
  start(): void;
  stop(): void;
}
