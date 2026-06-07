import os
import re

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add setOutputDevice if missing
if 'setOutputDevice' not in content:
    methods_to_add = """
  async setOutputDevice(deviceId: string) {
    if (typeof (this.ctx as any).setSinkId === 'function') {
      await (this.ctx as any).setSinkId(deviceId);
      this.logger.info();
    } else {
      this.logger.warn('setSinkId not supported in this browser');
    }
  }
"""
    # Insert methods before the last closing brace
    content = content.rstrip()
    if content.endswith('}'):
        content = content[:-1] + methods_to_add + '\n}'

with open(file_path, 'w') as f:
    f.write(content)
