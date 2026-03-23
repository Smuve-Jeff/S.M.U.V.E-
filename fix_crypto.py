import sys

with open('src/app/services/auth.service.ts', 'r') as f:
    content = f.read()

# Replace Math.random with crypto.getRandomValues for session IDs and user IDs
# Using a simple helper to generate secure random strings

helper = """  private generateSecureId(prefix: string): string {
    const array = new Uint32Array(2);
    crypto.getRandomValues(array);
    return prefix + '_' + array[0].toString(36) + array[1].toString(36);
  }"""

if 'private generateSecureId' not in content:
    # Insert before the end of the class
    last_brace = content.rfind('}')
    content = content[:last_brace] + helper + '\n' + content[last_brace:]

# Replace old generators
content = content.replace("const sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);",
                          "const sessionId = this.generateSecureId('sess');")

content = content.replace("return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);",
                          "return this.generateSecureId('user_' + Date.now());")

with open('src/app/services/auth.service.ts', 'w') as f:
    f.write(content)
