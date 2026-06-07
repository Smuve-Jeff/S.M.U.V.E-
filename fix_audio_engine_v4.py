import re

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add missing helper methods
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
if 'private clamp(' not in content:
    content = content.replace('export class AudioEngineService {', 'export class AudioEngineService {\n' + helpers)

# Add missing public methods
missing_methods = """
  setMasterOutputLevel(normalized: number) {
    this.masterGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.01);
  }

  getAnalyser() {
      return this.masterGain;
  }

  setOutputMode(mode: 'speakers' | 'headphones') {
      this.outputMode.set(mode);
  }
"""
if 'setMasterOutputLevel' not in content:
    content = content.replace('getContext() {', missing_methods + '\n  getContext() {')

# Fix backtick issues (replace with double quotes)
# This handles the TS1127/TS1160 errors
content = content.replace('this.logger.info(`Applying param ${parameter} to ${trackId}`);', 'this.logger.info("Applying param " + parameter + " to " + trackId);')
content = content.replace('this.logger.info(`Output device changed to ${deviceId}`);', 'this.logger.info("Output device changed to " + deviceId);')

# Also check for other template literals in the class
content = content.replace('`INITIALIZING_NEURAL_UPLINK`', '"INITIALIZING_NEURAL_UPLINK"')
content = content.replace('`HARDENING_STRATEGIC_INFRASTRUCTURE`', '"HARDENING_STRATEGIC_INFRASTRUCTURE"')

with open(file_path, 'w') as f:
    f.write(content)
