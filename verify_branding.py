import os
import re

def check_file(filepath, patterns):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return

    with open(filepath, 'r') as f:
        content = f.read()

    for name, pattern in patterns.items():
        if re.search(pattern, content):
            print(f"SUCCESS: Found {name} in {filepath}")
        else:
            print(f"FAILURE: Could not find {name} in {filepath}")

# Renaming checks
rename_patterns = {
    "S.M.U.V.E 1.0 Title": r'S.M.U.V.E<span class="text-brand-primary"> 1.0</span>',
    "S.M.U.V.E 1.0 Placeholder": r'placeholder="Command S.M.U.V.E 1.0'
}
check_file('src/app/components/chatbot/chatbot.component.html', rename_patterns)

# Font and Style checks
style_patterns = {
    "Cinzel Font in HTML": r'Cinzel:wght@400;700;900',
    "Cinzel Font in Rel": r'family=Cinzel:wght@400;700;900'
}
check_file('src/index.html', style_patterns)

footer_patterns = {
    "Cinzel in CSS": r'font-family: "Cinzel", serif;',
    "Elegant Weight": r'font-weight: 400; /\* Elegant visual appearance \*/',
    "Elegant Spacing": r'letter-spacing: 0.25em; /\* Refined elegant spacing \*/'
}
check_file('src/styles.css', footer_patterns)
