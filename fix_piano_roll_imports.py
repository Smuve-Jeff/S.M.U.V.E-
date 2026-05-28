with open('src/app/studio/piano-roll/piano-roll.component.ts', 'r') as f:
    content = f.read()

if "import { AudioSessionService } from '../audio-session.service';" not in content:
    content = "import { AudioSessionService } from '../audio-session.service';\n" + content

with open('src/app/studio/piano-roll/piano-roll.component.ts', 'w') as f:
    f.write(content)
