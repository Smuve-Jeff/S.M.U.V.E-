import sys

with open('server/index.js', 'r') as f:
    content = f.read()

old_listen = 'server.listen(port, () => {'
new_listen = "server.listen(port, '0.0.0.0', () => {"

if old_listen in content:
    content = content.replace(old_listen, new_listen)
    with open('server/index.js', 'w') as f:
        f.write(content)
    print("Updated server to listen on 0.0.0.0")
else:
    print("Listen call not found or already updated")
