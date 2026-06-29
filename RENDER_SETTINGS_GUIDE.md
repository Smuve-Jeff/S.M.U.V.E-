# Elite S.M.U.V.E. 2.0 Render Deployment Guide

Follow these instructions to fix and optimize your deployment.

## 1. Backend Service (Web Service)
**Service Name**: `smuve-v4-backend-9951606049235487441`

- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `node index.js`

### Required Environment Variables:
- `DATABASE_URL`: Your Neon Postgres connection string.
- `JWT_SECRET`: A secure random string.
- `GEMINI_API_KEY`: Your Google Gemini AI API key.
- `FRONTEND_ORIGIN`: `https://www.smuvejeffpresents.com`
- `NODE_ENV`: `production`

---

## 2. Frontend Service (Static Site)
**Service Name**: `S.M.U.V.E-2.0`

- **Build Command**: `npm install --legacy-peer-deps && npm run build`
- **Publish Directory**: `Build/browser`

### Configuration for SPAs (Required for Angular Routing):
- Go to **Redirects/Rewrites** in the Render Dashboard for the Static Site.
- Add a new Rule:
  - **Source**: `/*`
  - **Destination**: `/index.html`
  - **Action**: `Rewrite`

---

## 3. Production Origins
- **Main Domain**: `https://www.smuvejeffpresents.com`
- **Socket.io/API Origin**: `https://smuve-v4-backend-9951606049235487441.onrender.com`

*Note: The GEMINI_API_KEY should only be configured on the backend service. The frontend proxies all AI calls through the backend for enhanced security.*
