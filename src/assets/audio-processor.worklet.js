class SmuveAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.tempo = 120;
    this.stepsPerBeat = 4;
    this.isPlaying = false;
    this.nextNoteTime = 0;
    this.currentStep = 0;
    this.lookahead = 0.05; // 50ms lookahead

    this.port.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'START') {
        this.isPlaying = true;
        this.nextNoteTime = globalThis.currentTime;
      } else if (type === 'STOP') {
        this.isPlaying = false;
        this.currentStep = 0;
      } else if (type === 'RESET_STEP') {
        this.currentStep = 0;
      } else if (type === 'SET_TEMPO') {
        this.tempo = payload;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (this.isPlaying) {
      const stepDuration = 60 / this.tempo / this.stepsPerBeat;
      while (this.nextNoteTime < globalThis.currentTime + this.lookahead) {
        this.port.postMessage({
          type: 'TICK',
          payload: {
            step: this.currentStep,
            time: this.nextNoteTime,
            duration: stepDuration
          }
        });
        this.nextNoteTime += stepDuration;
        this.currentStep++;
      }
    }
    return true;
  }
}

registerProcessor('smuve-audio-processor', SmuveAudioProcessor);

