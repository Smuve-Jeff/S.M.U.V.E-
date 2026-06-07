import re

path = 'src/app/studio/drum-machine/drum-machine.component.spec.ts'
with open(path, 'r') as f:
    content = f.read()

# Update mockAiService to include userProfileService.profile
old_mock = r"const mockAiService = \{\n      generateAiResponse: jest\.fn\(\)\.mockResolvedValue\('trap'\),\n    \};"
new_mock = """    const mockAiService = {
      generateAiResponse: jest.fn().mockResolvedValue('trap'),
      userProfileService: {
        profile: jest.fn().mockReturnValue({
          expertise: { production: 5 },
          settings: { ai: {} }
        })
      },
      strategicDecrees: signal([])
    };"""

content = re.sub(old_mock, new_mock, content)

with open(path, 'w') as f:
    f.write(content)

print("Drum Machine component test updated.")
