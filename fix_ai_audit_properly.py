import sys

def fix():
    path = 'src/app/services/ai-audit.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # The issue is the returned object doesn't match ProfileAuditLog
    # ProfileAuditLog: { score: number; status: string; alerts: string[]; deficits: string[]; timestamp: number; recommendations?: any[]; auditType?: string; }

    import re
    # Find the return block
    match = re.search(r"return\s*{\s*timestamp:.*?};", content, re.DOTALL)
    if match:
        old_return = match.group(0)
        new_return = """return {
      timestamp: Date.now(),
      score: Math.max(0, Math.min(100, score)),
      deficits,
      recommendations,
      status: score >= 90 ? 'FORTIFIED' : 'VULNERABLE',
      alerts: []
    };"""
        content = content.replace(old_return, new_return)

    with open(path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
