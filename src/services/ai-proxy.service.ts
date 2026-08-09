/**
 * ai-proxy service stub — see src/services/user.service.ts.
 * Real text/music generation orchestration lives in server/index.js
 * (the @google/genai path); full migration lands in a follow-up.
 *
 * Configure the underlying Google client lazily: pulling credentials
 * at import time would crash any caller that hasn't set GEMINI_API_KEY
 * yet (E2E tests, dry runs, dev tooling).
 */
export {};
export default {};
