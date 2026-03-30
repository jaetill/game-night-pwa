# Game Night PWA — Claude Context

## What this app is
A PWA for organizing board game nights with a small friend group. Features:
event creation, RSVP tracking, board game collection management (via
BoardGameGeek), email invitations and nudges, and host controls.

Hosted at **https://gamenights.jaetill.com** (GitHub Pages frontend, AWS backend).

## Tech stack
- **Frontend**: Vite + Tailwind SPA, vanilla JS (no framework). Three HTML entry
  points: `index.html`, `login.html`, `signup.html`. Auth via `aws-amplify`.
  Tests via Vitest + happy-dom.
- **Backend**: Multiple Lambdas behind a single API Gateway. All Node.js (CommonJS).
- **Storage**: S3 bucket `jaetill-game-nights` (private) — presigned URLs used
  for frontend reads/writes (frontend never calls S3 directly).
- **Email**: Postmark (`FROM_EMAIL=jason@jaetill.com`, `POSTMARK_API_KEY` on Lambda).
- **BGG**: BoardGameGeek XML API — user imports their collection via XML paste or
  download; stored in S3 per-user.
- **Hosting**: GitHub Pages (frontend) — no CloudFront. DNS `gamenights.jaetill.com`
  is a CNAME to `jaetill.github.io`.

## AWS resources
| Resource | Value |
|---|---|
| S3 bucket | `jaetill-game-nights` |
| API Gateway | `pufsqfvq8g` (prod stage) |
| Cognito user pool | `us-east-2_xneeJzaDJ` (shared with meal-planner) |
| Cognito web client | `34et7dk67ngqep1oqef49te0ic` (game-night-specific client) |
| GitHub deploy role | `game-night-github-deploy` (OIDC, GitHub Pages deploy) |
| Region | `us-east-2` |

## Lambda functions and roles
| Function | Role | Purpose |
|---|---|---|
| `nudgeNonResponders` | `nudge-lambda-role` | Send invite + nudge emails via Postmark |
| `bggProxy` | `bggProxy-role-4m5m0lfj` | Proxy BGG XML API (CORS workaround) |
| `GeneratePresignedGetUrl` | `GeneratePresignedGetUrl-role-vghochhj` | S3 presigned download URL |
| `GeneratePresignedPost` | `GeneratePresignedPost-role-1hw3dtet` | S3 presigned upload URL |

## Lambda env vars
| Function | Var | Purpose |
|---|---|---|
| `nudgeNonResponders` | `POSTMARK_API_KEY` | Postmark server token |
| `nudgeNonResponders` | `FROM_EMAIL` | `jason@jaetill.com` |
| `nudgeNonResponders` | `COGNITO_USER_POOL_ID` | `us-east-2_xneeJzaDJ` |
| `nudgeNonResponders` | `S3_BUCKET` | `jaetill-game-nights` |
| `nudgeNonResponders` | `APP_URL` | `https://gamenights.jaetill.com/` |

## API routes (`pufsqfvq8g/prod`)
All routes require Cognito JWT in `Authorization` header (via `authFetch` utility).

| Method | Route | Lambda | Purpose |
|---|---|---|---|
| POST | `/nudge` | nudgeNonResponders | Send reminders to non-responders |
| POST | `/invite` | nudgeNonResponders | Send invite email to a new guest |
| GET | `/get-token` | GeneratePresignedGetUrl | Presigned URL to download `gameNights.json` |
| POST | `/upload-token` | GeneratePresignedPost | Presigned URL to upload `gameNights.json` |
| GET | `/bgg` | bggProxy | Proxy BGG XML collection for a username |

## S3 data layout (`jaetill-game-nights`)
```
gameNights.json                   — master list of all game night events
profiles/{userId}.json            — user profile (displayName, bggUsername, email, phone)
bgg-collections/{userId}.json     — user's BGG game collection
```

Frontend never reads/writes S3 directly — always via presigned URLs from
`GeneratePresignedGetUrl` / `GeneratePresignedPost`.

## Frontend source (`src/js/`)
```
app.js                            — bootstrap, auth guard (redirects to login.html)
config.js                         — Amplify/Cognito config, DEBUG_MODE
custom-login.js                   — custom Cognito sign-in form handler
custom-signup.js                  — custom Cognito sign-up form handler
auth/
  userStore.js                    — global user state
  profile.js                      — load/save user profile (S3 + Cognito attributes)
  permissions.js                  — role checks (host, invited, RSVP'd)
  session-check.js                — session validation
data/
  index.js                        — data module exports
  state.js                        — global owned games array
  storage.js                      — game night sync (merge cloud/local, S3 up/download)
  bgg.js                          — BGG XML parsing, collection import
  gameFilters.js                  — game filtering logic
components/
  render.js                       — main app renderer
  renderGameNights.js             — event list
  renderGameNightForm.js          — event editor
  renderGameNightHostControls.js  — host-only UI (invite, nudge, add game)
  renderGameNightSummary.js       — event detail view
  renderRSVP.js                   — RSVP / interest selection
  renderSelectedGames.js          — games at event with player counts
  renderProfileModal.js           — profile editor
  renderImportModal.js            — BGG collection import flow
  gameSelectionModal.js           — game picker from owned collection
  renderSuggestions.js            — player suggestions
  renderFood.js                   — food/catering details
  renderGlobalHostPanel.js        — global "New Event" button
utils/
  authFetch.js                    — wraps fetch with Cognito JWT Authorization header
  index.js                        — sync orchestration
  sync.js                         — core sync logic
  userDirectory.js                — build user lookup from nights
ui/elements.js                    — btn(), input(), modal helpers
ui/toast.js                       — toast notifications
```

## Deployment
- `deploy.yml` has three jobs: **test → build → deploy**
- Tests run via `npm test` (Vitest) before any deploy
- Frontend built with `VITE_API_URL` and `VITE_ADMIN_NAMES` from GitHub secrets
- Deployed to GitHub Pages (not S3) — no CloudFront, no invalidation step
- Lambdas are **not deployed by this workflow** — deployed manually or separately

## BGG integration
- User enters BGG username in profile modal
- XML fetched from `https://boardgamegeek.com/xmlapi2/collection?username={u}&own=1&stats=1`
- Parsed via DOMParser — extracts id, title, thumbnail, minPlayers, maxPlayers
- Collection stored in S3 at `bgg-collections/{userId}.json`
- Cached in localStorage (`bggGames_{userId}`, version key `bggGamesVer_{userId}`, current version v5)

## Email (Postmark)
- Invite email: triggered when host adds a guest → `POST /invite`
- Nudge email: triggered by "Nudge non-responders" button → `POST /nudge`
  - Loads `gameNights.json` from S3, finds non-responders, fetches their emails
    from Cognito, sends individually via Postmark
- Both use `from: FROM_EMAIL` (`jason@jaetill.com`), `MessageStream: 'outbound'`

## Key gotchas
- Frontend is on **GitHub Pages**, not CloudFront — no OAC, no S3 direct reads.
  All S3 access is via presigned URLs issued by Lambda.
- Lambdas are **not in the deploy workflow** — changes to Lambda code must be
  deployed separately (manually or via a separate workflow/step).
- Cognito user pool is **shared with meal-planner** (`us-east-2_xneeJzaDJ`) but
  uses a different app client ID.
- `VITE_ADMIN_NAMES` controls who sees host controls — set in GitHub secrets.
- BGG XML API has CORS restrictions — bggProxy Lambda exists to work around this.
