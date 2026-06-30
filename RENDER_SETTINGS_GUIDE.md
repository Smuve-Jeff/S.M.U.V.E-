# Elite S.M.U.V.E. 2.0 Render Deployment Guide

Follow these precise settings to ensure stable production environments. These settings are manually configured in the Render Dashboard.

## 1. Backend Service (Web Service)
**Service Name**: `smuve-v4-backend`

- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `node index.js`
- **Node Version**: `22.12.0` (Set `NODE_VERSION` in Environment Variables)

### Critical Deployment Notes:
- **Root Directory**: Since the Root Directory is set to `server`, Render executes all commands *inside* that folder. **DO NOT** use `cd server` or `npm run start --prefix server`.
- **Start Command**: Must be `node index.js`.
- **Build Command**: Must be `npm install`.

### Required Environment Variables (Environment Tab):
- `DATABASE_URL`: Your Neon PostgreSQL connection string.
- `JWT_SECRET`: A secure random string for authentication.
- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `FRONTEND_ORIGIN`: `https://www.smuvejeffpresents.com`
- `NODE_ENV`: `production`

---

## 2. Frontend Service (Static Site)
**Service Name**: `S.M.U.V.E-2.0`

- **Root Directory**: (Leave Empty / Root)
- **Build Command**: `npm install --legacy-peer-deps && npm run build`
- **Publish Directory**: `Build/browser`

### Configuration for Angular Routing (Single Page App):
To prevent 404 errors when refreshing pages:
1. Go to **Redirects/Rewrites** in the Render Dashboard.
2. Add Rule:
   - **Source**: `/*`
   - **Destination**: `/index.html`
   - **Action**: `Rewrite`

---

## 3. Troubleshooting
The backend includes a "Stability Check" during startup. If deployment fails with "Application exited early", check the Render logs for lines starting with `DEPLOYMENT_BLOCKER:`. This will tell you exactly which environment variable is missing.
