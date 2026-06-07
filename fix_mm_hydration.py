import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Ensure drum track exists after hydration
patch_file('src/app/services/music-manager.service.ts',
    r'if \(typeof project\.tempo === \'number\'\) \{.*?this\.engine\.applyProductionParameter\(\'0\', \'tempo\', project\.tempo\);.*?\}',
    r"if (typeof project.tempo === 'number') {\n      this.engine.applyProductionParameter('0', 'tempo', project.tempo);\n    }\n    this.ensureDrumTrack();")

print("MusicManager hydration patch applied.")
