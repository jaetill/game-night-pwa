# Game Night PWA — Claude Context

## What this app is
A PWA for organizing board game nights with a small friend group. Features:
event creation, RSVP tracking, board game collection management (via
BoardGameGeek), email invitations and nudges, and host controls.

Hosted at **https://gamenights.jaetill.com** (GitHub Pages frontend, AWS backend).

## Tech stack
- **Frontend**: Vite + Tailwind SPA, vanilla JS (no framework). Two HTML entry
  points: `index.html` (app) and `callback.html` (OAuth code → token exchange).
  Auth via Cognito Hosted UI at `just.jaetill.com` — OAuth 2.0 Authorization Code
  + PKCE, hand-rolled in `src/js/auth.js` (no `aws-amplify` dependency).
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
| Cognito user pool | `us-east-2_xneeJzaDJ` (shared with meal-planner and jaetill-portal) |
| Cognito web client | `34et7dk67ngqep1oqef49te0ic` (`GameNightPlannerWeb`) |
| Cognito Hosted UI | `https://just.jaetill.com` (managed login v2) |
| Cognito branding ID | `26736f11-feed-4a3f-994d-643e07b2e93d` (per-client branding required for managed login v2) |
| Required group | `game-night-users` — users without this claim are bounced back to portal |
| GitHub deploy role | `game-night-github-deploy` (OIDC, GitHub Pages deploy) |
| Region | `us-east-2` |

## Lambda functions and roles
| Function | Role | Purpose |
|---|---|---|
| `nudgeNonResponders` | `nudge-lambda-role` | Send invite + nudge emails via Postmark |
| `bggProxy` | `bggProxy-role-4m5m0lfj` | Collection + profile CRUD (S3), not just BGG proxy |
| `GeneratePresignedGetUrl` | `GeneratePresignedGetUrl-role-vghochhj` | Presigned download URL (gameNights.json + collections) |
| `GeneratePresignedPost` | `GeneratePresignedPost-role-1hw3dtet` | Upload gameNights.json with validation + invite emails |
| `createEvent` | `createEvent-lambda-role` | Create game night event (API key auth) |
| `searchGames` | `searchGames-lambda-role` | Search user's BGG collection (API key auth) |
| `groups` | `groups-lambda-role` | Manage invitation groups (API key auth) |
| `apiKeyAuthorizer` | `apiKeyAuthorizer-lambda-role` | REQUEST authorizer: validates X-API-Key via SSM |

## Lambda env vars
| Function | Var | Source | Purpose |
|---|---|---|---|
| `nudgeNonResponders` | `POSTMARK_API_KEY` | Secrets Manager: `shared/postmark-api-key` | Postmark server token |
| `nudgeNonResponders` | `FROM_EMAIL` | env var | `jason@jaetill.com` |
| `nudgeNonResponders` | `COGNITO_USER_POOL_ID` | env var | `us-east-2_xneeJzaDJ` |
| `nudgeNonResponders` | `S3_BUCKET` | env var | `jaetill-game-nights` |
| `nudgeNonResponders` | `APP_URL` | env var | `https://gamenights.jaetill.com/` |

### Secrets Manager caching
Secrets fetched from Secrets Manager are cached in-memory on first access (cold
start, ~50-100ms latency). Subsequent invocations on the same warm Lambda
instance reuse the cached value with no additional API calls.

## API routes (`pufsqfvq8g/prod`)
**All routes share one authorizer (`apiKeyAuthorizer`, dual-mode).** It accepts
either an `X-API-Key` header (resolved against SSM Parameter Store) or an
`Authorization` Cognito ID token (verified against the user pool's JWKS, with a
required `cognito:groups` claim of `game-night-users`). Either way the
downstream Lambda reads the resulting userId from
`event.requestContext.authorizer.userId`.

`identitySource` is set to `method.request.header.Host` (a no-op precondition,
since Host is always present) and `authorizerResultTtlInSeconds=0` to disable
shared cross-user caching. Caching is still effective inside the authorizer
Lambda (JWKS via `aws-jwt-verify`, API keys in a module-scoped Map).

