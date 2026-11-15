interface ScreenCaptureFrame {
  data: string;
  width: number;
  height: number;
}

interface ScreenAudioChunk {
  data: string;
  sampleRate: number;
  channels: number;
}

interface ScreenCapturePlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(): Promise<{ width?: number; height?: number }>;
  stop(): Promise<void>;
  addListener(
    eventName: 'frame',
    listener: (frame: ScreenCaptureFrame) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'audio',
    listener: (chunk: ScreenAudioChunk) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'ended',
    listener: () => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

interface CapacitorGlobal {
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
}

const capacitorGlobal = (): CapacitorGlobal | undefined =>
  (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;

/** The packaged Android app, as opposed to Android's own browsers. */
export const isAndroidShell = (): boolean =>
  capacitorGlobal()?.getPlatform?.() === 'android';

/**
 * Whether screen capture must go through the native bridge.
 *
 * Android's WebView has no `getDisplayMedia`, while Chrome on the same device
 * does, so only the shell without it takes the MediaProjection path.
 */
export const nativeScreenCaptureAvailable = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  if (!isAndroidShell()) return false;
  if (typeof navigator.mediaDevices?.getDisplayMedia === 'function') {
    return false;
  }
  return capacitorGlobal()?.isPluginAvailable?.('ScreenCapture') === true;
};

const DEFAULT_SAMPLE_RATE = 24_000;
/** Peak amplitude below this counts as silence, not game audio. */
const AUDIO_SILENCE = 0.01;

/**
 * Android screen capture, bridged into real media tracks.
 *
 * MediaProjection frames arrive as JPEG payloads from the native plugin; drawing
 * them onto a canvas and calling `captureStream()` produces a video track the
 * normal host pipeline can publish like any other screen share. Frame rate and
 * size are capped on the native side because every frame crosses the JS bridge.
 *
 * Game audio arrives as PCM16 chunks and is rebuilt through WebAudio into a
 * second track, which rides the broadcast's system-audio slot. The slot carries
 * silence until the game actually makes a sound, so `hasGameAudio` reports real
 * signal rather than mere possession of a track.
 */
export class AndroidScreenCapture {
  /** Fires when the host stops sharing from the system control. */
  onEnded?: () => void;
  /** Fires the first time captured game audio actually carries signal. */
  onAudioDetected?: () => void;

  /** Whether captured playback has produced sound since this share started. */
  hasGameAudio = false;

  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private plugin: ScreenCapturePlugin | null = null;
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private nextAudioAt = 0;
  private frameHandle: { remove: () => Promise<void> } | null = null;
  private audioHandle: { remove: () => Promise<void> } | null = null;
  private endedHandle: { remove: () => Promise<void> } | null = null;
  private drawing = false;
  private active = false;

  /** The game-audio track, once a share has started. */
  get audioTrack(): MediaStreamTrack | null {
    return this.audioDestination?.stream.getAudioTracks()[0] ?? null;
  }

  async start(): Promise<MediaStream> {
    await this.stop();
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('SCREEN_CAPTURE_NO_CANVAS');

    const { registerPlugin } = await import('@capacitor/core');
    const plugin = registerPlugin<ScreenCapturePlugin>('ScreenCapture');
    this.canvas = canvas;
    this.context = context;
    this.plugin = plugin;
    this.active = true;
    this.hasGameAudio = false;
    this.frameHandle = await plugin.addListener('frame', (frame) => {
      void this.draw(frame);
    });
    this.audioHandle = await plugin.addListener('audio', (chunk) => {
      this.playAudio(chunk);
    });
    this.endedHandle = await plugin.addListener('ended', () => {
      void this.stop();
      this.onEnded?.();
    });
    this.stream = canvas.captureStream(12);
    await this.prepareAudio();
    try {
      await plugin.start();
    } catch (error) {
      await this.stop();
      throw error instanceof Error ? error : new Error('SCREEN_CAPTURE_FAILED');
    }
    return this.stream;
  }

  async stop(): Promise<void> {
    const wasActive = this.active;
    this.active = false;
    this.hasGameAudio = false;
    const handles = [this.frameHandle, this.audioHandle, this.endedHandle];
    this.frameHandle = null;
    this.audioHandle = null;
    this.endedHandle = null;
    for (const handle of handles) {
      try {
        await handle?.remove();
      } catch {
        /* the bridge may already be torn down */
      }
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.canvas = null;
    this.context = null;
    const audioContext = this.audioContext;
    this.audioContext = null;
    this.audioDestination = null;
    this.nextAudioAt = 0;
    if (audioContext) {
      try {
        await audioContext.close();
      } catch {
        /* already closed */
      }
    }
    const plugin = this.plugin;
    this.plugin = null;
    if (wasActive && plugin) {
      try {
        await plugin.stop();
      } catch {
        /* the service stops itself when the projection ends */
      }
    }
  }

  private async draw(frame: ScreenCaptureFrame): Promise<void> {
    if (!this.active || this.drawing || !frame?.data) return;
    const canvas = this.canvas;
    const context = this.context;
    if (!canvas || !context) return;
    this.drawing = true;
    try {
      const binary = atob(frame.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/jpeg' }),
      );
      if (!this.canvas || !this.context) {
        bitmap.close();
        return;
      }
      if (
        frame.width > 0 &&
        frame.height > 0 &&
        (canvas.width !== frame.width || canvas.height !== frame.height)
      ) {
        canvas.width = frame.width;
        canvas.height = frame.height;
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
    } catch {
      // A torn or late frame must never end a broadcast.
    } finally {
      this.drawing = false;
    }
  }

  /**
   * WebAudio cannot play a stream of chunks on its own, so each chunk is
   * scheduled just ahead of the previous one. A gap longer than the jitter
   * buffer re-seats the timeline instead of trying to catch up.
   */
  private async prepareAudio(): Promise<void> {
    try {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      this.audioContext = audioContext;
      this.audioDestination = destination;
      this.nextAudioAt = 0;
      if (audioContext.state !== 'running') {
        await audioContext.resume().catch(() => undefined);
      }
      if (audioContext.state !== 'running' && typeof window !== 'undefined') {
        // The switch was not inside a gesture chain; the next tap starts it.
        window.addEventListener(
          'pointerdown',
          () => {
            void audioContext.resume().catch(() => undefined);
          },
          { once: true },
        );
      }
    } catch {
      // No WebAudio here: the share still goes out with video and mic.
      this.audioContext = null;
      this.audioDestination = null;
    }
  }

  private playAudio(chunk: ScreenAudioChunk): void {
    const audioContext = this.audioContext;
    const destination = this.audioDestination;
    if (!this.active || !audioContext || !destination || !chunk?.data) return;
    const sampleRate =
      chunk.sampleRate > 0 ? chunk.sampleRate : DEFAULT_SAMPLE_RATE;
    const channels = chunk.channels > 0 ? chunk.channels : 1;
    try {
      const binary = atob(chunk.data);
      const samples = Math.floor(binary.length / 2);
      if (samples <= 0) return;
      const frames = Math.floor(samples / channels);
      if (frames <= 0) return;
      const buffer = audioContext.createBuffer(channels, frames, sampleRate);
      let peak = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        const channelData = buffer.getChannelData(channel);
        for (let frame = 0; frame < frames; frame += 1) {
          const index = frame * channels + channel;
          const low = binary.charCodeAt(index * 2);
          const high = binary.charCodeAt(index * 2 + 1);
          const signed = (high << 8) | low;
          const value = (signed >= 0x8000 ? signed - 0x10000 : signed) / 32768;
          channelData[frame] = value;
          const magnitude = Math.abs(value);
          if (magnitude > peak) peak = magnitude;
        }
      }
      if (!this.hasGameAudio && peak > AUDIO_SILENCE) {
        this.hasGameAudio = true;
        this.onAudioDetected?.();
      }
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      const now = audioContext.currentTime;
      // Schedule ahead, never in the past: a late chunk becomes a gap.
      if (this.nextAudioAt < now + 0.03) this.nextAudioAt = now + 0.12;
      source.start(this.nextAudioAt);
      this.nextAudioAt += buffer.duration;
    } catch {
      // A dropped chunk is a click, not a dead broadcast.
    }
  }
}

export const androidScreenCapture = new AndroidScreenCapture();
