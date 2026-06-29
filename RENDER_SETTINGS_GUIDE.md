# Updated Render Deployment Configuration Fixes

The backend service is currently consolidated in `src/server`.

### For Backend Service (`srv-d6vfkafgi27c73evqceg`):
- **Root Directory**: `src` (Confirmed)
- **Build Command**: `cd server && npm install`
- **Start Command**: `node server/index.js`

### For Frontend Service (`srv-d7r58fd7vvec73e4mkf0`):
- **Root Directory**: (Leave as root)
- **Build Command**: `npm install --legacy-peer-deps && npm run build`
- **Start Command**: `npm run start`

**Environment Variables**:
Ensure the following are set in the Render Dashboard for the Backend:
- `DATABASE_URL`: Your Neon Postgres connection string.
- `JWT_SECRET`: A secure random string for token signing.
- `GEMINI_API_KEY`: Your Google Gemini AI API key.
- `SMTP_HOST`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`: For email notifications.
- `FRONTEND_ORIGIN`: `https://s-m-u-v-e-2-0-fixed.onrender.com`
