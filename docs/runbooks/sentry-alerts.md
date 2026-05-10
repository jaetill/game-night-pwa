# Runbook: Sentry → incident-responder wiring

How prod alerts reach the `incident-responder` agent. One-time setup per
project; once wired, alerts route automatically.

## Architecture

```
Sentry alert rule fires
  → Sentry Internal Integration webhook
    → POST https://api.github.com/repos/jaetill/game-night-pwa/dispatches
      → GitHub repository_dispatch event (type: sentry-alert)
        → .github/workflows/claude-incident-responder.yml
          → incident-responder agent triages + files issue
```

## One-time setup

### 1. Create GitHub PAT (or use a fine-grained token)

- Settings → Developer settings → Personal access tokens → Tokens (classic)
- Scopes needed: **`repo`** (full control of private repos, for `dispatches` endpoint)
- Copy the token; you'll paste it into Sentry next.

Lifetime: rotate annually. Add to a calendar reminder.

### 2. Create the Sentry Internal Integration

In Sentry:

- Settings → Developer Settings → New Internal Integration
- **Name**: `GitHub repository_dispatch (game-night-pwa)`
- **Webhook URL**:
  ```
  https://api.github.com/repos/jaetill/game-night-pwa/dispatches
  ```
- **Permissions**: Issue & Event → Read (so Sentry can include event context)
- **Webhooks** section: enable, then add custom headers:
  ```
  Authorization: token <PAT-from-step-1>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
  ```
- **Body template** (Custom JSON):
  ```json
  {
    "event_type": "sentry-alert",
    "client_payload": {
      "alert": "{{rule.label}}",
      "level": "{{event.level}}",
      "project": "{{project.slug}}",
      "message": "{{event.title}}",
      "url": "{{event.url}}",
      "environment": "{{event.environment}}",
      "release": "{{event.release}}",
      "tags": "{{event.tags}}"
    }
  }
  ```

Save the integration. Sentry will show a token — you don't need it for this
flow (the integration calls out, not in), but save it anyway in 1Password.

### 3. Attach to alert rules

For each alert rule that should page the agent:

- Alerts → select the rule → Actions
- Add: **Send a notification via an integration** → select the integration
  you just created

Recommended starting set:
- **P0**: `event.level == fatal AND count > 5 in 5min` (sustained fatals)
- **P0**: `error rate > 50% in 5min` (deploy went bad)
- **P1**: `event.level == error AND first_seen` (new error class)

P2 / info-level Sentry events should NOT trigger this workflow — the agent
is for synchronous interrupts only. Use Sentry's email digest for those.

## Smoke testing

The workflow has a `workflow_dispatch` trigger for testing without Sentry:

```bash
gh workflow run claude-incident-responder.yml
```

Or with a custom payload:

```bash
gh workflow run claude-incident-responder.yml \
  -f simulated_payload='{"alert":"smoke-test","level":"info","project":"game-night-pwa","message":"manual test"}'
```

The agent recognizes `alert: smoke-test` and exits without filing an
incident issue — just confirms the wiring is intact.

To test a *real* incident path, set `alert` to anything other than
`smoke-test`. The agent will file an `incident:p0` issue. Delete it after
verifying.

## Failure modes

- **GitHub returns 422** on the dispatches POST → `event_type` malformed or
  client_payload too large (max 10 unique top-level keys, max ~64KB).
  Trim the body template.
- **Token expired** → 401 from GitHub. Rotate PAT and update the Sentry
  integration's Authorization header.
- **Workflow doesn't trigger** → check `repository_dispatch` `types:`
  matches what Sentry sends. Both must be `sentry-alert`.
- **Agent posts but doesn't file an issue** → check the payload's `alert`
  field. If it's `smoke-test`, that's correct behavior (the agent short-
  circuits to avoid filing fake P0s).

## Cross-app reuse

Same recipe for meal-planner, jaetill-portal, etc.:
- One Sentry Internal Integration per repo (Sentry doesn't support
  multi-repo dispatch in one integration).
- Same body template; just change the project name.
- Each repo gets its own copy of `claude-incident-responder.yml`.
