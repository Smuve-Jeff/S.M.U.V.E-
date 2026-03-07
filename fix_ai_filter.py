import re

with open('src/app/services/ai.service.ts', 'r') as f:
    content = f.read()

# Adjust the final filter logic to be more inclusive for Practice items (which might be level 0-5)
search_pattern = r'return hasGenreAffinity \|\| hasInterestMatch \|\| item.minLevel <= 10;'
replace_with = "return hasGenreAffinity || hasInterestMatch || item.minLevel <= 5 || item.id.startsWith('u-4');"

content = re.sub(search_pattern, replace_with, content)

with open('src/app/services/ai.service.ts', 'w') as f:
    f.write(content)

print("Successfully updated AiService filter logic")
