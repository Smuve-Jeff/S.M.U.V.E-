import re

new_items = """  {
    id: 'u-41',
    title: 'Portable Vocal Shield',
    type: 'Gear',
    description: 'Isolation for the nomadic artist. Eliminate room reflections and capture studio-quality vocals in any environment.',
    cost: '9',
    url: 'https://www.seelectronics.com',
    minLevel: 0,
    impact: 'High',
    genres: ['Vocal', 'Pop', 'Hip-Hop', 'R&B']
  },
  {
    id: 'u-42',
    title: 'DIY Acoustic Treatment Kit',
    type: 'Gear',
    description: 'Strategic sound absorption. A curated set of high-density foam panels to neutralize standing waves in your practice space.',
    cost: '49',
    url: 'https://www.gikacoustics.com',
    minLevel: 5,
    impact: 'Medium'
  },
  {
    id: 'u-43',
    title: 'Professional In-Ear Monitors',
    type: 'Gear',
    description: 'Critical hearing protection and clarity. Hear every detail of your performance without the stage noise.',
    cost: '99',
    url: 'https://www.shure.com',
    minLevel: 10,
    impact: 'High'
  },
  {
    id: 'u-44',
    title: 'Soundproof Rehearsal Space Credit',
    type: 'Service',
    description: 'Tactical retreats. Access to elite, soundproof rehearsal environments for high-intensity performance training.',
    cost: '50/mo',
    url: 'https://www.pirate.com',
    minLevel: 0,
    impact: 'Medium'
  },
  {
    id: 'u-45',
    title: 'High-Performance Visual Metronome',
    type: 'Gear',
    description: 'Internalize the pulse. A haptic and visual timing device for developing rock-solid rhythmic discipline.',
    cost: '5',
    url: 'https://www.soundbrenner.com',
    minLevel: 0,
    impact: 'Medium'
  },
  {
    id: 'u-46',
    title: 'Mobile Rehearsal Interface',
    type: 'Gear',
    description: 'Battle-ready connectivity. A rugged, high-fidelity interface for recording and analyzing rehearsals on the go.',
    cost: '99',
    url: 'https://www.focusrite.com',
    minLevel: 0,
    impact: 'High'
  },
  {
    id: 'u-47',
    title: 'Professional Vocal Steam Inhaler',
    type: 'Gear',
    description: 'Biological maintenance. Essential hydration for the vocal folds to ensure peak performance stamina.',
    cost: '5',
    url: 'https://www.vicks.com',
    minLevel: 0,
    impact: 'Medium',
    genres: ['Vocal']
  }
"""

with open('src/app/services/ai.service.ts', 'r') as f:
    content = f.read()

# Append to UPGRADE_DB array
if '];' in content:
    # Find the last occurrence of '];' which should close UPGRADE_DB
    parts = content.split('];')
    # Assuming UPGRADE_DB is the only large array ending with ]; or we target the right one
    # Actually, let's be more specific.
    # The last ]; before provideAiService
    db_end_index = content.rfind('];', 0, content.find('export function provideAiService'))

    if db_end_index != -1:
        new_content = content[:db_end_index].rstrip() + ',\n' + new_items + content[db_end_index:]
        with open('src/app/services/ai.service.ts', 'w') as f:
            f.write(new_content)
        print("Successfully updated UPGRADE_DB")
    else:
        print("Could not find end of UPGRADE_DB")
else:
    print("Could not find ];")
