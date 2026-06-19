import re

with open('src/app/studio/studio.component.html', 'r') as f:
    content = f.read()

open_buttons = len(re.findall(r'<button', content))
close_buttons = len(re.findall(r'</button>', content))

print(f"Open buttons: {open_buttons}")
print(f"Close buttons: {close_buttons}")

if open_buttons != close_buttons:
    print("MISMATCH DETECTED!")
    # Find the approximate location
    lines = content.split('\n')
    stack = []
    for i, line in enumerate(lines):
        # Very naive tag tracking
        opens = re.findall(r'<button', line)
        closes = re.findall(r'</button>', line)
        for _ in opens: stack.append(i+1)
        for _ in closes:
            if stack: stack.pop()
            else: print(f"Unmatched closing tag at line {i+1}")
    if stack:
        print(f"Unmatched opening tags at lines: {stack}")
