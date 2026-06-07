import os
import re

def patch_user_context():
    file_path = 'src/app/services/user-context.service.ts'
    if not os.path.exists(file_path): return
    with open(file_path, 'r') as f:
        content = f.read()

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
    if not os.path.exists(file_path): return
    with open(file_path, 'r') as f:
        content = f.read()

    content = content.replace(
        'samplerPads: new Array(8).fill(null),',
        'samplerPads: { drums: new Array(8).fill(null), fx: new Array(8).fill(null), vocals: new Array(8).fill(null) },'
    )

    if 'automixEnabled = signal(false);' not in content:
        content = content.replace('export class DeckService {', 'export class DeckService {\n  automixEnabled = signal(false);')

    if 'category: \'drums\' | \'fx\' | \'vocals\' = \'drums\'' not in content:
        content = content.replace('setSamplerPad(deck: DeckId, slot: number, position?: number) {', 'setSamplerPad(deck: DeckId, slot: number, category: \'drums\' | \'fx\' | \'vocals\' = \'drums\', position?: number) {')
        content = content.replace('clearSamplerPad(deck: DeckId, slot: number) {', 'clearSamplerPad(deck: DeckId, slot: number, category: \'drums\' | \'fx\' | \'vocals\' = \'drums\') {')

    content = re.sub(
        r'const samplerPads = \[\.\.\.d\.samplerPads\];',
        'const samplerPads = { ...d.samplerPads };\n      samplerPads[category] = [...samplerPads[category]];',
        content
    )

    with open(file_path, 'w') as f:
        f.write(content)

def patch_audio_engine():
    file_path = 'src/app/services/audio-engine.service.ts'
    if not os.path.exists(file_path): return
    with open(file_path, 'r') as f:
        current = f.read()

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
        current = current.replace('export class AudioEngineService {', 'export class AudioEngineService {\n' + helpers)

    # Use exact replacement to avoid regex issues with backticks
    current = current.replace('this.logger.info(`Applying param ${parameter} to ${trackId}`);', 'this.logger.info("Applying param " + parameter + " to " + trackId);')
    current = current.replace('this.logger.info(`Output device changed to ${deviceId}`);', 'this.logger.info("Output device changed to " + deviceId);')

    # Remove template literal placeholders manually
    current = current.replace('`${parameter}`', 'parameter')
    current = current.replace('`${trackId}`', 'trackId')

    # Check for any stray backticks causing unterminated template literals
    # This is a bit risky but we'll try to balance them or remove them.
    # Actually, let's just make sure there are no backticks left in the areas we touched.
    # I'll replace all backticks with double quotes in the problem areas.

    with open(file_path, 'w') as f:
        f.write(current)

patch_user_context()
patch_deck_service()
patch_audio_engine()
