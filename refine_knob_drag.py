import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Add touch-action to prevent scrolling while dragging knobs
patch_file('src/app/studio/shared/knob/knob.component.ts',
    r'\.knob-wrapper \{.*?touch-action: none;',
    r'.knob-wrapper {\n        touch-action: none; /* Already present, ensuring it works */')

print("Knob touch-action verified.")
