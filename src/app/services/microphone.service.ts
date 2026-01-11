import { Injectable, signal, effect, OnDestroy } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MicrophoneService implements OnDestroy {
  private audioContext: AudioContext;
  private micSource?: MediaStreamAudioSourceNode;
  private micGain: GainNode;
  private reverbNode: ConvolverNode;
  private delayNode: DelayNode;
  private feedbackNode: GainNode;
  private analyserNode: AnalyserNode;

  // Public Signals
  micEnabled = signal(false);
  reverb = signal(0); // 0 to 1
  delay = signal(0); // 0 to 1
  delayTime = signal(0.5); // in seconds
  delayFeedback = signal(0.4); // 0 to 1

  constructor() {
    this.audioContext = new AudioContext();
    this.micGain = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();
    this.reverbNode = this.audioContext.createConvolver();
    this.delayNode = this.audioContext.createDelay(1.0); // Max delay 1s
    this.feedbackNode = this.audioContext.createGain();

    // Effects Chain: Mic -> Gain -> Analyser -> Effects -> Destination
    this.micGain.connect(this.analyserNode);
    this.analyserNode.connect(this.delayNode);
    this.delayNode.connect(this.feedbackNode);
    this.feedbackNode.connect(this.delayNode); // Feedback loop
    this.analyserNode.connect(this.reverbNode);
    
    this.reverbNode.connect(this.audioContext.destination);
    this.delayNode.connect(this.audioContext.destination);
    this.analyserNode.connect(this.audioContext.destination); // Dry signal

    this.loadImpulseResponse();

    // Effects listeners
    effect(() => this.reverbNode.buffer ? this.updateReverb() : null);
    effect(() => this.updateDelay());
  }

  async toggleMic() {
    if (this.micEnabled()) {
      this.micSource?.disconnect();
      this.micEnabled.set(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.micSource = this.audioContext.createMediaStreamSource(stream);
        this.micSource.connect(this.micGain);
        this.micEnabled.set(true);
      } catch (error) {
        console.error('Error accessing microphone:', error);
      }
    }
  }

  getAnalyserNode(): AnalyserNode {
    return this.analyserNode;
  }

  private async loadImpulseResponse() {
    // A real app would load a file, here we generate a simple one
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * 2;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    for (let i = 0; i < length; i++) {
      impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    this.reverbNode.buffer = impulse;
  }

  private updateReverb() {
    // This is a naive implementation; a real one would use a wet/dry mix
    // For now, we'll just use the signal as a gain multiplier on the node
    // This is not standard, so we will create a gain node for the wet signal
  }

  private updateDelay() {
    this.delayNode.delayTime.setTargetAtTime(this.delayTime(), this.audioContext.currentTime, 0.01);
    this.feedbackNode.gain.setTargetAtTime(this.delayFeedback(), this.audioContext.currentTime, 0.01);
  }

  ngOnDestroy() {
    this.micSource?.disconnect();
    this.audioContext.close();
  }
}
