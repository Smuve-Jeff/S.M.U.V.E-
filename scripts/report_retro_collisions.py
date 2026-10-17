#!/usr/bin/env python3
"""
scripts/report_retro_collisions.py — report retrogames.cc numeric-id collisions
"""
import json
import re
import sys
from pathlib import Path

FEED_PATH = Path('src/assets/data/tha-spot-feed.json')

if not FEED_PATH.exists():
    print('Feed not found at', FEED_PATH)
    sys.exit(1)

with open(FEED_PATH) as f:
    data = json.load(f)

games = data.get('games', [])

def extract_retro_id(url: str):
    m = re.search(r'/embed/(\d+)-[^/]+\.html', url)
    return m.group(1) if m else None

retro_map = {}
for i, g in enumerate(games):
    lc = g.get('launchConfig') or {}
    for url in [g.get('url', ''), lc.get('approvedEmbedUrl', ''), lc.get('approvedExternalUrl', '')]:
        if url and 'retrogames.cc' in url:
            rid = extract_retro_id(url)
            if rid:
                retro_map.setdefault(rid, []).append({'index': i, 'id': g.get('id'), 'name': g.get('name'), 'url': url})

collisions = {k:v for k,v in retro_map.items() if len(v) > 1}

out = {
    'collisions': collisions,
    'total_games': len(games),
}

out_path = Path('reports/retro_collisions.json')
out_path.parent.mkdir(parents=True, exist_ok=True)
with open(out_path, 'w') as f:
    json.dump(out, f, indent=2)

print('Wrote report to', out_path)
if collisions:
    print('Collisions found for retrogames IDs:', ','.join(collisions.keys()))
else:
    print('No collisions found.')
