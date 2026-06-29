# Elite S.M.U.V.E. 2.0 Render Deployment Guide

Follow these instructions to fix and optimize your deployment.

## 1. Backend Service (Web Service)
**Service Name**: `smuve-v4-backend-9951606049235487441` (or your Node.js backend)

- **Root Directory**: (Leave empty or set to Root)
- **Build Command**: `cd server && npm install`
- **Start Command**: `node server/index.js`

### Required Environment Variables:
- `DATABASE_URL`: Your Neon Postgres connection string.
- `JWT_SECRET`: A secure random string (e.g., `SMUVE_SALT_V4_SECURE_HASH`).
- `GEMINI_API_KEY`: Your Google Gemini AI API key.
- `FRONTEND_ORIGIN`: `https://www.smuvejeffpresents.com`
- `NODE_ENV`: `production`

---

## 2. Frontend Service (Static Site)
**Action Required**: It is highly recommended to convert the frontend from a "Web Service" to a **Static Site** on Render for better performance and reduced costs.

- **Build Command**: `npm install --legacy-peer-deps && npm run build`
- **Publish Directory**: `Build/browser`

### Configuration for SPAs (Required for Angular Routing):
- Go to **Redirects/Rewrites** in the Render Dashboard for the Static Site.
- Add a new Rule:
  - **Source**: `/*`
  - **Destination**: `/index.html`
  - **Action**: `Rewrite`
- This ensures that refreshing the page or deep-linking works correctly with the Angular Router.

---

## 3. Production Origins
- **Main Domain**: `https://www.smuvejeffpresents.com`
- **Socket.io/API Origin**: `https://smuve-v4-backend-9951606049235487441.onrender.com`
