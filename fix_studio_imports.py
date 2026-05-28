import os

with open('src/app/studio/studio.component.ts', 'r') as f:
    content = f.read()

# Fix the import line if it's broken
content = content.replace("import { UniversalMasterComponent } from './master-controls/universal-master/universal-master.component';", "import { UniversalMasterComponent } from './master-controls/universal-master/universal-master.component';")

# Ensure UniversalMasterComponent is in imports array
if 'UniversalMasterComponent' not in content:
     content = content.replace('imports: [', 'imports: [UniversalMasterComponent, ')

with open('src/app/studio/studio.component.ts', 'w') as f:
    f.write(content)
