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
| `createEvent` | `createEvent-lambda-role` | Create game night event (API key auth) |
| `searchGames` | `searchGames-lambda-role` | Search user's BGG collection (API key auth) |
| `groups` | `groups-lambda-role` | Manage invitation groups (API key auth) |
| `apiKeyAuthorizer` | `apiKeyAuthorizer-lambda-role` | REQUEST authorizer: validates X-API-Key via SSM |

## Lambda env vars
| Function | Var | Purpose |
|---|---|---|
| `nudgeNonResponders` | `POSTMARK_API_KEY` | Postmark server token |
| `nudgeNonResponders` | `FROM_EMAIL` | `jason@jaetill.com` |
| `nudgeNonResponders` | `COGNITO_USER_POOL_ID` | `us-east-2_xneeJzaDJ` |
| `nudgeNonResponders` | `S3_BUCKET` | `jaetill-game-nights` |
| `nudgeNonResponders` | `APP_URL` | `https://gamenights.jaetill.com/` |

## API routes (`pufsqfvq8g/prod`)
Browser-facing routes use Cognito JWT (`Authorization: Bearer <token>` via `authFetch`).
MCP/API-key routes use `X-API-Key` header (validated by `apiKeyAuthorizer` → SSM lookup).

| Method | Route | Lambda | Auth | Purpose |
|---|---|---|---|---|
| POST | `/nudge` | nudgeNonResponders | Cognito JWT | Send reminders to non-responders |
| POST | `/invite` | nudgeNonResponders | Cognito JWT | Send invite email to a new guest |
| GET | `/get-token` | GeneratePresignedGetUrl | Cognito JWT | Presigned URL to download `gameNights.json` |
| POST | `/upload-token` | GeneratePresignedPost | Cognito JWT | Presigned URL to upload `gameNights.json` |
| GET | `/bgg` | bggProxy | Cognito JWT | Proxy BGG XML collection for a username |
| GET | `/profiles` | (TBD) | Cognito JWT | User profile read |
| POST | `/create-event` | createEvent | API key | Create a new game night event |
| GET | `/search-games` | searchGames | API key | Search caller's BGG collection |
| GET,POST,DELETE | `/groups` | groups | API key | Manage saved invitation groups |

### API key management
Keys are stored in SSM Parameter Store at `/game-night/api-keys/{key}` (SecureString).
Value is the Cognito **username** (e.g. `jaetill`), which matches how profile/collection
files are keyed in S3. Use `jaetill-dev` credentials + `ssm:PutParameter` to add keys.

## S3 data layout (`jaetill-game-nights`)
```
gameNights.json                   — master list of all game night events
profiles/{userId}.json            — user profile (displayName, bggUsername, email, phone)
collections/{userId}.json         — user's BGG game collection (userId = Cognito username)
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

## MCP server (`mcp/`)
A custom MCP server that wraps the Game Night API for use with Claude Desktop
and Claude Code. Uses `@modelcontextprotocol/sdk` with stdio transport.

### Tools
| Tool | Description |
|---|---|
| `search_games` | Search user's BGG collection by title |
| `list_groups` / `save_group` | Read/write invitation groups |
| `create_event` | Create a game night event (auto-resolves game names and group names) |
| `invite_to_event` | Send invite emails for an existing event |
| `list_events` / `get_event` | Read game night events via presigned URL |

### Auth
Uses `X-API-Key` header. Key set via `GAME_NIGHT_API_KEY` env var in
`.claude/mcp.json` (gitignored). Keys stored in SSM at
`/game-night/api-keys/{key}` (value = Cognito username).

### Running
Configured in `.claude/mcp.json` (not committed — contains API key).
Claude Code picks it up automatically on startup.

## Key gotchas
- Frontend is on **GitHub Pages**, not CloudFront — no OAC, no S3 direct reads.
  All S3 access is via presigned URLs issued by Lambda.
- Lambdas are **not in the deploy workflow** — changes to Lambda code must be
  deployed separately (manually or via a separate workflow/step).
- Cognito user pool is **shared with meal-planner** (`us-east-2_xneeJzaDJ`) but
  uses a different app client ID.
- `VITE_ADMIN_NAMES` controls who sees host controls — set in GitHub secrets.
- BGG XML API has CORS restrictions — bggProxy Lambda exists to work around this.
