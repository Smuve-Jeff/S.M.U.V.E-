import os
import re

def patch_user_context():
    file_path = 'src/app/services/user-context.service.ts'
    with open(file_path, 'r') as f:
        content = f.read()

    # Ensure DeckState has the correct samplerPads structure and new DJ fields
    if 'samplerPads: { drums: (number | null)[], fx: (number | null)[], vocals: (number | null)[] };' not in content:
        content = re.sub(
            r'samplerPads: \(number \| null\)\[\];',
            'samplerPads: { drums: (number | null)[], fx: (number | null)[], vocals: (number | null)[] };',
            content
        )

    fields = [
        "isCueing: boolean;",
        "fxAmount: number;",
        "activeFx: 'none' | 'flanger' | 'phaser' | 'delay';",
        "detectedBpm: number;"
    ]
    for field in fields:
        if field not in content:
            content = content.replace("vinylImageUrl?: string;", f"vinylImageUrl?: string;\n  {field}")

    # Update initialDeckState
    if 'samplerPads: { drums: new Array(8).fill(null), fx: new Array(8).fill(null), vocals: new Array(8).fill(null) },' not in content:
        content = re.sub(
            r'samplerPads: new Array\(8\)\.fill\(null\),',
            'samplerPads: { drums: new Array(8).fill(null), fx: new Array(8).fill(null), vocals: new Array(8).fill(null) },',
            content
        )

    init_fields = [
        "isCueing: false,",
        "fxAmount: 0,",
        "activeFx: 'none',",
        "detectedBpm: 0,"
    ]
    for field in init_fields:
        if field not in content:
            content = content.replace("vinylImageUrl: '',", f"vinylImageUrl: '',\n  {field}")

    with open(file_path, 'w') as f:
        f.write(content)

def patch_deck_service():
    file_path = 'src/app/services/deck.service.ts'
    with open(file_path, 'r') as f:
        content = f.read()

    # Ensure samplerPads initialization is correct in loadDeckBuffer
    content = content.replace(
        'samplerPads: new Array(8).fill(null),',
        'samplerPads: { drums: new Array(8).fill(null), fx: new Array(8).fill(null), vocals: new Array(8).fill(null) },'
    )

    # Ensure automixEnabled is present
    if 'automixEnabled = signal(false);' not in content:
        content = content.replace('export class DeckService {', 'export class DeckService {\n  automixEnabled = signal(false);')

    # Fix setSamplerPad signature if it's still using the old one
    if 'category: \'drums\' | \'fx\' | \'vocals\' = \'drums\'' not in content:
        content = re.sub(
            r'setSamplerPad\(deck: DeckId, slot: number, position\?:\ number\) \{',
            'setSamplerPad(deck: DeckId, slot: number, category: \'drums\' | \'fx\' | \'vocals\' = \'drums\', position?: number) {',
            content
        )

    # Fix clearSamplerPad signature
    if 'category: \'drums\' | \'fx\' | \'vocals\' = \'drums\'' not in content.split('setSamplerPad')[1]:
        content = re.sub(
            r'clearSamplerPad\(deck: DeckId, slot: number\) \{',
            'clearSamplerPad(deck: DeckId, slot: number, category: \'drums\' | \'fx\' | \'vocals\' = \'drums\') {',
            content
        )

    with open(file_path, 'w') as f:
        f.write(content)

