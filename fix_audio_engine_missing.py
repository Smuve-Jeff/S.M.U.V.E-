import re

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add setSaturation and setupSaturation
if 'public setSaturation(amount: number)' not in content:
    methods = """
  public setSaturation(amount: number) {
    this.setupSaturation(amount);
  }

  private setupSaturation(amount: number) {
    const k = amount * 100;
    const n = 256;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.saturationNode.curve = curve;
  }
"""
    content = content.replace('private setupMasterChain() {', methods + '\n  private setupMasterChain() {')

# Add setMasterOutputLevel
if 'setMasterOutputLevel(normalized: number)' not in content:
    content = content.replace('getContext() {', 'setMasterOutputLevel(normalized: number) {\n    this.masterGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.01);\n  }\n\n  getContext() {')

# Add triggerAttack
if 'triggerAttack(' not in content:
    trigger_attack = """
  triggerAttack(
    trackId: number,
    freq: number,
    when: number,
    velocity: number,
    duration: number,
    gain: number,
    pan: number,
    sendA: number,
    sendB: number,
    synthParams: any,
    velocityScale: number = 1,
    customCtx?: BaseAudioContext
  ) {
    const ctx = customCtx || this.ctx;
    this.resume();
    const osc = ctx.createOscillator();
    const vca = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter();
    osc.type = synthParams.type || 'sine';
    osc.frequency.setValueAtTime(freq, when);
    if (synthParams.detune) osc.detune.setValueAtTime(synthParams.detune, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(synthParams.cutoff || 20000, when);
    filter.Q.setValueAtTime(synthParams.q || 1, when);
    const actualVel = velocity * velocityScale;
    const attack = synthParams.attack || 0.005;
    const release = synthParams.release || 0.1;
    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(actualVel * gain, when + attack);
    vca.gain.setValueAtTime(actualVel * gain, when + duration);
    vca.gain.exponentialRampToValueAtTime(0.001, when + duration + release);
    panner.pan.setValueAtTime(pan, when);

    let subOsc: OscillatorNode | null = null;
    if (this.performanceTier() === 'ultra' && (osc.type === 'sawtooth' || osc.type === 'square')) {
      subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq / 2, when);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(actualVel * gain * 0.3, when);
      subOsc.connect(subGain).connect(vca);
      subOsc.start(when);
      subOsc.stop(when + duration + release + 0.1);
    }
    const dest = customCtx ? (customCtx as any).destination : this.masterGain;
    osc.connect(filter).connect(vca).connect(panner).connect(dest);
    osc.start(when);
    osc.stop(when + duration + release + 0.1);
  }
"""
    content = content.replace('initDeck(id: DeckId) {', trigger_attack + '\n  initDeck(id: DeckId) {')

with open(file_path, 'w') as f:
    f.write(content)
