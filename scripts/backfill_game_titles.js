#!/usr/bin/env node
/**
 * scripts/backfill_game_titles.js
 * Backfill the game_title column in game_challenges and notifications using
 * the local tha-spot feed. Requires PG connection environment variables.
 *
 * Usage:
 *   NODE_ENV=production node scripts/backfill_game_titles.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async function main() {
  try {
    const feedPath = path.join(__dirname, '..', 'src', 'assets', 'data', 'tha-spot-feed.json');
    const feedRaw = fs.readFileSync(feedPath, 'utf8');
    const feed = JSON.parse(feedRaw);
    const map = new Map();
    (feed.games || []).forEach(g => map.set(String(g.id), g.name));

    const client = new Client();
    await client.connect();

    // Backfill challenges
    const res = await client.query(`SELECT id, game_id FROM game_challenges WHERE game_title IS NULL OR game_title = '';`);
    for (const row of res.rows) {
      const title = map.get(String(row.game_id)) || null;
      if (title) {
        await client.query(`UPDATE game_challenges SET game_title = $1 WHERE id = $2`, [title, row.id]);
        console.log(`Updated challenge ${row.id} -> ${title}`);
      }
    }

    const res2 = await client.query(`SELECT id, payload, game_id FROM notifications WHERE game_title IS NULL OR game_title = '';`);
    for (const row of res2.rows) {
      const title = map.get(String(row.game_id)) || null;
      if (title) {
        await client.query(`UPDATE notifications SET game_title = $1 WHERE id = $2`, [title, row.id]);
        console.log(`Updated notification ${row.id} -> ${title}`);
      }
    }

    await client.end();
    console.log('Backfill complete.');
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
})();
