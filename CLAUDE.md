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
| IAM role | `grafana-cloudwatch-readonly` — assumed by Grafana Cloud (account `008923505280`) for CloudWatch + Logs read; Logs query/read actions scoped to `/aws/lambda/*` (metrics remain `*` — metric APIs have no resource-level IAM); `sts:ExternalId` enforced via `var.grafana_external_id` (set via `TF_VAR_grafana_external_id` env var; value not committed — see Grafana data-source UI) |
| IAM role | `game-night-iac-drift` — assumed by the drift-detector CI workflow (`tofu plan -lock=false -detailed-exitcode`); narrow inline policy (`iac_drift_introspect`) covers only per-service Describe/Get/List actions needed by `tofu plan`. Explicit omissions: `secretsmanager:GetSecretValue`, `ssm:GetParameter*`, `cognito-idp:ListUsers/AdminGetUser`, `s3:GetObject` outside tfstate, `iam:GetAccountAuthorizationDetails`. Plus a separate inline policy scoped to the tfstate S3 bucket and DynamoDB lock table. (Issue #48 — `ReadOnlyAccess` removed; prior attempt PR #59 hung due to missing `-input=false` in workflow, fixed in PR #181.) |
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
| `feedback` | `feedback-lambda-role` (TBD on first deploy) | User feedback → GitHub Issue (Standard 11) |

## Lambda env vars
| Function | Var | Source | Purpose |
|---|---|---|---|
| `nudgeNonResponders` | `POSTMARK_API_KEY` | Secrets Manager: `shared/postmark-api-key` | Postmark server token |
| `nudgeNonResponders` | `FROM_EMAIL` | env var | `jason@jaetill.com` |
| `nudgeNonResponders` | `COGNITO_USER_POOL_ID` | env var | `us-east-2_xneeJzaDJ` |
| `nudgeNonResponders` | `S3_BUCKET` | env var | `jaetill-game-nights` |
| `nudgeNonResponders` | `APP_URL` | env var | `https://gamenights.jaetill.com/` |
| `feedback` | `GITHUB_TOKEN` | Secrets Manager: `game-night/prod/github-token` | GitHub PAT with `issues:write` for filing feedback issues |
| `feedback` | `GITHUB_REPO_OWNER` | env var | `jaetill` |
| `feedback` | `GITHUB_REPO_NAME` | env var | `game-night-pwa` |
| `feedback` | `GITHUB_SECRET_ID` | env var | Defaults to `game-night/prod/github-token` |

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
| POST | `/feedback` | feedback | browser (public) | User feedback → GitHub Issue (no auth; rate-limited per IP) |

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
**Exceptions:**
- `apiKeyAuthorizer` bundles `aws-jwt-verify` from `lambda/node_modules/`.
- All handlers now require `lambda/lib/sentry.js` + `lambda/lib/logger.js`, which depend on `@sentry/aws-serverless` from `lambda/node_modules/`.
- `feedback` additionally bundles `@octokit/rest`.

`lambda/package.json` and `lambda/package-lock.json` are committed; run
`cd lambda && npm install` after a fresh clone to regenerate `node_modules/`
before zipping.

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
| `feedback` | `feedback.handler` | `lambda/feedback.js` + `node_modules/@octokit/rest/` |

## BGG integration
- User enters BGG username in profile modal
- XML fetched from `https://boardgamegeek.com/xmlapi2/collection?username={u}&own=1&stats=1`
- Parsed via DOMParser — extracts id, title, thumbnail, minPlayers, maxPlayers
- Collection stored in S3 at `collections/{userId}.json`
- Cached in localStorage (`bggGames_{userId}`, version key `bggGamesVer_{userId}`, current version v5)

## Email (Postmark — single-email flow)
- **Invite** (`POST /invite`, handled by `nudgeNonResponders`):
  1. Provisions a Cognito user (UUID username, email alias) if none exists,
     in the `game-night-users` group. Cognito's default welcome email is
     **suppressed** via `MessageAction:'SUPPRESS'` — better deliverability
     and one fewer email for the invitee.
  2. Sends ONE Postmark "You're invited to game night" email from
     `jason@jaetill.com`. For new accounts, the email includes a
     "First time signing in?" credentials block showing the email address
     and the generated temporary password (which expires in 7 days).
- **Nudge** (`POST /nudge`): loads `gameNights.json`, finds non-responders,
  resolves emails via Cognito, sends individually via Postmark.
- Both Postmark sends use `MessageStream: 'outbound'`.
- DNS for `jaetill.com`: SPF (`v=spf1 include:spf.mtasv.net include:amazonses.com ~all`),
  DMARC (`v=DMARC1; p=none; sp=none`), and Postmark DKIM selector
  `20260313102825pm._domainkey` are all live in Route 53. AOL/Yahoo bulk-sender
  requirements (Feb 2024) are met.

### Provisioning permissions
The `nudge-lambda-role` has `cognito-idp:AdminCreateUser`,
`cognito-idp:AdminAddUserToGroup`, and `cognito-idp:ListUsers` on the user
pool. IAM cannot scope `AdminAddUserToGroup` to a specific group, so the
guard against escalation (e.g. adding a user to `admins`) is enforced in
Lambda code only — `nudge.js` always passes `GroupName: 'game-night-users'`.
The full policy lives at `lambda/iam/nudge-inline.json`.

### Pool quirks
- **Temp password is required.** Pool's choice-based auth (`ALLOW_USER_AUTH`)
  means `AdminCreateUser` rejects calls without a `TemporaryPassword`.
  `nudge.js` generates an 18-char password meeting the pool policy and
  emails it via Postmark.
- **Username can't be email-format.** `AliasAttributes=['email']` makes
  Cognito reject any `AdminCreateUser` call where the Username matches the
  email-address pattern ("Username cannot be of email format, since user
  pool is configured for email alias"). New users get UUID usernames; the
  Postmark credentials block displays the email so the invitee knows what
  to type at the Hosted UI's (non-customizable) "Username" prompt.
- **Hosted UI label is not customizable.** Per AWS docs the managed-login
  branding system controls visual styling only, not field labels. The
  default "Username" label stays — we work around it by showing the email
  prominently in the invite credentials block.

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

---

## Email E2E setup (`admin-invite-flow.spec.js`)

The test at `tests/e2e/admin-invite-flow.spec.js` exercises the full
`POST /invite` path — provisions a real Cognito user, waits for the
temp-password welcome email in Gmail, asserts it didn't land in spam,
extracts the credentials. Uses `@platform/test-inbox` (workspace ADR-0014).

**The test self-skips** when any required env var is missing, so CI and
local `npm run test:e2e` stay green without setup.

Env vars required to actually run it:

- `GMAIL_TESTER_EMAIL=jaetill@gmail.com`
- `GMAIL_TESTER_CLIENT_ID`, `GMAIL_TESTER_CLIENT_SECRET`, `GMAIL_TESTER_REFRESH_TOKEN` — Gmail OAuth (one-time mint via Google Cloud Console; readonly + modify scopes; stored in AWS Secrets Manager at `platform/test-inbox/gmail-tester`).
- `GAME_NIGHT_API_BASE` — e.g. `https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod`
- `GAME_NIGHT_HOST_AUTH_TOKEN` — Cognito ID token for a long-lived host user (capture from a real sign-in; refresh as needed)
- `GAME_NIGHT_TEST_NIGHT_ID` — a long-lived game night where the host token's user is the host
- `PLATFORM_TEST_INBOX_ALLOW_PROD_CLEANUP=true` — required because `us-east-2_xneeJzaDJ` doesn't have "test" in its name; the alias-prefix guard (`jaetill+gn-`) is the load-bearing safety per ADR-0014

The afterAll hook calls `cleanupCognitoTestUsers` against the shared pool, deleting only users whose email starts with the tester alias prefix.

---

## Platform inheritance

This project adopts the [Agentic Dev Environment](https://github.com/jaetill/agentic-dev-environment) platform. The platform's standards (11) and ADRs (12+) define how this project is operated. Project-specific deviations are documented in [docs/adr/0001-platform-adoption.md](docs/adr/0001-platform-adoption.md).

### Inherited platform standards

- [01 Source control](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/01-source-control.md): Conventional Commits + SSH signing + squash merge + Strict branch protection (on `master` per project ADR-0001)
- [02 CI/CD](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/02-ci-cd.md): AI shipping authority; 5 ADR-gated change categories
- [03 Testing](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/03-testing.md): tiered coverage; immediate flake fix-or-remove
- [04 Quality gates](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/04-quality-gates.md): ESLint pragmatic-strict; full security stack
- [05 Documentation](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/05-documentation.md): MADR 4.x ADRs; 6-section runbooks; MkDocs Material
- [06 Observability](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/06-observability.md): JSON logs + Sentry + CloudWatch + Grafana
- [07 Secrets](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/07-secrets.md): 1Password CLI for personal; AWS Secrets Manager for app
- [08 IaC](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/08-iac.md): OpenTofu (retrofit pending — see Phase 6 of integration plan)
- [09 Release management](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/09-release-management.md): release-please; auto-merge release PRs
- [10 AI workflows](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/10-ai-workflows.md): head agent + 12 specialist subagents
- [11 User feedback](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/standards/11-user-feedback.md): Sentry User Feedback + custom form → GitHub Issues → triage-bot

### Project-specific deviations (per ADR-0001)

- **Default branch:** `master` (not platform-default `main`)
- **Frontend deploy:** GitHub Pages (not platform-default Vercel)
- **Backend language:** Node.js CommonJS (not platform-default Python)
- **AWS region:** `us-east-2` (not platform-default `us-east-1`)
- **Email:** Postmark (not platform-default SES)
- **Auth:** shared Cognito user pool (not project-controlled IAM)
- **`.claude/`:** additive to existing setup; do not rewrite the worktree-based parallel-agent pattern that's already there

### Memory hierarchy

- **Cowork user-spaces memory** (`~/AppData/Roaming/Claude/.../spaces/<id>/memory/`): cross-project knowledge about Jason and his preferences. Persists across all projects.
- **Project-local `memory/`** (this directory): project-specific working notes (existing — do not modify).
- **`CLAUDE.md`** (this file): project context for Claude Code; recommended ≤200 lines per ADR-0008 — this file currently exceeds, revisit during a future cleanup.

### AI configuration

The platform's subagents, slash commands, and hooks are delivered via the `ai-team` plugin subscription (per platform ADR-0015). `.claude/settings.json` retains only the plugin subscription (`enabledPlugins`) and the permissions block — hook scripts, agent definitions, and commands are no longer committed locally. The existing `.claude/worktrees/` setup remains untouched. The project's `.claude/mcp.json` (gitignored) and `.claude/settings.local.json` (gitignored) are also untouched.

**Plugin pinning:** The `agentic-dev-environment` marketplace source is pinned to a specific commit SHA via the `ref` field in `extraKnownMarketplaces`. Hook scripts execute shell commands during Claude Code sessions, so unpinned HEAD resolution is a supply-chain risk. To update the pin: review the upstream diff at `jaetill/agentic-dev-environment`, confirm no hook regressions, then update the `ref` SHA in `.claude/settings.json`.

### `mcp/` (existing)

The custom MCP server at `mcp/` is application code — it is NOT touched by the platform integration. It continues to be configured via `.claude/mcp.json` (gitignored).

### Platform integration status (2026-05-09)

| Phase | Status |
|---|---|
| Phase 1 — Documentation | ✅ Complete (docs/, mkdocs.yml, docs.yml workflow) |
| Phase 2 — AI configuration | ✅ Migrated to `ai-team` plugin subscription (platform ADR-0015) — agents, commands, and hooks delivered by plugin; `.claude/settings.json` retains permissions block only |
| Phase 3 — Quality gates | ✅ Complete (ESLint, Prettier, pre-commit, lint-staged, commitlint, vitest tiered coverage) |
| Phase 4 — CI workflows | ✅ Complete (claude-pr-review, release-please, deploy.yml augmented with Sentry release step) |
| Phase 5 — Observability | ✅ Complete (Sentry frontend init wired; all 8 Lambda handlers wrapped with Sentry.wrapHandler + structured logger on 2026-05-09; tests/lambdaHandlers.test.js guards regressions; Grafana Cloud CloudWatch pull wired 2026-05-12 — dashboard at grafana/dashboards/lambda-health.json) |
| Phase 6 — IaC retrofit | 🔄 In progress — `terraform/envs/prod/grafana.tf` is first Terraform file (IAM role for Grafana CloudWatch); full existing-resource retrofit still pending (~500 lines) |
| Phase 7 — User feedback Lambda | ✅ Code complete on 2026-05-09. lambda/feedback.js + tests/feedback.test.js (18 tests) + lambda/iam/feedback-inline.json + src/js/feedback.js widget. Requires API Gateway POST /feedback route + GitHub PAT in Secrets Manager `game-night/prod/github-token` to activate. |

After this integration:
- Run `npm install` (root) and `cd lambda && npm install` to fetch all dependencies (already done if Phase 5 wrapping landed locally)
- Set up Sentry account + DSN, then add to GitHub repo secrets as `VITE_SENTRY_DSN` (frontend) and `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` (release tracking)
- Add Lambda env vars to each of the 8 functions: `SENTRY_DSN`, `DEPLOY_ENV=prod`, `RELEASE_VERSION` (Git SHA at deploy), `LOG_LEVEL=INFO`. Without `SENTRY_DSN` the Sentry client is a no-op (handlers still work; structured logger still emits to CloudWatch); with it errors flow to Sentry.
