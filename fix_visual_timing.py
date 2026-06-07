import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# AudioEngineService: Fix visualStep timing
patch_file('src/app/services/audio-engine.service.ts',
    r'this\.currentBeat\.set\(step / this\.stepsPerBeat\(\)\);\n      this\.visualStep\.set\(step\);',
    r"""const delay = Math.max(0, (this.nextNoteTime - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        this.currentBeat.set(step / this.stepsPerBeat());
        this.visualStep.set(step);
      }, delay);""")

print("Visual timing synchronization fixed.")
