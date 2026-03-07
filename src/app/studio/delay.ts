export class Delay {
  readonly input: GainNode;
  readonly delayNode: DelayNode;
  readonly feedbackGain: GainNode;
  readonly output: GainNode;

  constructor(private readonly context: AudioContext) {
    this.input = this.context.createGain();
    this.delayNode = this.context.createDelay();
    this.feedbackGain = this.context.createGain();
    this.output = this.context.createGain();

    this.delayNode.delayTime.value = 0.5;
    this.feedbackGain.gain.value = 0.5;

    this.input.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.output);
    this.input.connect(this.output); // Dry signal
  }

  setDelayTime(time: number) {
    this.delayNode.delayTime.setTargetAtTime(time, this.context.currentTime, 0.01);
  }

  setFeedback(feedback: number) {
    this.feedbackGain.gain.setTargetAtTime(feedback, this.context.currentTime, 0.01);
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }
}
