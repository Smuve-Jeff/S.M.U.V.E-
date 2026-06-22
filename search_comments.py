import json
import subprocess

def call_tool(tool_name, params):
    result = subprocess.run(
        [tool_name, json.dumps(params)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)
# I will try to list ALL comments across ALL issues and then filter for relevant keywords.
