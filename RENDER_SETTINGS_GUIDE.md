# Elite S.M.U.V.E. 2.0 Render Deployment Guide

Follow these precise settings to ensure stable production environments.

## 1. Backend Service (Web Service)
**Service Name**: `smuve-v4-backend`

- **Root Directory**: `server`
- **Build Command**: `npm install --legacy-peer-deps`
- **Start Command**: `node index.js`
- **Node Version**: `22.12.0` (Set `NODE_VERSION` in Env Vars)

### Critical Configuration:
If the **Root Directory** is set to `server`, DO NOT use `cd server` in your Build or Start commands. Render already places you in that directory.

### Required Environment Variables:
- `DATABASE_URL`: Connection string from Neon.
- `JWT_SECRET`: Random secure string (e.g., `openssl rand -base64 32`).
- `GEMINI_API_KEY`: Google Gemini API Key.
- `FRONTEND_ORIGIN`: `https://www.smuvejeffpresents.com`
- `NODE_ENV`: `production`

---

## 2. Frontend Service (Static Site)
**Service Name**: `S.M.U.V.E-2.0`

- **Root Directory**: (Leave Empty)
- **Build Command**: `npm install --legacy-peer-deps && npm run build`
- **Publish Directory**: `Build/browser`

### Configuration for Angular Routing:
- Go to **Redirects/Rewrites** in the Render Dashboard.
- Add Rule:
  - **Source**: `/*`
  - **Destination**: `/index.html`
  - **Action**: `Rewrite`

---

## 3. Automated Setup (Blueprints)
You can use the included `render.yaml` in the root of the repository to automatically configure these services by selecting "New" -> "Blueprint" on the Render Dashboard.
