import os
path = 'src/app/services/ai.service.ts'
with open(path, 'r') as f:
    content = f.read()

# I will replace the strings including the quotes to be exact.
# From the grep: cost: '5.99/yr'  and cost: '9.99/mo'
content = content.replace("cost: '5.99/yr'", "cost: '$35.99/yr'")
content = content.replace("cost: '9.99/mo'", "cost: '$19.99/mo'")

with open(path, 'w') as f:
    f.write(content)
print("Fix applied.")
