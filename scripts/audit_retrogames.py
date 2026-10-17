"""
audit_retrogames.py — READ-ONLY catalog integrity audit for Tha Spot feed.

This script reports potential issues in tha-spot-feed.json without modifying it.
It does NOT perform automatic URL substitutions or fuzzy title matching, because
those operations have historically introduced incorrect game-to-URL mappings
(e.g. mapping one title's retrogames.cc ID to a completely different game).

To fix issues found by this script, edit tha-spot-feed.json manually with
exact, verified URL-to-title mappings.

Usage:
    python scripts/audit_retrogames.py
    python scripts/audit_retrogames.py --fail-on-issues   # exit 1 if issues found
"""

import json
import re
import sys

FEED_PATH = 'src/assets/data/tha-spot-feed.json'

with open(FEED_PATH) as f:
    data = json.load(f)

games = data['games']
issues = []


def extract_retro_id(url: str) -> str | None:
    """Extract the numeric ID from a retrogames.cc embed URL.

    retrogames.cc embed URLs have the canonical form:
        https://www.retrogames.cc/embed/{id}-{slug}.html
    We match the first numeric segment that immediately follows '/embed/' to
    avoid false positives from any other numeric segments in the slug.
    """
    m = re.search(r'/embed/(\d+)-[^/]+\.html', url)
    return m.group(1) if m else None


def extract_retro_slug(url: str) -> str | None:
    """Extract the game-name slug from a retrogames.cc embed URL."""
    m = re.search(r'/embed/\d+-(.+)\.html', url)
    return m.group(1) if m else None


# ── 1. Duplicate game IDs ───────────────────────────────────────────────────
id_map: dict[str, list[int]] = {}
for i, g in enumerate(games):
    gid = g.get('id', '')
    id_map.setdefault(gid, []).append(i)

for gid, indices in id_map.items():
    if len(indices) > 1:
        names = [games[i]['name'] for i in indices]
        issues.append(
            f"DUPLICATE_ID: id='{gid}' appears at indices {indices} "
            f"(names: {names})"
        )

# ── 2. Duplicate game names ──────────────────────────────────────────────────
name_map: dict[str, list[int]] = {}
for i, g in enumerate(games):
    name_map.setdefault(g.get('name', ''), []).append(i)

for name, indices in name_map.items():
    if len(indices) > 1:
        issues.append(
            f"DUPLICATE_NAME: '{name}' appears at indices {indices}"
        )

# ── 3. Same retrogames.cc numeric ID assigned to different game entries ──────
retro_id_to_entries: dict[str, list[tuple[int, str, str]]] = {}

for i, g in enumerate(games):
    lc = g.get('launchConfig', {})
    for url in [
        g.get('url', ''),
        lc.get('approvedEmbedUrl', ''),
        lc.get('approvedExternalUrl', ''),
    ]:
        if url and 'retrogames.cc' in url:
            rid = extract_retro_id(url)
            if rid:
                retro_id_to_entries.setdefault(rid, []).append((i, g['name'], url))

for rid, entries in retro_id_to_entries.items():
    # Collapse to unique (index, name) pairs
    seen: dict[int, str] = {}
    for idx, name, url in entries:
        seen.setdefault(idx, name)
    unique_pairs = list(seen.items())
    unique_names = {n for _, n in unique_pairs}
    if len(unique_names) > 1:
        detail = '; '.join(f"[{i}] {n}" for i, n in unique_pairs)
        issues.append(
            f"RETRO_ID_CONFLICT: retrogames.cc ID {rid} appears under "
            f"different game names: {detail}"
        )

# ── 4. URL slug does not plausibly match game name ───────────────────────────
IGNORED_SLUG_TOKENS = {
    'usa', 'europe', 'japan', 'world', 'ntsc', 'pal', 'nes', 'snes', 'n64',
    'gba', 'gbc', 'gb', 'ps1', 'ps2', 'ps3', 'xbox', 'gc', 'genesis',
    'mega', 'drive', 'dreamcast', 'arcade', 'rev', 'disc', 'the', 'a', 'an',
    'and', 'of', 'in', 'to', 'v1', 'v2',
}


def slug_core_words(slug: str) -> set[str]:
    """Return meaningful words from a retrogames.cc slug."""
    return {w for w in slug.split('-') if w and w not in IGNORED_SLUG_TOKENS and not w.isdigit()}


def name_core_words(name: str) -> set[str]:
    """Return meaningful lower-case words from a game name."""
    tokens = re.sub(r"[^a-z0-9 ]", ' ', name.lower()).split()
    return {w for w in tokens if w and w not in IGNORED_SLUG_TOKENS and not w.isdigit() and len(w) > 1}


for i, g in enumerate(games):
    lc = g.get('launchConfig', {})
    name = g.get('name', '')
    for url in [
        g.get('url', ''),
        lc.get('approvedEmbedUrl', ''),
        lc.get('approvedExternalUrl', ''),
    ]:
        if not url or 'retrogames.cc' not in url:
            continue
        slug = extract_retro_slug(url)
        if not slug:
            continue
        slug_words = slug_core_words(slug)
        name_words = name_core_words(name)
        # Flag if there is zero word overlap between slug and game name
        if slug_words and name_words and not (slug_words & name_words):
            issues.append(
                f"SLUG_MISMATCH: [{i}] '{name}' — URL slug '{slug}' shares "
                f"no words with game name (slug_words={slug_words}, "
                f"name_words={name_words}) | url={url}"
            )
            break  # one report per entry is enough

# ── 5. Missing launchConfig URLs ─────────────────────────────────────────────
for i, g in enumerate(games):
    lc = g.get('launchConfig', {})
    embed = lc.get('approvedEmbedUrl', '')
    ext = lc.get('approvedExternalUrl', '')
    if not embed and not ext:
        issues.append(
            f"NO_URL: [{i}] '{g.get('name')}' has no approvedEmbedUrl or "
            f"approvedExternalUrl in launchConfig"
        )

# ── Summary ──────────────────────────────────────────────────────────────────
print(f"Audited {len(games)} games in {FEED_PATH}")
print(f"Issues found: {len(issues)}\n")

for issue in issues:
    print(f"  {issue}")

if '--fail-on-issues' in sys.argv and issues:
    sys.exit(1)
