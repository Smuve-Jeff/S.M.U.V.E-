import re

with open('src/app/services/ai.service.ts', 'r') as f:
    content = f.read()

# Fix the secondaryGenres.some call which might fail if secondaryGenres is undefined
content = content.replace(
    'profile.secondaryGenres.some(sg => sg.toLowerCase() === g.toLowerCase())',
    '(profile.secondaryGenres || []).some(sg => sg.toLowerCase() === g.toLowerCase())'
)

# Fix careerGoals.some call
content = content.replace(
    'profile.careerGoals.some(goal =>',
    '(profile.careerGoals || []).some(goal =>'
)

with open('src/app/services/ai.service.ts', 'w') as f:
    f.write(content)

print("Final safety patches applied to AiService")
