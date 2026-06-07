import os
import re

def check_css_vars(directory):
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.css') or file.endswith('.scss'):
                path = os.path.join(root, file)
                with open(path, 'r') as f:
                    content = f.read()
                    # Check for elite-gold or superior-crimson usage
                    if '--elite-gold' in content or '--superior-crimson' in content:
                        print(f"Verified Elite styles in {path}")

check_css_vars('src/app/studio')
