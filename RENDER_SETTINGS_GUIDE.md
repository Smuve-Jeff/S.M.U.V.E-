# Render Deployment Configuration Fixes

Please update the following settings in your Render Dashboard for `srv-d6vfkafgi27c73evqceg`:

- **Root Directory**: `(Leave Empty)` (The service was looking in `src`, but `server` is at the root)
- **Build Command**: `npm install && cd server && npm install`
- **Start Command**: `cd server && npm start`

**Environment Variables Required:**
- `TWITCH_CLIENT_ID`, `YOUTUBE_CLIENT_ID`, `DISCORD_CLIENT_ID`, etc.
- `TWITCH_REDIRECT_URI`: `https://smuve-v4-backend-9951606049235487441.onrender.com/api/auth/twitch/callback` (and similar for others)
