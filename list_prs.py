import subprocess
import json

def list_prs():
    try:
        # Use gh cli if available, otherwise just use git to see remotes and branches
        result = subprocess.run(['gh', 'pr', 'list', '--json', 'number,title,url,headRefName'], capture_output=True, text=True)
        if result.returncode == 0:
            print(result.stdout)
        else:
            print("gh cli error or not found")
    except Exception as e:
        print(f"Error: {e}")

list_prs()
