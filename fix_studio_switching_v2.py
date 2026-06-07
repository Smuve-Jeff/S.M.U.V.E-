import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Update the mobile bottom nav buttons as well
patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('drum-machine'\)\">Drums</button>",
    r"[class.active]=\"activeView() === 'drum-machine'\" (click)=\"setActiveView('drum-machine')\">Drums</button>")

patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('mixer'\)\">Mix</button>",
    r"[class.active]=\"activeView() === 'mixer'\" (click)=\"setActiveView('mixer')\">Mix</button>")

patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('performance'\)\">Perform</button>",
    r"[class.active]=\"activeView() === 'performance'\" (click)=\"setActiveView('performance')\">Perform</button>")

patch_file('src/app/studio/studio.component.html',
    r"\(click\)=\"uiService\.navigateToView\('mastering'\)\">Master</button>",
    r"[class.active]=\"activeView() === 'mastering'\" (click)=\"setActiveView('mastering')\">Master</button>")

print("Studio component switching (mobile) optimized.")
