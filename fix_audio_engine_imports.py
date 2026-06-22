import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

# Remove duplicate Injectable/signal/inject/Injector import if present
new_lines = []
seen_angular_core = False
for line in lines:
    if 'from \'@angular/core\'' in line:
        if seen_angular_core:
            continue
        seen_angular_core = True
    new_lines.append(line)

# Add SamplerEngine and FileLoaderService imports
import_block = "import { SamplerEngine } from '../studio/sampler-engine';\nimport { FileLoaderService } from './file-loader.service';\n"
new_lines.insert(5, import_block)

# Fix duplicate injector inject
final_lines = []
seen_injector = False
for line in new_lines:
    if 'private injector = inject(Injector);' in line:
        if seen_injector:
            continue
        seen_injector = True
    final_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(final_lines)
print("Cleaned up imports and added SamplerEngine/FileLoaderService")
