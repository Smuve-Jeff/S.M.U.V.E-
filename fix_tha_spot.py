import re

with open('src/app/components/tha-spot/tha-spot.component.ts', 'r') as f:
    content = f.read()

# Fix onMessage
pattern = r"private onMessage\(event: MessageEvent\): void \{.*?this\.closeGame\(\);\s+\}\s+\}"
replacement = """  private onMessage(event: MessageEvent): void {
    const active = this.currentGame();
    if (
      !active ||
      !this.gameIframe?.nativeElement?.contentWindow ||
      event.source !== this.gameIframe.nativeElement.contentWindow ||
      !this.isTrustedGameMessageOrigin(event, active)
    ) return;

    if (event.data?.type === 'GAME_OVER') {
      this.profileService.recordGameResult(active.id, {
        ...this.buildSessionContext(active),
        score: event.data.data?.score
      });
      this.closeGame();
    }
  }"""

# Use a simpler string replacement for onMessage if regex fails
if 'this.isTrustedGameMessageOrigin(event, active)' not in content:
    content = re.sub(r'private onMessage\(event: MessageEvent\): void \{.*?this\.closeGame\(\);\s+\}\s+\}', replacement, content, flags=re.DOTALL)

with open('src/app/components/tha-spot/tha-spot.component.ts', 'w') as f:
    f.write(content)

with open('src/app/components/tha-spot/tha-spot.component.css', 'r') as f:
    css = f.read()
css = css.replace('`@media`', '@media')
with open('src/app/components/tha-spot/tha-spot.component.css', 'w') as f:
    f.write(css)
