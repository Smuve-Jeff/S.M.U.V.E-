import os
import re

def patch_user_context():
    file_path = 'src/app/services/user-context.service.ts'
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
    with open(file_path, 'r') as f:
        content = f.read()

    content = content.replace(
        'samplerPads: new Array(8).fill(null),',
        'samplerPads: { drums: new Array(8).fill(null), fx: new Array(8).fill(null), vocals: new Array(8).fill(null) },'
    )

    if 'automixEnabled = signal(false);' not in content:
        content = content.replace('export class DeckService {', 'export class DeckService {\n  automixEnabled = signal(false);')

    if 'category: \'drums\' | \'fx\' | \'vocals\' = \'drums\'' not in content:
        content = re.sub(
            r'setSamplerPad\(deck: DeckId, slot: number, category: \'drums\' \| \'fx\' \| \'vocals\' = \'drums\', position\?:\ number\) \{',
            'REPLACE_ME_SET_SAMPLER',
            content
        )
        # Handle the case where it didn't match the whole string or was already partially patched
        content = content.replace('setSamplerPad(deck: DeckId, slot: number, position?: number) {', 'setSamplerPad(deck: DeckId, slot: number, category: \'drums\' | \'fx\' | \'vocals\' = \'drums\', position?: number) {')
        content = content.replace('REPLACE_ME_SET_SAMPLER', 'setSamplerPad(deck: DeckId, slot: number, category: \'drums\' | \'fx\' | \'vocals\' = \'drums\', position?: number) {')

    if 'category: \'drums\' | \'fx\' | \'vocals\' = \'drums\'' not in content.split('toggleCue')[0]: # Just a quick check
        content = content.replace('clearSamplerPad(deck: DeckId, slot: number) {', 'clearSamplerPad(deck: DeckId, slot: number, category: \'drums\' | \'fx\' | \'vocals\' = \'drums\') {')

    # Fix the samplerPad update logic that was using d.samplerPads as an array
    content = re.sub(
        r'const samplerPads = \[\.\.\.d\.samplerPads\];',
        'const samplerPads = { ...d.samplerPads };\n      samplerPads[category] = [...samplerPads[category]];',
        content
    )

    with open(file_path, 'w') as f:
        f.write(content)

def patch_audio_engine():
    file_path = 'src/app/services/audio-engine.service.ts'
    with open(file_path, 'r') as f:
        current = f.read()

    # Move helpers to the top of the class for availability
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

    # Fix unterminated template literals or invalid characters
    current = current.replace('this.logger.info(`Applying param ${parameter} to ${trackId}`);', 'this.logger.info("Applying param " + parameter + " to " + trackId);')
    current = current.replace('this.logger.info(`Output device changed to ${deviceId}`);', 'this.logger.info("Output device changed to " + deviceId);')
    # Remove any rogue backticks that might have been left from failed regexes
    current = re.sub(r'info\(\s*`', 'info("', current)
    current = re.sub(r'\${(.*?)}', r'" + \1 + "', current)
    current = re.sub(r'`);', '");', current)

    with open(file_path, 'w') as f:
        f.write(current)

patch_user_context()
patch_deck_service()
patch_audio_engine()
