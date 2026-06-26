import sys

file_path = 'src/app/components/tha-spot/tha-spot.component.html'
with open(file_path, 'r') as f:
    content = f.read()

start_marker = '<div class="launch-mission-page"'
end_marker = '<!-- Selection Preview Overlay -->' # I will use the next div ending before wasm-loader-overlay

# Find the start
start_pos = content.find(start_marker)
if start_pos == -1:
    print("Start marker not found")
    sys.exit(1)

# Find the end of that specific div
# The old content ends with mission-secondary-actions and then two </div></div>
end_marker_text = 'ABORT MISSION'
abort_pos = content.find(end_marker_text)
if abort_pos == -1:
    print("Abort text not found")
    sys.exit(1)

# Find the next two </div>
first_div_end = content.find('</div>', abort_pos)
second_div_end = content.find('</div>', first_div_end + 6)
third_div_end = content.find('</div>', second_div_end + 6)

actual_end = third_div_end + 6

new_content = """<div class="launch-mission-page" *ngIf="selectedGame() as selected" [class.active]="selected">
    <div class="mission-background" [style.backgroundImage]="'url(' + (selected.image || 'assets/desktop_hub.png') + ')'"></div>
    <div class="mission-content animate-enter-mission fit-screen">
      <div class="mission-header">
        <div class="mission-id">SYS_UPLINK_READY // {{ selected.id | uppercase }}</div>
        <h1 class="mission-title">{{ selected.name }}</h1>
        <div class="mission-badges">
          <span class="tag elite" *ngIf="selected.badgeIds?.includes('elite')">ELITE</span>
          <span class="tag next-gen" *ngIf="selected.badgeIds?.includes('next-gen')">NEXT-GEN</span>
          <span class="tag modern" *ngIf="selected.badgeIds?.includes('modern')">MODERN</span>
        </div>
      </div>

      <div class="mission-central-hub">
        <div class="mission-hero-visual-compact">
          <div class="hero-frame-compact glass-v42-pro">
            <img [src]="selected.image || 'assets/desktop_hub.png'" [alt]="selected.name" />
            <div class="scan-overlay"></div>
          </div>
        </div>

        <div class="mission-primary-action-centered">
          <button class="launch-btn-ultra" (click)="confirmLaunch()" [disabled]="isMatchmaking() || isWasmLoading()">
            <div class="btn-aura"></div>
            <span class="material-symbols-outlined btn-icon-giant">play_circle</span>
            <span class="btn-text-main">{{ launchActionLabel(selected) }}</span>
            <span class="btn-subtext-status">INITIALIZE_LINK_v5.0</span>
          </button>
        </div>
      </div>

      <div class="mission-info-footer glass-v42">
        <div class="info-cluster">
          <label>BRIEFING</label>
          <p class="truncate-2">{{ selected.description }}</p>
        </div>
        <div class="meta-cluster">
          <div class="meta-tag"><span class="m-label">GENRE:</span> {{ selected.genre }}</div>
          <div class="meta-tag"><span class="m-label">RATING:</span> {{ selected.rating }}</div>
        </div>
      </div>

      <div class="mission-abort-container">
        <button class="abort-btn" (click)="closePreview()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  </div>"""

final_content = content[:start_pos] + new_content + content[actual_end:]

with open(file_path, 'w') as f:
    f.write(final_content)
print("Replaced successfully")
