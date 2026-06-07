import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Restore the visual trigger effect in DrumMachineComponent
patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"// Logic moved to sequencer tick",
    r"""this.evolutionEffect = effect(() => {
      const step = this.currentStep();
      if (step < 0) return;
      const normalizedStep = this.normalizeStep(step);
      this.pads().forEach(pad => {
        if (pad.steps[normalizedStep]?.active) {
          this.markPadTriggered(pad.id);
        }
      });
    });""")

print("Drum Machine visual visuals restored.")
