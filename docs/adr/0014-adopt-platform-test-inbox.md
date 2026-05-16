# ADR-0014: Adopt @platform/test-inbox for email E2E testing

- **Status:** Proposed
- **Date:** 2026-05-16
- **Deciders:** Jason
- **Tags:** testing, new-external-dep, e2e, email

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

Game-night-pwa suppresses Cognito's default welcome email and sends a custom Postmark invite containing a temporary password. There is no automated verification that this email actually arrives, avoids spam folders, and contains the expected credentials block. Manual testing is fragile and doesn't catch deliverability regressions (SPF/DKIM drift, Postmark template changes, Lambda error paths).

The platform provides `@platform/test-inbox` — a shared library that polls a real Gmail inbox via OAuth, waits for emails matching criteria, and reports spam classification. Should we adopt it as a devDependency to enable automated email delivery verification?

## Decision Drivers

- **Bug signal:** Invitees occasionally report "no email received" — no automated diagnostic exists today.
- **Shared Cognito pool safety:** The test provisions and cleans up real Cognito users in `us-east-2_xneeJzaDJ` (shared with meal-planner and jaetill-portal); the cleanup mechanism must be scoped tightly.
- **Platform alignment:** The Agentic Dev Environment provides the library (platform ADR-0014); adopting it keeps E2E patterns consistent across projects.
- **Dev-only footprint:** The dependency should not increase the production bundle or Lambda package size.
- **CI green-by-default:** Tests must self-skip when Gmail credentials aren't configured, so the happy path (`npm test`) never breaks.

## Considered Options

- **Option A:** Adopt `@platform/test-inbox` via `file:` link (devDependency)
- **Option B:** Build a bespoke Gmail poller in this repo
- **Option C:** Use Postmark webhooks + an SQS queue to capture delivery events
- **Option D:** No automated email verification; rely on manual testing and Postmark dashboard

## Decision Outcome

Chosen option: **Option A — Adopt `@platform/test-inbox`**, because it provides a battle-tested Gmail polling mechanism with built-in spam detection, Cognito cleanup helpers, and alias-prefix safety guards that map directly to our shared-pool constraint, with zero production impact (devDependency only).

## Consequences

### Positive

- Automated verification that Postmark invites arrive and avoid spam — catches deliverability regressions within minutes.
- Cognito test-user cleanup is scoped to the `jaetill+gn-*` alias prefix, preventing accidental deletion of real users.
- Consistent with platform E2E patterns; future projects benefit from the same library.
- Self-skipping design keeps CI green without Gmail credentials configured.

### Negative

- Adds a `file:` link to a local filesystem path (`../../Claude/Projects/Agentic Dev Environment/templates/_shared/test-inbox`), which only resolves in developer workstations with the platform repo checked out adjacently. CI must either have that path or skip the test.
- Transitive dependencies (`googleapis`, `google-auth-library`, `@aws-sdk/client-cognito-identity-provider`) increase `node_modules/` size for dev installs.
- Gmail OAuth credentials require one-time manual setup (Google Cloud Console, Secrets Manager).

### Neutral

- The test exercises production infrastructure (real Postmark sends, real Cognito pool) — this is intentional for deliverability verification but means it cannot run in isolated/offline environments.
- The `PLATFORM_TEST_INBOX_ALLOW_PROD_CLEANUP=true` env var is required because the shared pool name doesn't contain "test"; this is an explicit opt-in safety mechanism, not a hack.

## Pros and Cons of the Options

### Option A: Adopt `@platform/test-inbox` via `file:` link

- ✅ Maintained by the platform; bug fixes flow to all consumers
- ✅ Built-in spam detection (`lastWasInSpam()`)
- ✅ Cognito cleanup helper with alias-prefix guard
- ✅ devDependency only — zero production impact
- ❌ `file:` link requires specific filesystem layout
- ❌ Transitive deps add ~50 MB to dev `node_modules/`

### Option B: Build a bespoke Gmail poller

- ✅ No external dependency
- ❌ Duplicates ~300 lines of OAuth + polling + MIME parsing logic
- ❌ No shared maintenance; bugs stay local
- ❌ Missing the Cognito cleanup helper (must reimplement)

### Option C: Postmark webhooks + SQS queue

- ✅ No Gmail credentials needed
- ✅ Confirms Postmark accepted the email
- ❌ Does NOT verify inbox delivery or spam classification (the actual bug signal)
- ❌ Requires new AWS infrastructure (SQS queue, webhook endpoint)
- ❌ Cannot detect "landed in spam" — only "Postmark sent it"

### Option D: No automated email verification

- ✅ Zero complexity
- ❌ Deliverability regressions go undetected until users report them
- ❌ No diagnostic data on spam/SPF/DKIM issues

## Implementation notes

- `@platform/test-inbox` added as a devDependency in `package.json` via `file:` link.
- Test file: `tests/e2e/admin-invite-flow.spec.js` — uses Playwright's `test.extend` to wire the `inboxFixture` from the host project's `@playwright/test` install (avoids the dual-Playwright-load guard).
- `afterAll` hook calls `cleanupCognitoTestUsers` scoped to `jaetill+gn-*` prefix.
- Required env vars documented in `CLAUDE.md` under "Email E2E setup".
- Test self-skips (`test.skip`) when any required env var is missing.

## Links

- Platform ADR-0014: `@platform/test-inbox` design (in Agentic Dev Environment repo)
- `lambda/nudge.js`: invite email implementation (Postmark send, Cognito provisioning)
- PR #90: initial integration of this test
