---
name: project_setup
description: Build tooling, testing, and deployment added to the game-night-pwa project
type: project
---

Vite + Vitest added for local dev and testing. Project now has npm scripts: `dev`, `build`, `preview`, `test`, `test:watch`.

**Why:** Project had no build tooling, no tests, no CI/CD — everything was hardcoded and hard to run locally.

**How to apply:** Suggest `npm run dev` for local testing and `npm test` for running tests. The build artifact is in `dist/`.

Key decisions:
- User identity (name, BGG username) stored in localStorage; prompted on first visit via `js/userSetup.js`
- Admin names configured via `VITE_ADMIN_NAMES` env var (comma-separated) — no longer hardcoded
- API URL configured via `VITE_API_URL` env var — `.env.example` shows the template
- GitHub Actions workflow at `.github/workflows/deploy.yml` runs tests then deploys to GitHub Pages on push to master
- Tests in `tests/` — `createGameNight.test.js` and `filterGames.test.js`
