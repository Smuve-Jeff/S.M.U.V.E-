import sys
import re

path = 'src/app/services/music-manager.service.ts'
with open(path, 'r') as f:
    content = f.read()

# Specifically find playStep and clean up multiple stepInBar declarations
pattern = r'(playStep\(step: number, time: number, duration: number\) \{)(.*?)(\})'
def cleanup_playstep(match):
    """
    Normalize a matched playStep block by keeping a single stepInBar declaration.
    
    Parameters:
    	match: A regex match with groups for the block header, body, and footer.
    
    Returns:
    	str: The reconstructed block with one stepInBar declaration placed at the top of the body.
    """
    header = match.group(1)
    body = match.group(2)
    footer = match.group(3)
    # Remove all declarations of stepInBar and re-add one at the top
    body = body.replace('const stepInBar = step % 16;', '')
    new_body = '\n    const stepInBar = step % 16;' + body
    return header + new_body + footer

# Actually, the error shows line 194 and 190.
# I'll just remove all duplicate 'const stepInBar = step % 16;'
lines = content.split('\n')
new_lines = []
found_step_in_bar = False
for line in lines:
    if 'const stepInBar = step % 16;' in line:
        if not found_step_in_bar:
            new_lines.append(line)
            found_step_in_bar = True
        else:
            # Skip subsequent ones in the same scope (heuristic)
            pass
    else:
        # Reset if we leave a method? Hard to do perfectly with regex/logic here.
        # Let's just remove ALL but the first and then manually check.
        new_lines.append(line)
        if '}' in line: # Reset heuristic
             found_step_in_bar = False

with open(path, 'w') as f:
    f.write('\n'.join(new_lines))

print("MM service cleaned.")
