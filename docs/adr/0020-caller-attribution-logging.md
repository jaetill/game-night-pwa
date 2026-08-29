# ADR-0020: Caller-attribution logging with PII-safe identity fields

- **Status:** Proposed
- **Date:** 2026-08-29
- **Deciders:** Jason
- **Tags:** security, observability, pii, logging

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

Every Lambda log line was anonymous. `upload.saved` recorded that a write happened but not who made it; `rsvp_link.saved` recorded the RSVP choice but not the invitee. When a user reported "I RSVP'd yes" and the data disagreed, the only honest answer was "no idea" — there was no way to confirm or refute the claim from the logs.

Adding caller identity to log records is an observability improvement, but it crosses an ADR-gated boundary: it introduces a new PII handling pattern. Raw email addresses must not appear in CloudWatch (platform ADR-0006; enforced by `lib/logger.js`'s PII scrubber), so the identity fields must be designed to survive the scrubber while remaining useful for attribution.

The changes also touch the authorizer (`apiKeyAuthorizer.js`), which is the security boundary for all API routes.

## Decision Drivers

- **Supportability.** "Did this person's action actually reach the server?" is unanswerable today. Every user-reported data discrepancy requires guesswork.
- **PII compliance.** Platform ADR-0006 requires that raw email addresses never appear in structured logs. The logger scrubs fields named `email` and email-shaped substrings from all string values. Any identity scheme must be designed around these constraints, not against them.
- **Existing footgun.** `rsvpLink.js`'s `resolveInvitee` falls back to using the raw email as the `userId` when Cognito has no matching user. Naively logging `userId` in that path would leak an address into `user_id`, which would then be scrubbed to `[REDACTED_EMAIL]` — producing logs that look attributed but aren't.
- **Authorizer is the single choke point.** Adding one log line in the authorizer's `allow()` path makes every authenticated request attributable, including routes whose own handlers log nothing.

## Considered Options

### Sub-decision 1 — Identity representation in logs

- **A: Truncated SHA-256 of normalized email (`email_hash`) + Cognito username (`user_id`)** (chosen)
- **B: Log raw email addresses (rely on CloudWatch access controls)**
- **C: Log only Cognito username, no email correlation**

### Sub-decision 2 — Where to log identity

- **A: Authorizer `allow()` choke point + per-mutation log lines** (chosen)
- **B: Only in individual Lambda handlers**
- **C: API Gateway access logs (no code change)**

## Decision Outcome

Chosen options: **A** for both sub-decisions.

A new shared module (`lambda/lib/identity.js`) provides three helpers:

- `emailHash(email)` — truncated (12 hex char / 48-bit) SHA-256 of the normalized (trim + lowercase) email. Returns `undefined` for non-string/empty input so callers can spread it into log records.
- `identityFields({ userId, email })` — builds `{ user_id, email_hash }` from whatever is known, with a guard: if `userId` is email-shaped (the `resolveInvitee` fallback), it is excluded from `user_id` and represented only by `email_hash`.
- `routeFromMethodArn(methodArn)` — extracts `"POST /upload-token"` from the API Gateway method ARN for the authorizer, which sees `methodArn` but not `event.resource`.

The authorizer's `allow()` function logs `auth.allowed` with `auth_mode` (jwt vs api_key), `route`, `user_id`, and `email_hash`. The `auth.group_missing` denial path also gains identity fields for diagnosing half-provisioned invitees.

Mutation handlers (`GeneratePresignedPost`, `nudge`, `rsvpLink`) enrich their existing log lines with `identityFields()` and `emailHash()` for recipients.

## Consequences

### Positive

- Every authenticated request is attributable via a single authorizer log line — no per-handler opt-in required for new routes.
- User-reported data discrepancies ("I RSVP'd", "I saved") can be confirmed or refuted by grepping `user_id` or `email_hash` in CloudWatch.
- The `email_hash` is collision-free for a friend-group-sized address book (48 bits >> ~30 users) and is not reversible from the log alone.
- The `identityFields` guard prevents the `resolveInvitee` email-as-userId footgun from silently leaking PII into logs.
- Tests verify that identity fields survive the real logger PII scrubber end-to-end — not just that the helper produces the right shape.

### Negative

- `email_hash` is a pseudonymous identifier, not anonymous. An operator who also has access to the Cognito user pool or the invite email list can correlate hashes to people. This is intentional (it's the whole point), but it means CloudWatch log access is now more sensitive than before.
- The 48-bit hash is not reversible from logs alone, but it is brute-forceable against a known email list. For a ~30-person friend group this is acceptable; for a larger user base, a keyed HMAC (with a secret not in the logs) would be more appropriate.

### Neutral

- The authorizer's `allow()` signature gains new parameters (`context`, `authMode`, `email`). This is an internal interface with no external callers.
- Log volume increases modestly (one `auth.allowed` line per request, plus enriched fields on existing mutation lines).
- `resolveInvitee` in `rsvpLink.js` now returns a `matched` boolean and `email` field — a minor interface expansion used only for logging.

## Pros and Cons of the Options

### Sub-decision 1

#### Option A: Truncated SHA-256 + Cognito username

- ✅ Survives the logger PII scrubber (hex string, no `@`, field name not in PII list)
- ✅ Stable across case/whitespace variations (normalized before hashing)
- ✅ Not reversible from the log alone (unlike Base64 or rot13)
- ✅ Cognito username gives direct lookup for authenticated users
- ❌ Operator with the email list can correlate hashes (acceptable for this use case)
- ❌ Adds a shared module that all mutation handlers must import

#### Option B: Log raw email addresses

- ✅ Simplest implementation — no hashing, no new module
- ❌ Violates platform ADR-0006
- ❌ Would be scrubbed to `[REDACTED_EMAIL]` by lib/logger.js, defeating the purpose
- ❌ CloudWatch log retention becomes a GDPR/privacy concern

#### Option C: Cognito username only

- ✅ No PII concern — usernames are pseudonymous by design
- ❌ Unresolved invitees (no Cognito account yet) produce no identity at all
- ❌ Cannot correlate "which email was nudged" without a separate Cognito lookup

### Sub-decision 2

#### Option A: Authorizer choke point + per-mutation enrichment

- ✅ One log line covers all routes, including future ones
- ✅ `auth_mode` distinguishes browser (jwt) from MCP (api_key) — otherwise invisible
- ✅ Per-mutation enrichment adds `night_id` and `recipient_hash` for targeted queries
- ❌ Slightly couples the authorizer to the identity module

#### Option B: Individual Lambda handlers only

- ✅ No authorizer change
- ❌ Every new handler must remember to log identity — opt-in, not opt-out
- ❌ Read-only routes (get-token, search-games) would remain anonymous

#### Option C: API Gateway access logs

- ✅ Zero code change
- ❌ Access logs don't include the resolved `userId` from the authorizer context
- ❌ No per-mutation detail (which night, which recipient)

## Implementation notes

- `lambda/lib/identity.js` is the single source of truth for identity field construction. All handlers import from here rather than rolling their own.
- `tests/identity.test.js` includes integration tests that run identity fields through the real `lib/logger.js` PII scrubber and assert they survive intact. This is the load-bearing test — if someone adds `email_hash` to the logger's `PII_FIELDS` list, this test breaks before it ships.
- `tests/changedNightIds.test.js` covers the `changedNightIds` helper in `GeneratePresignedPost`, which produces the `changed_night_ids` log field (a diff diagnostic, not an identity field, but shipped in the same PR).
- `rsvpLink` and `push` handlers were missing from `lambdaHandlers.test.js` and `lambdaHandlersChildProcess.test.js` — added in this PR to prevent load-time regressions from shipping unnoticed.

## Links

- [ADR-0018 — Sync model, auth, and security hardening](0018-sync-auth-security-hardening.md) — established the conditional-write and auth-refresh model this PR's logging enriches
- [ADR-0019 — Web Push, RSVP links, calendar invites](0019-web-push-rsvp-links-calendar-invites.md) — introduced `rsvpLink.js`, whose `resolveInvitee` fallback motivated the email-as-userId guard
- Platform ADR-0006 — PII handling standard (enforced by `lib/logger.js`)
