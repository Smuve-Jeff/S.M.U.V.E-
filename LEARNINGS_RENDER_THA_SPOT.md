# Learnings: Render & Tha Spot Fixes

## Render Deployment

- When a service reports "No such file or directory" for a `cd` command, verify the `rootDir` in Render settings. If the folder is at the repo root, `rootDir` should be empty.
- Build commands should include dependency installation for both the root and any subdirectories (e.g., `npm install && cd server && npm install`).

## Feature Implementation

- **Neural Sync**: Implemented as a manual Socket.io request/approval flow to allow users to explicitly share data.
- **Direct Messages**: Real-time DMs now persist in a `direct_messages` table in Postgres, ensuring history is available across sessions.
- **Elite Metrics**: Added `eliteScore` and `squadCount` to search results, allowing the Rival Hub to display and rank operatives by performance.
- **OAuth**: Multi-platform OAuth logic was centralized in the `SocialNetworkingService` using a generic popup flow, with backend scaffolds for Twitch, YouTube, and Discord.

## Angular Signals

- Used `effect` in components to react to signals from services (e.g., synchronizing `activeHubTab`).
