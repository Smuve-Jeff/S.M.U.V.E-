import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Arrangement CSS: Add resize handle and selection styles
with open('src/app/studio/arrangement-view/arrangement-view.component.css', 'r') as f:
    css = f.read()

new_css = css + """
.selected-clip {
  border: 2px solid white !important;
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
  z-index: 5;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle::after {
  content: '';
  width: 1px;
  height: 20%;
  background: rgba(255, 255, 255, 0.4);
}

.clip-item:hover .resize-handle {
  background: rgba(255, 255, 255, 0.2);
}

.edit-tools button {
  padding: 2px 8px;
  border-radius: 4px;
}
"""

with open('src/app/studio/arrangement-view/arrangement-view.component.css', 'w') as f:
    f.write(new_css)

print("Arrangement CSS features upgraded.")
