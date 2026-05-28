with open('src/app/services/music-manager.service.ts', 'r') as f:
    content = f.read()

if 'isPlaying =' not in content:
    content = content.replace('currentStep = signal(0);', 'currentStep = signal(0);\n  isPlaying = computed(() => this.engine.isPlaying());\n  isRecording = computed(() => this.engine.isRecording());')

with open('src/app/services/music-manager.service.ts', 'w') as f:
    f.write(content)
