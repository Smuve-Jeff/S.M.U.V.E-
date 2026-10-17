-- Add game_title to challenges + notifications so we persist human-friendly titles
ALTER TABLE IF EXISTS game_challenges ADD COLUMN IF NOT EXISTS game_title TEXT;
ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS game_title TEXT;
