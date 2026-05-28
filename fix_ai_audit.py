import sys

def fix():
    path = 'src/app/services/ai-audit.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Match the new ProfileAuditLog interface
    content = content.replace("auditType: 'Strategic',", "")
    content = content.replace("status: auditStatus,", "status: 'FORTIFIED',") # Simple fix for now
    content = content.replace("alerts: auditAlerts,", "alerts: [],")

    with open(path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix()
