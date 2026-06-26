import json

file_path = 'src/assets/data/tha-spot-feed.json'

with open(file_path, 'r') as f:
    data = json.load(f)

new_games = [
    {
        "id": "tecmo-bowl-elite",
        "name": "Tecmo Bowl",
        "url": "https://www.retrogames.cc/embed/18844-tecmo-bowl-usa.html",
        "genre": "Sports",
        "description": "The ultimate 8-bit football classic. Simple, addictive, and legendary. Featuring iconic arcade-style gridiron action.",
        "availability": "Online",
        "playersOnline": 12400,
        "rating": 4.9,
        "badgeIds": ["classic", "elite"],
        "tags": ["Sports", "Retro", "NES", "Football"],
        "launchConfig": {
            "approvedEmbedUrl": "https://www.retrogames.cc/embed/18844-tecmo-bowl-usa.html",
            "embedMode": "inline",
            "secure_mode": "wasm"
        },
        "art": {
            "eyebrow": "8-Bit Legend",
            "accentStart": "#ef4444",
            "accentEnd": "#991b1b"
        },
        "image": "https://www.retrogames.cc/assets/images/screenshots/nes/tecmo-bowl-usa.png"
    },
    {
        "id": "nba-jam-elite",
        "name": "NBA Jam",
        "url": "https://www.retrogames.cc/embed/17392-nba-jam-usa.html",
        "genre": "Sports",
        "description": "HE'S ON FIRE! The definitive arcade basketball experience. High-flying dunks and intense 2-on-2 action.",
        "availability": "Online",
        "playersOnline": 15600,
        "rating": 5.0,
        "badgeIds": ["classic", "elite"],
        "tags": ["Sports", "Retro", "Arcade", "Basketball"],
        "launchConfig": {
            "approvedEmbedUrl": "https://www.retrogames.cc/embed/17392-nba-jam-usa.html",
            "embedMode": "inline",
            "secure_mode": "wasm"
        },
        "art": {
            "eyebrow": "Arcade Classic",
            "accentStart": "#f59e0b",
            "accentEnd": "#b45309"
        },
        "image": "https://www.retrogames.cc/assets/images/screenshots/arcade/nba-jam-usa.png"
    },
    {
        "id": "nba-live-2000-elite",
        "name": "NBA Live 2000",
        "url": "https://www.retrogames.cc/embed/41887-nba-live-2000-usa.html",
        "genre": "Sports",
        "description": "A turning point in basketball simulation. Featuring Michael Jordan and the deepest gameplay of its era.",
        "availability": "Online",
        "playersOnline": 8900,
        "rating": 4.7,
        "badgeIds": ["classic", "elite"],
        "tags": ["Sports", "Retro", "PS1", "Basketball"],
        "launchConfig": {
            "approvedEmbedUrl": "https://www.retrogames.cc/embed/41887-nba-live-2000-usa.html",
            "embedMode": "inline",
            "secure_mode": "wasm"
        },
        "art": {
            "eyebrow": "EA Sports Heritage",
            "accentStart": "#3b82f6",
            "accentEnd": "#1d4ed8"
        },
        "image": "https://www.retrogames.cc/assets/images/screenshots/psx/nba-live-2000-usa.png"
    }
]

# Add new games if they don't exist
existing_ids = {g['id'] for g in data['games']}
for game in new_games:
    if game['id'] not in existing_ids:
        data['games'].append(game)

# Update rail-sports-dominance
for rail in data['recommendationRails']:
    if rail['id'] == 'rail-sports-dominance':
        new_ids = ["tecmo-bowl-elite", "nba-jam-elite", "madden-2004-elite", "nba-live-2000-elite", "madden-24-tribute-elite"]
        rail['gameIds'] = new_ids + [gid for gid in rail.get('gameIds', []) if gid not in new_ids]
        break

with open(file_path, 'w') as f:
    json.dump(data, f, indent=2)

print("Games added and rail updated successfully.")
