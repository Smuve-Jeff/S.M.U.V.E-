import re

with open('src/app/components/tha-spot/tha-spot.component.ts', 'r') as f:
    content = f.read()

origin_check_logic = """  isTrustedGameMessageOrigin(event: MessageEvent, active: Game): boolean {
    const candidates = [
      active.launchConfig?.approvedEmbedUrl,
      active.launchConfig?.approvedExternalUrl,
      active.url,
    ].filter((c): c is string => !!c);
    const allowedOrigins = new Set(
      candidates
        .map((c) => {
          try {
            return new URL(c, window.location.origin).origin;
          } catch {
            return null;
          }
        })
        .filter((o): o is string => !!o)
    );
    allowedOrigins.add(window.location.origin);
    return allowedOrigins.has(event.origin);
  }"""

content = re.sub(r'isTrustedGameMessageOrigin\(event: MessageEvent, active: Game\): boolean \{.*?\}', origin_check_logic, content, flags=re.DOTALL)

with open('src/app/components/tha-spot/tha-spot.component.ts', 'w') as f:
    f.write(content)

with open('src/app/components/tha-spot/tha-spot.component.spec.ts', 'r') as f:
    spec = f.read()
spec = spec.replace("it.skip('ignores game messages from untrusted origins'", "it('ignores game messages from untrusted origins'")
with open('src/app/components/tha-spot/tha-spot.component.spec.ts', 'w') as f:
    f.write(spec)
