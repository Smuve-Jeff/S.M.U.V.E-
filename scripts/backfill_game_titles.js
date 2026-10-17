#!/usr/bin/env node
/**
 * Backfill human-friendly game titles in game_challenges and notifications.
 *
 * Usage:
 *   NODE_ENV=production node scripts/backfill_game_titles.js
 *
 * The script reads DATABASE_URL from the environment. It never writes or
 * prints credentials, and it only fills rows whose game_title is empty.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const feedPath = path.join(
  process.cwd(),
  'src',
  'assets',
  'data',
  'tha-spot-feed.json'
);

const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
const gameTitles = new Map(
  (feed.games || []).map((game) => [String(game.id), game.name])
);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

let transactionStarted = false;

try {
  await client.connect();
  await client.query('BEGIN');
  transactionStarted = true;

  const challengeResult = await client.query(`
    SELECT id, game_id
    FROM game_challenges
    WHERE game_title IS NULL OR game_title = ''
    FOR UPDATE;
  `);

  let challengesUpdated = 0;
  for (const row of challengeResult.rows) {
    const title = gameTitles.get(String(row.game_id));
    if (!title) continue;

    const result = await client.query(
      `UPDATE game_challenges
       SET game_title = $1
       WHERE id = $2 AND (game_title IS NULL OR game_title = '')`,
      [title, row.id]
    );
    challengesUpdated += result.rowCount || 0;
  }

  // Notifications store challenge game IDs in payload.gameId (JSONB), not
  // in a top-level game_id column.
  const notificationResult = await client.query(`
    SELECT id, payload->>'gameId' AS game_id
    FROM notifications
    WHERE (game_title IS NULL OR game_title = '')
      AND payload->>'gameId' IS NOT NULL
    FOR UPDATE;
  `);

  let notificationsUpdated = 0;
  for (const row of notificationResult.rows) {
    const title = gameTitles.get(String(row.game_id));
    if (!title) continue;

    const result = await client.query(
      `UPDATE notifications
       SET game_title = $1
       WHERE id = $2 AND (game_title IS NULL OR game_title = '')`,
      [title, row.id]
    );
    notificationsUpdated += result.rowCount || 0;
  }

  await client.query('COMMIT');
  transactionStarted = false;
  console.log(
    `Backfill complete. Challenges updated: ${challengesUpdated}; notifications updated: ${notificationsUpdated}.`
  );
} catch (error) {
  if (transactionStarted) {
    await client.query('ROLLBACK').catch(() => undefined);
  }
  console.error('Backfill failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
