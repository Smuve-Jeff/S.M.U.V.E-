#!/usr/bin/env node
// Merge script: safely append additions from src/assets/data/tha-spot-feed-additions.json
// into src/assets/data/tha-spot-feed.json without duplicating game ids.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.cwd();
const FEED_PATH = path.join(REPO_ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');
const ADD_PATH = path.join(REPO_ROOT, 'src', 'assets', 'data', 'tha-spot-feed-additions.json');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('Failed to read/parse', p, err.message);
    process.exit(1);
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

const feed = readJson(FEED_PATH);
const additions = readJson(ADD_PATH);

if (!Array.isArray(feed.games)) {
  console.error('Existing feed has no games array at', FEED_PATH);
  process.exit(1);
}
if (!Array.isArray(additions.games)) {
  console.error('Additions file has no games array at', ADD_PATH);
  process.exit(1);
}

const existingIds = new Set(feed.games.map((g) => String(g.id)));
let added = 0;
for (const g of additions.games) {
  if (!g || !g.id) continue;
  if (existingIds.has(String(g.id))) continue;
  feed.games.push(g);
  existingIds.add(String(g.id));
  added++;
}

if (added === 0) {
  console.log('No new games to add.');
} else {
  writeJson(FEED_PATH, feed);
  console.log(`Merged ${added} new game(s) into tha-spot-feed.json`);
}
