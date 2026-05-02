file_path = 'src/app/components/chatbot/chatbot.commands.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add new slash commands
content = content.replace(
    "{ label: '/sync_kb', description: 'Sync knowledge base' },",
    "{ label: '/sync_kb', description: 'Sync knowledge base' },\n  { label: '/musicians', description: 'Manage AI Band' },\n  { label: '/splits', description: 'Digital Split Sheets' },"
)

with open(file_path, 'w') as f:
    f.write(content)
