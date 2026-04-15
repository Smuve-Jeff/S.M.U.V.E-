content = open('src/app/components/tha-spot/tha-spot.component.ts', 'r').read()

# Remove the incorrectly appended part and the trailing brace of the class
# Then insert the method properly and close the class.

if '} }' in content:
    content = content.replace('} }', '}')

# Move the method inside the class
if 'getGamesForRail' in content and content.strip().endswith('}'):
    # Find the last closing brace of the class
    last_brace_index = content.rfind('}')
    # Find the getGamesForRail definition
    method_index = content.find('getGamesForRail')

    method_body = content[method_index:]
    class_body = content[:method_index].strip()

    # Remove the extra closing brace that was likely before the appended method
    if class_body.endswith('}'):
        class_body = class_body[:-1].strip()

    new_content = class_body + "\n\n  " + method_body + "\n}\n"

    with open('src/app/components/tha-spot/tha-spot.component.ts', 'w') as f:
        f.write(new_content)