def patch_audio_engine():
    # This is the big one. We need to merge everything correctly.
    file_path = 'src/app/services/audio-engine.service.ts'

    # We'll use the backup as a base for the missing DAW methods
    with open('audio_engine_backup.ts', 'r') as f:
        backup = f.read()

    with open(file_path, 'r') as f:
        current = f.read()

    # Extract methods from backup that are missing in current
    def get_method(name, content):
        match = re.search(r'(?:public |private |async |static )?' + name + r'\s*\([\s\S]*?\}\s*\}', content)
        if not match:
             match = re.search(r'(?:public |private |async |static )?' + name + r'\s*\([\s\S]*?\}\n', content)
        return match.group(0) if match else None

    # We need a cleaner approach. Let's rebuild the class.
    # Actually, let's just add the specific missing ones one by one carefully.

    # Add helper methods first
    helpers = """
  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private eqValueToDb(value: number) {
    return (this.clamp(value, 0, 2) - 1) * 18;
  }

  private getDeckPosition(deck: any) {
    const duration = deck.buffer?.duration || 0;
    if (!deck.isPlaying) {
      return this.clamp(deck.pauseOffset, 0, duration || deck.pauseOffset);
    }

    const elapsed =
      (this.ctx.currentTime - deck.startTime) *
      Math.max(0.05, Math.abs(deck.rate));
    if (deck.loopEnabled && duration > 0) {
      return ((deck.pauseOffset + elapsed) % duration + duration) % duration;
    }
    return this.clamp(deck.pauseOffset + elapsed, 0, duration || elapsed);
  }
"""
    if 'private clamp(' not in current:
        current = current.replace('constructor() {', helpers + '\n  constructor() {')

    # Add setOutputMode and getAnalyser
    if 'setOutputMode' not in current:
        current = current.replace('getContext() {', 'setOutputMode(mode: \'speakers\' | \'headphones\') {\n    this.outputMode.set(mode);\n  }\n\n  getAnalyser() {\n    return this.masterGain;\n  }\n\n  getContext() {')

    # Add setMasterOutputLevel if missing
    if 'setMasterOutputLevel' not in current:
        current = current.replace('getContext() {', 'setMasterOutputLevel(normalized: number) {\n    this.masterGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.01);\n  }\n\n  getContext() {')

    # Add setSaturation if missing
    if 'setSaturation' not in current:
        current = current.replace('private setupMasterChain() {', 'public setSaturation(amount: number) {\n    const k = amount * 100;\n    const n = 256;\n    const curve = new Float32Array(n);\n    const deg = Math.PI / 180;\n    for (let i = 0; i < n; i++) {\n      const x = (i * 2) / n - 1;\n      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));\n    }\n    this.saturationNode.curve = curve;\n  }\n\n  private setupMasterChain() {')

    # Add triggerAttack if missing
    if 'triggerAttack' not in current:
        # Simplified triggerAttack for now to avoid complexity
        ta = """
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
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(synthParams.cutoff || 20000, when);
    filter.Q.setValueAtTime(synthParams.q || 1, when);
    const actualVel = velocity * (velocityScale || 1);
    const attack = synthParams.attack || 0.005;
    const release = synthParams.release || 0.1;
    vca.gain.setValueAtTime(0, when);
    vca.gain.linearRampToValueAtTime(actualVel * gain, when + attack);
    vca.gain.setValueAtTime(actualVel * gain, when + duration);
    vca.gain.exponentialRampToValueAtTime(0.001, when + duration + release);
    panner.pan.setValueAtTime(pan, when);
    const dest = customCtx ? (customCtx as any).destination : this.masterGain;
    osc.connect(filter).connect(vca).connect(panner).connect(dest);
    osc.start(when);
    osc.stop(when + duration + release + 0.1);
  }
"""
        current = current.replace('initDeck(id: DeckId) {', ta + '\n  initDeck(id: DeckId) {')

    # Fix syntax errors in current (unterminated template literals from previous patch attempts)
    # Removing any stray backticks that seem to be causing issues
    current = current.replace('this.logger.info(`Applying param ${parameter} to ${trackId}`);', 'this.logger.info("Applying param " + parameter + " to " + trackId);')
    current = current.replace('this.logger.info(`Output device changed to ${deviceId}`);', 'this.logger.info("Output device changed to " + deviceId);')

    with open(file_path, 'w') as f:
        f.write(current)

patch_user_context()
patch_deck_service()
patch_audio_engine()