| Method | Route | Lambda | Used by | Purpose |
|---|---|---|---|---|
| POST | `/nudge` | nudgeNonResponders | browser | Send reminders to non-responders |
| POST | `/invite` | nudgeNonResponders | browser, MCP | Send invite email to a new guest |
| GET | `/get-token` | GeneratePresignedGetUrl | browser, MCP | Presigned URL — only `gameNights.json` or `collections/{caller}.json` |
| POST | `/upload-token` | GeneratePresignedPost | browser | Validate + write `gameNights.json` (no longer issues a presigned URL despite the name) |
| GET, POST | `/bgg` | bggProxy | browser | Caller's BGG collection (userId in body must match caller) |
| GET, POST | `/profiles` | bggProxy | browser | Caller's profile (whitelisted fields only) |
| POST | `/create-event` | createEvent | MCP | Create a new game night event |
| GET | `/search-games` | searchGames | MCP | Search caller's BGG collection |
| GET, POST, DELETE | `/groups` | groups | browser, MCP | Manage saved invitation groups |

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

Frontend never reads/writes S3 directly. `gameNights.json` reads go through a
presigned URL from `GeneratePresignedGetUrl`; writes go through
`GeneratePresignedPost` which validates + persists the array via the Lambda's
own role (no presigned PUT). Profiles and collections are read/written through
`bggProxy` (`/profiles`, `/bgg`).

