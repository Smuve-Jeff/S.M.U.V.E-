# Render Deployment Configuration Fixes

The backend service is currently configured with `rootDir: src`.
To fix the deployment without changing your dashboard settings:

### For Backend Service (`srv-d6vfkafgi27c73evqceg`):
- **Build Command**: `cd server && npm install`
- **Start Command**: `node server/index.js`

I have ensured that the `server` directory exists inside `src` to match this config.

### For Frontend Service (`srv-d7r58fd7vvec73e4mkf0`):
- **Build Command**: `npm install --legacy-peer-deps && npm run build`
- **Start Command**: `npm run start`

**Important**: I noticed the backend expects a `JWT_SECRET` environment variable. Please ensure this is set in the Render Dashboard.
