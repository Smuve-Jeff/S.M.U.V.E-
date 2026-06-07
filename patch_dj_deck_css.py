import os

file_path = 'src/app/studio/dj-deck/dj-deck.component.css'
with open(file_path, 'a') as f:
    f.write("""
/* Advanced FX Performance Panel */
.fx-performance-panel {
  background: rgba(10, 10, 15, 0.8);
  border: 1px solid var(--elite-gold);
  border-radius: 12px;
  box-shadow: 0 0 20px rgba(212, 175, 55, 0.1);
}

.fx-selectors .btn-xs {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #888;
  padding: 4px 8px;
  font-size: 10px;
  border-radius: 4px;
}

.fx-selectors .btn-xs.active {
  background: var(--elite-gold);
  color: #000;
  border-color: #fff;
  box-shadow: 0 0 10px var(--elite-gold);
}

.fx-control-deck {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fx-control-deck input[type='range'] {
  width: 100%;
  accent-color: var(--elite-gold);
}

/* DJ Utility Buttons */
.dj-utility-btns {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.dj-utility-btns .btn-sm {
  font-size: 10px;
  padding: 6px 12px;
  border: 1px solid var(--studio-border);
  background: #1a1a24;
}

.dj-utility-btns .btn-sm.active {
  background: var(--color-primary);
  border-color: #fff;
  box-shadow: 0 0 15px var(--color-primary);
}

.sampler-tab-group {
  position: relative;
}

.sampler-cat-select {
  appearance: none;
  background: rgba(0, 0, 0, 0.3);
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
}
""")
