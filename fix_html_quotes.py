import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Fix backslash-escaped quotes in HTML
with open('src/app/studio/studio.component.html', 'r') as f:
    content = f.read()

fixed_content = content.replace('\"', '"')
with open('src/app/studio/studio.component.html', 'w') as f:
    f.write(fixed_content)

print("HTML quotes fixed.")
