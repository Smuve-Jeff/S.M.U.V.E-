import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# StudioComponent: Include all views in the internal switching
patch_file('src/app/studio/studio.component.html',
    r'<main class="studio-workspace" \[ngSwitch\]="activeView\(\)">',
    r"""<main class="studio-workspace" [ngSwitch]="activeView()">
        <div class="view-wrapper" *ngSwitchCase="'drum-machine'">
          <app-drum-machine class="arrangement-main"></app-drum-machine>
        </div>

        <div class="view-wrapper" *ngSwitchCase="'mixer'">
          <app-mixer class="arrangement-main"></app-mixer>
        </div>

        <div class="view-wrapper" *ngSwitchCase="'performance'">
          <app-performer class="arrangement-main"></app-performer>
        </div>

        <div class="view-wrapper" *ngSwitchCase="'mastering'">
          <app-mastering-suite class="arrangement-main"></app-mastering-suite>
        </div>""")

# Update the buttons to use setActiveView instead of external navigation for faster switching
patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('drum-machine'\)\"",
    r"[class.active]=\"activeView() === 'drum-machine'\" (click)=\"setActiveView('drum-machine')\"")

patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('mixer'\)\"",
    r"[class.active]=\"activeView() === 'mixer'\" (click)=\"setActiveView('mixer')\"")

patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('performance'\)\"",
    r"[class.active]=\"activeView() === 'performance'\" (click)=\"setActiveView('performance')\"")

patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('mastering'\)\"",
    r"[class.active]=\"activeView() === 'mastering'\" (click)=\"setActiveView('mastering')\"")

print("Studio component switching optimized.")
