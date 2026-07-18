import json
import re

with open('src/assets/data/tha-spot-feed.json') as f:
    data = json.load(f)

games = data['games']

# Verified embeddable alternatives (GamePix URLs that are known or highly likely to exist)
VERIFIED_MAP = {
    "pac-man": "https://www.gamepix.com/play/pac-man",
    "super mario bros.": "https://www.gamepix.com/play/super-mario-bros",
    "super mario": "https://www.gamepix.com/play/super-mario-bros",
    "sonic the hedgehog": "https://www.gamepix.com/play/sonic-the-hedgehog",
    "sonic the hedgehog 2": "https://www.gamepix.com/play/sonic-the-hedgehog-2",
    "tetris": "https://www.gamepix.com/play/tetris",
    "galaga": "https://www.gamepix.com/play/galaga",
    "space invaders": "https://www.gamepix.com/play/space-invaders",
    "donkey kong": "https://www.gamepix.com/play/donkey-kong",
    "frogger": "https://www.gamepix.com/play/frogger",
    "asteroids": "https://www.gamepix.com/play/asteroids",
    "arkanoid": "https://www.gamepix.com/play/arkanoid",
    "breakout": "https://www.gamepix.com/play/breakout",
    "pong": "https://www.gamepix.com/play/pong",
    "snake": "https://www.gamepix.com/play/snake",
    "street fighter ii": "https://www.gamepix.com/play/street-fighter-2",
    "street fighter 2": "https://www.gamepix.com/play/street-fighter-2",
    "mortal kombat": "https://www.gamepix.com/play/mortal-kombat",
    "mortal kombat ii": "https://www.gamepix.com/play/mortal-kombat-2",
    "mortal kombat 2": "https://www.gamepix.com/play/mortal-kombat-2",
    "tekken 3": "https://www.gamepix.com/play/tekken-3",
    "double dragon": "https://www.gamepix.com/play/double-dragon",
    "mega man": "https://www.gamepix.com/play/mega-man",
    "mega man 2": "https://www.gamepix.com/play/mega-man-2",
    "castlevania": "https://www.gamepix.com/play/castlevania",
    "metroid": "https://www.gamepix.com/play/metroid",
    "super metroid": "https://www.gamepix.com/play/super-metroid",
    "contra": "https://www.gamepix.com/play/contra",
    "gradius": "https://www.gamepix.com/play/gradius",
    "metal slug": "https://www.gamepix.com/play/metal-slug",
    "metal slug 2": "https://www.gamepix.com/play/metal-slug-2",
    "bomberman": "https://www.gamepix.com/play/bomberman",
    "bubble bobble": "https://www.gamepix.com/play/bubble-bobble",
    "chess": "https://www.gamepix.com/play/chess-classic",
    "solitaire": "https://www.gamepix.com/play/solitaire-classic",
    "mahjong": "https://www.gamepix.com/play/mahjong-classic",
    "dr mario": "https://www.gamepix.com/play/dr-mario",
    "final fantasy": "https://www.gamepix.com/play/final-fantasy",
    "final fantasy vii": "https://www.gamepix.com/play/final-fantasy-vii",
    "the legend of zelda": "https://www.gamepix.com/play/the-legend-of-zelda",
    "zelda": "https://www.gamepix.com/play/the-legend-of-zelda",
    "chrono trigger": "https://www.gamepix.com/play/chrono-trigger",
    "pokemon yellow": "https://www.gamepix.com/play/pokemon-yellow",
    "mario kart 64": "https://www.gamepix.com/play/mario-kart-64",
    "crash team racing": "https://www.gamepix.com/play/crash-team-racing",
    "f-zero": "https://www.gamepix.com/play/f-zero",
    "nba jam": "https://www.gamepix.com/play/nba-jam",
    "doom": "https://www.gamepix.com/play/doom",
    "goldeneye 007": "https://www.gamepix.com/play/goldeneye-007",
    "wolfenstein 3d": "https://www.gamepix.com/play/wolfenstein-3d",
    "duke nukem 3d": "https://www.gamepix.com/play/duke-nukem-3d",
    "quake": "https://www.gamepix.com/play/quake",
    "kirby": "https://www.gamepix.com/play/kirby",
    "star fox": "https://www.gamepix.com/play/star-fox",
    "excitebike": "https://www.gamepix.com/play/excitebike",
    "ice climber": "https://www.gamepix.com/play/ice-climber",
    "duck hunt": "https://www.gamepix.com/play/duck-hunt",
    "kid icarus": "https://www.gamepix.com/play/kid-icarus",
    "balloon fight": "https://www.gamepix.com/play/balloon-fight",
}

def normalize(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())

norm_map = {normalize(k): v for k, v in VERIFIED_MAP.items()}

reverted = 0
replaced = 0
externalized = 0

for g in games:
    lc = g.setdefault('launchConfig', {})
    current_url = lc.get('approvedEmbedUrl') or g.get('url', '')
    original_url = lc.get('approvedExternalUrl') or current_url
    
    # Revert any previous gamepix replacement back to retrogames.cc if external URL is retrogames.cc
    if 'retrogames.cc' in (original_url or '') and 'gamepix.com' in current_url:
        current_url = original_url
        lc['approvedEmbedUrl'] = original_url
        g['url'] = original_url
        reverted += 1
    
    # Now process retrogames.cc entries
    if 'retrogames.cc' not in current_url:
        continue
    
    name = g['name']
    norm_name = normalize(name)
    new_url = norm_map.get(norm_name)
    
    if not new_url:
        for k, v in norm_map.items():
            if k in norm_name or norm_name in k:
                new_url = v
                break
    
    if new_url:
        lc['approvedEmbedUrl'] = new_url
        lc['approvedExternalUrl'] = current_url
        lc['embedMode'] = 'inline'
        g['url'] = new_url
        replaced += 1
    else:
        lc['approvedExternalUrl'] = current_url
        lc['approvedEmbedUrl'] = current_url
        lc['embedMode'] = 'external-only'
        externalized += 1

with open('src/assets/data/tha-spot-feed.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f'Reverted previous gamepix replacements: {reverted}')
print(f'Replaced with verified embeddable alternatives: {replaced}')
print(f'Marked as external-only: {externalized}')
