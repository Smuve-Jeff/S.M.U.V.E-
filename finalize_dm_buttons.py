import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# DrumMachineComponent: Ensure the 'AI' and 'Evolution' buttons are prominent
patch_file('src/app/studio/drum-machine/drum-machine.component.html',
    r'\(click\)=\"aiDrumGen\(\)\"',
    r'(click)="aiDrumGen()" class="tactile-v42 px-4 py-2 bg-fl-blue text-black font-black rounded-lg"')

print("Drum Machine AI button enhanced.")
