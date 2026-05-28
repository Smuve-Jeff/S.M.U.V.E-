import sys
import os
import re

def scan_dir(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.ts'):
                path = os.path.join(root, file)
                with open(path, 'r') as f:
                    content = f.read()
                    # Find class name
                    class_match = re.search(r"export class (\w+)", content)
                    if class_match:
                        class_name = class_match.group(1)
                        # Find inject() calls
                        injects = re.findall(r"inject\((\w+)\)", content)
                        # Find constructor params (simple check)
                        cons_match = re.search(r"constructor\((.*?)\)", content, re.DOTALL)
                        cons_deps = []
                        if cons_match:
                            params = cons_match.group(1)
                            # Look for private/public name: Type
                            cons_deps = re.findall(r"(?:private|public|protected)\s+\w+\s*:\s*(\w+)", params)

                        if injects or cons_deps:
                            print(f"{class_name} ({path}):")
                            if injects: print(f"  Injects: {injects}")
                            if cons_deps: print(f"  Constructor Deps: {cons_deps}")

if __name__ == "__main__":
    print("Scanning src/app/services...")
    scan_dir('src/app/services')
    print("\nScanning src/app/studio...")
    scan_dir('src/app/studio')
    print("\nScanning src/app (root level components)...")
    for f in os.listdir('src/app'):
        if f.endswith('.ts'):
            scan_dir('src/app')
            break
