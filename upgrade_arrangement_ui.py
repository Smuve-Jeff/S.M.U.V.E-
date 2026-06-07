import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Arrangement HTML: Add new edit buttons and styling for selection/resizing
patch_file('src/app/studio/arrangement-view/arrangement-view.component.html',
    r'<div class="header-actions flex items-center gap-2">',
    r"""<div class="header-actions flex items-center gap-2">
      <div class="edit-tools flex gap-1 mr-4" *ngIf="selectedClipIds().size > 0">
        <button (click)="splitAtPlayhead()" class="mini-btn tactile-v42 executive-glass" title="Split at Playhead">
          <span class="material-symbols-outlined text-[10px]">content_cut</span>
        </button>
        <button (click)="duplicateSelected()" class="mini-btn tactile-v42 executive-glass" title="Duplicate">
          <span class="material-symbols-outlined text-[10px]">content_copy</span>
        </button>
      </div>""")

# Add resize handles and selection class to clips
patch_file('src/app/studio/arrangement-view/arrangement-view.component.html',
    r'\[class\.selected\]="isTrackSelected\(track\.id\)"',
    r'[class.selected]="isTrackSelected(track.id)" [class.clip-selected]="selectedClipIds().has(clip.id)"')

patch_file('src/app/studio/arrangement-view/arrangement-view.component.html',
    r'class="clip-item absolute executive-glass shadow-v42-xl tactile-v42"',
    r'class="clip-item absolute executive-glass shadow-v42-xl tactile-v42" [class.selected-clip]="selectedClipIds().has(clip.id)"')

patch_file('src/app/studio/arrangement-view/arrangement-view.component.html',
    r'{{ clip\.length }} bars',
    r'{{ clip.length }} bars\n            <div class="resize-handle"></div>')

print("Arrangement UI features upgraded.")
