import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Make knobs larger on mobile and improve touch sensitivity
patch_file('src/app/studio/shared/knob/knob.component.ts',
    r'\.knob-outer \{.*?width: 52px;.*?height: 52px;',
    r'.knob-outer {\n        width: 64px;\n        height: 64px;')

patch_file('src/app/studio/shared/knob/knob.component.ts',
    r'@media \(max-width: 640px\) \{.*?\.knob-outer \{.*?width: 48px;.*?height: 48px;.*?\}',
    r'@media (max-width: 1024px) {\n        .knob-outer {\n          width: 72px;\n          height: 72px;\n        }\n        .knob-label {\n          font-size: 10px;\n        }\n      }')

# Adjust sensitivity for better control
patch_file('src/app/studio/shared/knob/knob.component.ts',
    r'const sensitivity = 200;',
    r'const isMobile = window.innerWidth <= 1024;\n    const sensitivity = isMobile ? 350 : 200;')

print("Knobs refined for mobile/Elite status.")
