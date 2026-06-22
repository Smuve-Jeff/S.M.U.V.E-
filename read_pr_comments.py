import sys
import subprocess
import json

def run_tool(name, params):
    result = subprocess.run(
        [name, json.dumps(params)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)

# Since I cannot easily fetch PR ID from bash without more tools,
# and linear_list_diffs is failing, I will try to search for comments on recent issues.
