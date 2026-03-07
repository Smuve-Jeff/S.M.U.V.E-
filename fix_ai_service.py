import re

with open('src/app/services/ai.service.ts', 'r') as f:
    content = f.read()

# Refined regex to capture the filter block and replace with safe versions
search_pattern = r'const hasGenreAffinity = !item.genres \|\| item.genres.some\(g =>\s+g.toLowerCase\(\) === profile.primaryGenre\?\.toLowerCase\(\) \|\|\s+\(profile.secondaryGenres \|\| \[\]\).some\(sg => sg.toLowerCase\(\) === g.toLowerCase\(\)\)\s+\);'
replace_with = """const hasGenreAffinity = !item.genres || item.genres.some(g =>
        (g && profile.primaryGenre && g.toLowerCase() === profile.primaryGenre.toLowerCase()) ||
        (profile.secondaryGenres || []).some(sg => sg && g && sg.toLowerCase() === g.toLowerCase())
      );"""

content = re.sub(search_pattern, replace_with, content)

search_pattern_2 = r'const hasInterestMatch = \(profile.careerGoals \|\| \[\]\).some\(goal =>\s+item.type.toLowerCase\(\).includes\(goal.toLowerCase\(\)\) \|\|\s+item.title.toLowerCase\(\).includes\(goal.toLowerCase\(\)\) \|\|\s+item.description.toLowerCase\(\).includes\(goal.toLowerCase\(\)\)\s+\);'
replace_with_2 = """const hasInterestMatch = (profile.careerGoals || []).some(goal =>
        (goal && item.type && item.type.toLowerCase().includes(goal.toLowerCase())) ||
        (goal && item.title && item.title.toLowerCase().includes(goal.toLowerCase())) ||
        (goal && item.description && item.description.toLowerCase().includes(goal.toLowerCase()))
      );"""

content = re.sub(search_pattern_2, replace_with_2, content)

search_pattern_3 = r'const alreadyHasInDaw = profile.daw\?\.some\(d => item.title.toLowerCase\(\).includes\(d.toLowerCase\(\)\)\);'
replace_with_3 = """const alreadyHasInDaw = (profile.daw || []).some(d => d && item.title && item.title.toLowerCase().includes(d.toLowerCase()));"""

content = re.sub(search_pattern_3, replace_with_3, content)

search_pattern_4 = r'const alreadyHasInEquip = profile.equipment\?\.some\(e => item.title.toLowerCase\(\).includes\(e.toLowerCase\(\)\)\);'
replace_with_4 = """const alreadyHasInEquip = (profile.equipment || []).some(e => e && item.title && item.title.toLowerCase().includes(e.toLowerCase()));"""

content = re.sub(search_pattern_4, replace_with_4, content)

with open('src/app/services/ai.service.ts', 'w') as f:
    f.write(content)

print("Successfully applied safety fixes to AiService")