## Frontend source (`src/js/`)
```
auth.js                           — PKCE flow, token storage/refresh, JWT decode
callback.js                       — OAuth redirect handler (paired with /callback.html)
app.js                            — bootstrap, auth + group gate; redirects to portal if not in `game-night-users`
config.js                         — Cognito Hosted UI config, DEBUG_MODE
auth/
  userStore.js                    — global user state
  profile.js                      — load/save user profile (S3 primary; Cognito attribute sync deferred — TODO)
  permissions.js                  — role checks (host, invited, RSVP'd)
  session-check.js                — wires header buttons (logout, profile)
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

### Lambda packaging
All Lambda source lives in `lambda/`. Most handlers are deployed as a single-file
zip (Lambda's Node 22 runtime includes `@aws-sdk/*` and `@aws-sdk/s3-request-presigner`).
**Exception:** `apiKeyAuthorizer` bundles `aws-jwt-verify` from `lambda/node_modules/`.
`lambda/package.json` declares deps; `lambda/package-lock.json` and
`lambda/node_modules/` are committed to keep the build deterministic.

Build via `python build/zip.py <out.zip> <src-dir>` (a subprocess of the
ad-hoc `aws lambda update-function-code` calls used to deploy). Windows'
`Compress-Archive` produces backslash-separated paths that Linux Lambda can't
resolve, so prefer Python or `tar -a` for zipping.

| Lambda function | Handler | Source |
|---|---|---|
| `apiKeyAuthorizer` | `apiKeyAuthorizer.handler` | `lambda/apiKeyAuthorizer.js` + `node_modules/aws-jwt-verify/` |
| `createEvent` | `createEvent.handler` | `lambda/createEvent.js` |
| `groups` | `groups.handler` | `lambda/groups.js` |
| `searchGames` | `searchGames.handler` | `lambda/searchGames.js` |
| `nudgeNonResponders` | `nudge.handler` | `lambda/nudge.js` |
| `GeneratePresignedGetUrl` | `GeneratePresignedGetUrl.handler` | `lambda/GeneratePresignedGetUrl.js` |
| `GeneratePresignedPost` | `GeneratePresignedPost.handler` | `lambda/GeneratePresignedPost.js` |
| `bggProxy` | `bggProxy.handler` | `lambda/bggProxy.mjs` |

## BGG integration
- User enters BGG username in profile modal
- XML fetched from `https://boardgamegeek.com/xmlapi2/collection?username={u}&own=1&stats=1`
- Parsed via DOMParser — extracts id, title, thumbnail, minPlayers, maxPlayers
- Collection stored in S3 at `collections/{userId}.json`
- Cached in localStorage (`bggGames_{userId}`, version key `bggGamesVer_{userId}`, current version v5)

## Email (Postmark)
- Invite email: triggered when host adds a guest → `POST /invite` (handled by `nudgeNonResponders`)
- Nudge email: triggered by "Nudge non-responders" button → `POST /nudge`
  - Loads `gameNights.json` from S3, finds non-responders, fetches their emails
    from Cognito, sends individually via Postmark
- Both use `from: FROM_EMAIL` (`jason@jaetill.com`), `MessageStream: 'outbound'`
- DNS for `jaetill.com`: SPF (`v=spf1 include:spf.mtasv.net include:amazonses.com ~all`),
  DMARC (`v=DMARC1; p=none; sp=none`), and Postmark DKIM selector
  `20260313102825pm._domainkey` are all live in Route 53. AOL/Yahoo bulk-sender
  requirements (Feb 2024) are met.

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

## Auth & access control

**Sign-in flow** (Authorization Code + PKCE via Cognito Hosted UI):
1. User hits `gamenights.jaetill.com` → `app.js` checks `isAuthenticated()`
2. Not authed → `startLogin()` redirects to `https://just.jaetill.com/oauth2/authorize?...`
3. Hosted UI session cookie (set by portal sign-in) silently issues a code → no second password prompt
4. `/callback.html` exchanges code for tokens → stored in `localStorage` under `gn.*` keys
5. `app.js` checks ID-token claims for `cognito:groups` containing `game-night-users`; if missing, redirects to `https://jaetill.com/`

**Tokens** in `localStorage`:
- `gn.id.token`, `gn.access.token`, `gn.refresh.token`, `gn.expires.at`
- Distinct prefix from portal (`jp.*`) — different App Clients, different tokens

**App Client config** (`34et7dk67ngqep1oqef49te0ic`):
- OAuth flows: Authorization code grant, PKCE
- Scopes: `openid`, `email`, `profile`, `aws.cognito.signin.user.admin`
- Callback URLs: `https://gamenights.jaetill.com/callback.html`, `https://jaetill.github.io/game-night-pwa/callback.html`, `http://localhost:5173/callback.html`
- Logout URLs: same hosts, `/`
- No client secret — public PKCE client

## Key gotchas
- Frontend is on **GitHub Pages**, not CloudFront — no OAC, no S3 direct reads.
  All S3 access is via presigned URLs issued by Lambda.
- Lambdas are **not in the deploy workflow** — changes to Lambda code must be
  deployed separately (manually or via a separate workflow/step).
- Cognito user pool is **shared with meal-planner and jaetill-portal** (`us-east-2_xneeJzaDJ`) but
  each app uses its own App Client ID. The dual-mode authorizer pins JWT
  verification to the game-night App Client (`34et7dk67ngqep1oqef49te0ic`) AND
  requires `cognito:groups` to include `game-night-users` — a meal-planner
  token will not pass.
- **Managed Login v2 requires per-client branding** (`create-managed-login-branding --use-cognito-provided-values`). Without it the Hosted UI shows "Login pages unavailable. Please contact an administrator." This client's branding ID is `26736f11-feed-4a3f-994d-643e07b2e93d`.
- **Group enforcement happens at the authorizer**, not in each Lambda. The dual-mode `apiKeyAuthorizer` rejects any Cognito JWT that lacks `cognito:groups: game-night-users`. The frontend's `app.js` redirect is just a UX nicety — the real gate is the API Gateway authorizer.
- **Access-token user-pool ops** (e.g. UpdateUserAttributes for the deferred profile sync) require the `aws.cognito.signin.user.admin` scope. Already granted in this client's allowed scopes.
- `VITE_ADMIN_NAMES` controls who sees host controls — set in GitHub secrets.
- BGG XML API has CORS restrictions — bggProxy Lambda exists to work around this.
