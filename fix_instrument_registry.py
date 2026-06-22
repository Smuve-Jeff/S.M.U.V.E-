import sys

file_path = 'src/app/studio/instrument-registry.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the condition to properly identify drum tracks
old_cond = "if (trackId === 'DRUM_TRACK' || type === 'drum') {"
new_cond = "if (trackId === MusicManagerService.DRUM_TRACK_ID || type === 'drum') {"

# Add MusicManagerService import
import_line = "import { FileLoaderService } from '../services/file-loader.service';\nimport { MusicManagerService } from '../services/music-manager.service';"

if old_cond in content:
    content = content.replace(old_cond, new_cond)
    content = content.replace("import { FileLoaderService } from '../services/file-loader.service';", import_line)
    with open(file_path, 'w') as f:
        f.write(content)
    print("Fixed InstrumentRegistryService to use MusicManagerService.DRUM_TRACK_ID")
else:
    print("Could not find the target condition in InstrumentRegistryService")
