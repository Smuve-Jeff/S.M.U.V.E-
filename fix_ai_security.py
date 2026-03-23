import sys

with open('src/app/services/ai.service.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if "if (cmd === '/audit') {" in line or 'if (cmd === "/audit") {' in line:
        # We need to find the end of this block
        pass
    if "return 'INITIALIZING EXECUTIVE STUDIO AUDIT.';" in line:
        new_lines.append("    }\n")
        new_lines.append("    if (cmd === '/security_audit') {\n")
        new_lines.append("      const security = profile.settings.security;\n")
        new_lines.append("      const score = (security?.twoFactorEnabled) ? 95 : 45;\n")
        new_lines.append("      return `SECURITY STATUS: ${score}/100. ${(security?.twoFactorEnabled) ? 'YOUR DEFENSES ARE ADEQUATE.' : 'YOUR SECURITY IS PATHETIC. ENABLE 2FA IMMEDIATELY OR PREPARE FOR DATA CORRUPTION.'}`;\n")

# This script is a bit naive, let's try a better way with search/replace on the whole content
