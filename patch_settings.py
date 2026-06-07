import re

# Patch TS file
with open('src/app/components/settings/settings.component.ts', 'r') as f:
    ts_content = f.read()

# Add signal bindings
if 'audioOutputDevices = this.audioEngine.availableOutputDevices;' not in ts_content:
    ts_content = ts_content.replace(
        'audioInputDevices = this.microphoneService.availableDevices;',
        'audioInputDevices = this.microphoneService.availableDevices;\n  audioOutputDevices = this.audioEngine.availableOutputDevices;\n  selectedAudioOutputId = this.audioEngine.outputDeviceId;'
    )

# Add selectAudioOutput method
if 'async selectAudioOutput(deviceId: string | null)' not in ts_content:
    method_insertion = """  async selectAudioInput(deviceId: string | null) {
    if (!deviceId) return;
    await this.microphoneService.initialize(deviceId);
  }

  async selectAudioOutput(deviceId: string | null) {
    if (!deviceId) return;
    await this.audioEngine.setOutputDevice(deviceId);
  }"""
    ts_content = ts_content.replace('  async selectAudioInput(deviceId: string | null) {\n    if (!deviceId) return;\n    await this.microphoneService.initialize(deviceId);\n  }', method_insertion)

with open('src/app/components/settings/settings.component.ts', 'w') as f:
    f.write(ts_content)

# Patch HTML file
with open('src/app/components/settings/settings.component.html', 'r') as f:
    html_content = f.read()

# Add Output Device dropdown after Input Device dropdown
if 'selectedAudioOutputId()' not in html_content:
    dropdown_html = """            <label class="block">
              <span class="setting-label">Output Device</span>
              <select
                class="smuve-input w-full mt-2"
                [ngModel]="selectedAudioOutputId()"
                (ngModelChange)="selectAudioOutput($event)"
              >
                <option [ngValue]="null">Default Device</option>
                <option
                  *ngFor="let device of audioOutputDevices()"
                  [value]="device.deviceId"
                >
                  {{ device.label }}
                </option>
              </select>
            </label>"""

    # We find the end of the input device label and insert after it
    pattern = r'(<label class="block">\s*<span class="setting-label">Input Device</span>.*?</select>\s*</label>)'
    html_content = re.sub(pattern, r'\1\n' + dropdown_html, html_content, flags=re.DOTALL)

with open('src/app/components/settings/settings.component.html', 'w') as f:
    f.write(html_content)
