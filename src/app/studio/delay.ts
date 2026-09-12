export class Delay {
  readonly input: GainNode;
  readonly delayNode: DelayNode;
  readonly feedbackGain: GainNode;
  readonly output: GainNode;

  /**
   * Tracked time (seconds) and feedback (0..1). Both are applied through
   * `setTargetAtTime`, so reading the AudioParams back returns the previous
   * value (and never settles offline) — the plugin layer needs the intent.
   */
  private _time = 0.5;
  private _feedback = 0.5;

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

  /** Current delay time in seconds. */
  get time(): number {
    return this._time;
  }

  /** Current feedback amount (0..1). */
  get feedback(): number {
    return this._feedback;
  }

  setDelayTime(time: number) {
    this._time = time;
    this.delayNode.delayTime.setTargetAtTime(
      time,
      this.context.currentTime,
      0.01
    );
  }

  setFeedback(feedback: number) {
    this._feedback = feedback;
    this.feedbackGain.gain.setTargetAtTime(
      feedback,
      this.context.currentTime,
      0.01
    );
  }

  connect(destination: AudioNode) {
    this.output.connect(destination);
  }

  disconnect() {
    this.output.disconnect();
  }
}
