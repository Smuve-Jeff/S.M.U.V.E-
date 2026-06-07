import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# MusicManagerService.playStep: Use note-specific params
patch_file('src/app/services/music-manager.service.ts',
    r'notesToPlay\.forEach\(\(note\) => \{.*?const freq = this\.midiToFreq\(note\.midi\);.*?this\.engine\.triggerAttack\(.*?track\.pan,.*?track\.sendA,.*?track\.sendB,.*?track\.synthParams \|\| \{ type: \'sine\' \},.*?1,.*?customCtx.*?\);.*?\}\);',
    r"""notesToPlay.forEach((note) => {
        const freq = this.midiToFreq(note.midi);
        const synthParams = {
          ...(track.synthParams || { type: 'sine' }),
          ...(note.cutoff ? { cutoff: note.cutoff } : {})
        };
        this.engine.triggerAttack(
          track.id,
          freq,
          time,
          note.velocity,
          note.length * duration,
          track.gain,
          note.pan ?? track.pan,
          track.sendA,
          track.sendB,
          synthParams,
          1,
          customCtx
        );
      });""")

print("MusicManager playStep parameter override patched.")
