#!/usr/bin/env node
// apply_tha_spot_updates.cjs
// Merge additions and update every game's image to point to an SVG under /assets/games/<id>.svg

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FEED = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');
const ADD = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed-additions.json');

function readJson(p){
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
function writeJson(p,obj){
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

const feed = readJson(FEED);
const additions = readJson(ADD);

if (!Array.isArray(feed.games) || !Array.isArray(additions.games)){
  console.error('Missing games array'); process.exit(1);
}

const existing = new Map(feed.games.map(g=>[String(g.id), g]));
let added = 0;
for (const g of additions.games){
  if (!g || !g.id) continue;
  if (existing.has(String(g.id))) continue;
  feed.games.push(g);
  existing.set(String(g.id), g);
  added++;
}

// Set image field for every game to the SVG path (per-game SVGs must exist under assets/games/<id>.svg)
for (const g of feed.games){
  try{
    const id = String(g.id);
    g.image = `/assets/games/${id}.svg`;
  }catch(e){/* ignore */}
}

writeJson(FEED, feed);
console.log(`Applied updates: merged ${added} additions; updated ${feed.games.length} games to SVG artwork.`);
