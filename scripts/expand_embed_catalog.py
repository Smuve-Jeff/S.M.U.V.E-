import json
import re

with open('src/assets/data/tha-spot-feed.json') as f:
    data = json.load(f)

games = data['games']

# DOS Zone mappings for well-known DOS titles
# Pattern: https://dos.zone/player/?bundleUrl=https://dos.zone/games/<slug>.jsdos&anonymous=1
DOS_ZONE_MAP = {
    "doom": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/doom.jsdos&anonymous=1",
    "duke nukem 3d": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/duke-nukem-3d.jsdos&anonymous=1",
    "duke nukem": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/duke-nukem-3d.jsdos&anonymous=1",
    "wolfenstein 3d": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/wolfenstein-3d.jsdos&anonymous=1",
    "quake": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/quake.jsdos&anonymous=1",
    "command \u0026 conquer": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/command-and-conquer.jsdos&anonymous=1",
    "warcraft": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/warcraft-orcs-humans.jsdos&anonymous=1",
    "warcraft orcs \u0026 humans": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/warcraft-orcs-humans.jsdos&anonymous=1",
    "digger": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/digger.jsdos&anonymous=1",
    "simcity": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/simcity.jsdos&anonymous=1",
    "simcity 2000": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/simcity-2000.jsdos&anonymous=1",
    "civilization": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/civilization.jsdos&anonymous=1",
    "master of orion": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/master-of-orion.jsdos&anonymous=1",
    "x-com": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/x-com-ufo-defense.jsdos&anonymous=1",
    "x-com ufo defense": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/x-com-ufo-defense.jsdos&anonymous=1",
    "ultima": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/ultima-underworld.jsdos&anonymous=1",
    "baldur's gate": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/baldurs-gate.jsdos&anonymous=1",
    "fallout": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/fallout.jsdos&anonymous=1",
    "fallout 2": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/fallout-2.jsdos&anonymous=1",
    "deus ex": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/deus-ex.jsdos&anonymous=1",
    "system shock": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/system-shock.jsdos&anonymous=1",
    "diablo": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/diablo.jsdos&anonymous=1",
    "heroes of might and magic": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/heroes-of-might-and-magic.jsdos&anonymous=1",
    "heroes of might and magic ii": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/heroes-of-might-and-magic-2.jsdos&anonymous=1",
    "red alert": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/command-and-conquer-red-alert.jsdos&anonymous=1",
    "command \u0026 conquer red alert": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/command-and-conquer-red-alert.jsdos&anonymous=1",
    "theme hospital": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/theme-hospital.jsdos&anonymous=1",
    "transport tycoon deluxe": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/transport-tycoon-deluxe.jsdos&anonymous=1",
    "rollercoaster tycoon": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/rollercoaster-tycoon.jsdos&anonymous=1",
    "prince of persia": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/prince-of-persia.jsdos&anonymous=1",
    "prince of persia 2": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/prince-of-persia-2.jsdos&anonymous=1",
    "another world": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/another-world.jsdos&anonymous=1",
    "flashback": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/flashback.jsdos&anonymous=1",
    "lode runner": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/lode-runner.jsdos&anonymous=1",
    "lemmings": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/lemmings.jsdos&anonymous=1",
    "the oregon trail": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/oregon-trail.jsdos&anonymous=1",
    "oregon trail": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/oregon-trail.jsdos&anonymous=1",
    "where in the world is carmen sandiego": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/where-in-the-world-is-carmen-sandiego.jsdos&anonymous=1",
    "monkey island": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/the-secret-of-monkey-island.jsdos&anonymous=1",
    "the secret of monkey island": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/the-secret-of-monkey-island.jsdos&anonymous=1",
    "day of the tentacle": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/day-of-the-tentacle.jsdos&anonymous=1",
    "sam \u0026 max hit the road": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/sam-and-max-hit-the-road.jsdos&anonymous=1",
    "full throttle": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/full-throttle.jsdos&anonymous=1",
    "indiana jones and the fate of atlantis": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/indiana-jones-and-the-fate-of-atlantis.jsdos&anonymous=1",
    "indy500": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/indianapolis-500.jsdos&anonymous=1",
    "stunts": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/stunts.jsdos&anonymous=1",
    "test drive": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/test-drive.jsdos&anonymous=1",
    "test drive ii": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/test-drive-2.jsdos&anonymous=1",
    "lotus esprit turbo challenge": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/lotus-esprit-turbo-challenge.jsdos&anonymous=1",
    "outrun": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/outrun.jsdos&anonymous=1",
    "outrun 2019": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/outrun-2019.jsdos&anonymous=1",
    "turrican ii": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/turrican-2.jsdos&anonymous=1",
    "rick dangerous": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/rick-dangerous.jsdos&anonymous=1",
    "rick dangerous ii": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/rick-dangerous-2.jsdos&anonymous=1",
    "supaplex": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/supaplex.jsdos&anonymous=1",
    "boulder dash": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/boulder-dash.jsdos&anonymous=1",
    "dig dug": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/dig-dug.jsdos&anonymous=1",
    "mr. do!": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/mr-do.jsdos&anonymous=1",
    "galaxian": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/galaxian.jsdos&anonymous=1",
    "galaga": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/galaga.jsdos&anonymous=1",
    "space invaders": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/space-invaders.jsdos&anonymous=1",
    "pac-man": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/pac-man.jsdos&anonymous=1",
    "ms. pac-man": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/ms-pac-man.jsdos&anonymous=1",
    "frogger": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/frogger.jsdos&anonymous=1",
    "centipede": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/centipede.jsdos&anonymous=1",
    "millipede": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/millipede.jsdos&anonymous=1",
    "asteroids": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/asteroids.jsdos&anonymous=1",
    "defender": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/defender.jsdos&anonymous=1",
    "missile command": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/missile-command.jsdos&anonymous=1",
    "breakout": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/breakout.jsdos&anonymous=1",
    "arkanoid": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/arkanoid.jsdos&anonymous=1",
    "tetris": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/tetris.jsdos&anonymous=1",
    "pong": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/pong.jsdos&anonymous=1",
    "snake": "https://dos.zone/player/?bundleUrl=https://dos.zone/games/snake.jsdos&anonymous=1",
}

def normalize(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())

norm_map = {normalize(k): v for k, v in DOS_ZONE_MAP.items()}

replaced = 0
already_embeddable = 0
externalized = 0

for g in games:
    lc = g.setdefault('launchConfig', {})
    current_url = lc.get('approvedEmbedUrl') or g.get('url', '')
    original_url = lc.get('approvedExternalUrl') or current_url
    
    # Skip games already on embeddable hosts
    if any(host in current_url for host in ['gamepix.com', 'dos.zone', 'gamedistribution.com', 'hextris.github.io', 'play2048.co']):
        already_embeddable += 1
        continue
    
    # Only process retrogames.cc external-only entries
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

print(f'Already embeddable (skipped): {already_embeddable}')
print(f'Replaced with DOS Zone embeds: {replaced}')
print(f'Marked as external-only: {externalized}')
