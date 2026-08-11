# ADR-0019: Web Push notifications, one-click email RSVP links, and calendar invites

- **Status:** Proposed
- **Date:** 2026-08-11
- **Deciders:** Jason
- **Tags:** new-external-dep, security, web-push, email, iam, api

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

Game night hosts have no way to know when invitees RSVP without manually refreshing the app. Meanwhile, invitees who receive email invites must sign in to the full app just to say "I'm in" or "can't make it" — friction that lowers response rates. A third pain point: invitees have to manually create a calendar event after RSVPing.

This change introduces three tightly coupled features that address these problems together:

1. **Web Push notifications** — hosts get a browser/PWA push when someone RSVPs to their game night (via the in-app flow or via a one-click email link).
2. **One-click RSVP links in emails** — invite and nudge emails include "I'm in / If needed / Can't make it" buttons that RSVP the recipient without requiring sign-in, via HMAC-signed tokens.
3. **Calendar (.ics) attachments** — invite and nudge emails attach an iCalendar file so recipients can add the event to their calendar with one tap.

These span two ADR-gated categories: **new-external-dep** (`web-push` npm package) and **security-relevant** (new public unauthenticated API route, HMAC token scheme, VAPID key management, service worker, new IAM roles).

## Decision Drivers

- **Response rate.** Reducing RSVP friction directly improves the core workflow.
- **Host awareness.** Real-time RSVP notifications let hosts plan without polling.
- **Security posture.** A new public endpoint and token-based auth scheme must not weaken the app's security model.
- **Least-privilege IAM.** New Lambdas need scoped roles; existing Lambdas gaining push capabilities need minimal additional permissions.
- **Dependency footprint.** Adding a runtime dependency to Lambda packaging increases supply-chain surface.

## Considered Options

### Sub-decision 1 — RSVP from email (one-click links)

- **A: HMAC-signed token in query string, public Lambda endpoint** (chosen)
- **B: Magic link with short-lived token in DynamoDB**
- **C: Deep link into the app (requires sign-in)**

### Sub-decision 2 — Host notification channel

- **A: Web Push (W3C Push API + VAPID)** (chosen)
- **B: Email notification to host**
- **C: In-app polling / WebSocket**

### Sub-decision 3 — Web Push library

- **A: `web-push` npm package** (chosen)
- **B: Raw VAPID/ECE implementation**
- **C: AWS SNS Mobile Push**

### Sub-decision 4 — Calendar invite delivery

- **A: .ics file attached to existing Postmark emails** (chosen)
- **B: Separate calendar invite email (Postmark or SES)**
- **C: In-app "Add to Calendar" download link**

## Decision Outcome

### Sub-decision 1 — HMAC-signed token, public Lambda

Chosen option: **Option A**, because it eliminates sign-in friction entirely while keeping the security model simple and stateless.

The token format is `base64url(JSON payload) + "." + base64url(HMAC-SHA256)`. The payload contains `{ nightId, invitee, exp }`. The HMAC secret lives in Secrets Manager (`game-night/prod/rsvp-link`). Verification uses `crypto.timingSafeEqual` to prevent timing attacks. Tokens expire 2 days after the event date (or 45 days for dateless events).

The `/rsvp` route is the second public (no-authorizer) API Gateway route, after `/feedback`. Authentication is the HMAC token itself — a valid token proves the holder received the email for that specific night.

### Sub-decision 2 — Web Push via VAPID

Chosen option: **Option A**, because it provides instant, native-feeling notifications on mobile and desktop without requiring the host to keep the app open, and uses an open standard (no vendor lock-in).

VAPID keypair is stored in Secrets Manager (`game-night/prod/push-vapid`). The public key is embedded in the frontend config (non-secret by design — the browser sends it to the push service). Subscriptions are stored per-user in S3 at `push-subscriptions/{userId}.json` (array of endpoints for multi-device support).

### Sub-decision 3 — `web-push` package

Chosen option: **Option A**, because `web-push` is the standard Node.js library for W3C Push API with VAPID, handling the ECE encryption and VAPID header generation that would otherwise require ~500 lines of crypto code. It has 3M+ weekly npm downloads and is actively maintained.

### Sub-decision 4 — .ics attachment on existing emails

Chosen option: **Option A**, because it adds zero additional emails and works with every calendar app. Postmark supports attachments natively; the ICS is generated server-side from the night's date/time/location.

## Consequences

### Positive

- Hosts get instant push notifications when invitees RSVP — no more manual refresh polling.
- Invitees can RSVP from email with one tap — no sign-in, no app navigation.
- Calendar events auto-populate from invite emails.
- HMAC tokens are stateless — no database table for token storage, no cleanup job.
- Push delivery failures (404/410) auto-prune dead subscriptions from S3.
- All three features degrade gracefully: push is best-effort (never blocks responses), RSVP links fall back to "RSVP in the app", ICS attachment is simply absent if the night has no parseable date.

### Negative

- New runtime dependency (`web-push` ^3.6.7) increases Lambda zip size and supply-chain surface for all handlers that bundle `node_modules/`.
- Two new Secrets Manager secrets add operational overhead (rotation, access auditing).
- Public `/rsvp` route is an unauthenticated entry point — HMAC token compromise (e.g. email forwarding) allows a third party to RSVP on behalf of the intended recipient for that specific night.
- Service worker (`sw.js`) is a new execution context in the browser with its own security considerations (scope, update lifecycle).

### Neutral

- VAPID public key is hardcoded in `src/js/config.js` — requires a code change + deploy to rotate, but rotation is extremely rare (only on key compromise).
- Push subscriptions in S3 (not DynamoDB) means no TTL-based auto-expiry — stale subscriptions are cleaned up only on delivery failure.
- The `rsvpLink` Lambda has Cognito read access (`ListUsers`, `AdminGetUser`) to resolve email-based invite keys to Cognito usernames — same pattern as the nudge Lambda.

## Pros and Cons of the Options

### Sub-decision 1

#### Option A: HMAC-signed token, public Lambda

- ✅ Stateless — no database writes at token-creation time, no cleanup
- ✅ Constant-time verification (`timingSafeEqual`)
- ✅ Tokens are scoped to a specific night + invitee + expiry
- ✅ Works from any email client (plain GET request)
- ❌ Token in URL is visible in server logs, browser history, and to anyone the email is forwarded to
- ❌ Requires a new Secrets Manager secret for the HMAC key

#### Option B: Magic link with DynamoDB token

- ✅ Tokens can be explicitly revoked
- ❌ Requires a DynamoDB table + TTL config + IAM for the new table
- ❌ Cold-start latency for DynamoDB client in a rarely-invoked Lambda
- ❌ Additional operational surface (table monitoring, capacity)

#### Option C: Deep link into app (requires sign-in)

- ✅ No new public endpoint
- ❌ Requires sign-in — the friction this feature exists to eliminate
- ❌ New users must complete Cognito onboarding before RSVPing

### Sub-decision 2

#### Option A: Web Push (VAPID)

- ✅ Works when the app is closed (background push)
- ✅ Native notification UX on mobile and desktop
- ✅ Open standard — no vendor lock-in
- ✅ iOS support since 16.4 (Home Screen PWA)
- ❌ Requires service worker registration
- ❌ VAPID key management (Secrets Manager)
- ❌ Per-user subscription storage in S3

#### Option B: Email notification to host

- ✅ No new infrastructure (Postmark already configured)
- ❌ Not real-time — email delivery can lag minutes
- ❌ Adds email volume (one per RSVP, potentially many per night)
- ❌ Host's inbox becomes noisy

#### Option C: In-app polling / WebSocket

- ✅ No push infrastructure needed
- ❌ Only works while the app is open
- ❌ WebSocket requires persistent connection infrastructure (API Gateway WebSocket API or similar)

### Sub-decision 3

#### Option A: `web-push` npm package

- ✅ 3M+ weekly downloads, actively maintained, MIT licensed
- ✅ Handles ECE content encryption and VAPID header generation
- ✅ Well-tested against all major push services (FCM, Mozilla, Apple)
- ❌ Adds ~2 MB to Lambda zip (with transitive deps)
- ❌ Supply-chain surface — new transitive dependency tree

#### Option B: Raw VAPID/ECE implementation

- ✅ Zero additional dependencies
- ❌ ~500 lines of crypto code to write, test, and maintain
- ❌ Push service interop edge cases (FCM legacy vs. v1, Apple quirks)

#### Option C: AWS SNS Mobile Push

- ✅ Managed service — no key management
- ❌ Requires platform-specific setup (FCM project, APNs cert) — not applicable to web push
- ❌ Vendor lock-in to AWS SNS

## Implementation notes

### New Lambda functions

| Function | Handler | Route | Auth | Purpose |
|---|---|---|---|---|
| `pushSubscriptions` | `push.handler` | `POST /push` | Dual-mode authorizer | Store/remove caller's Web Push subscriptions |
| `rsvpLink` | `rsvpLink.handler` | `GET /rsvp` | **None** (HMAC token) | One-click RSVP from email links |

### New Secrets Manager entries

| Secret | Contents | Used by |
|---|---|---|
| `game-night/prod/push-vapid` | `{ publicKey, privateKey, subject }` | `lib/push.js` (all push-sending Lambdas) |
| `game-night/prod/rsvp-link` | `{ secret }` (HMAC key) | `nudge.js` (signing), `rsvpLink.js` (verification) |

### New IAM roles and policies

- `pushSubscriptions-lambda-role` with `pushSubscriptions-inline` policy (S3 read/write on `push-subscriptions/*`, Secrets Manager read on `push-vapid`, CloudWatch Logs)
- `rsvpLink-lambda-role` with `rsvpLink-inline` policy (S3 read/write on `gameNights.json` + `push-subscriptions/*`, Cognito read, Secrets Manager read on `rsvp-link` + `push-vapid`, CloudWatch Logs)
- `GeneratePresignedPost` role gains `push-notify` inline policy (S3 read/write on `push-subscriptions/*`, Secrets Manager read on `push-vapid`)
- `nudgeNonResponders` role gains Secrets Manager read on `rsvp-link` (via shared secrets access policy)

### New S3 prefix

`push-subscriptions/{userId}.json` — array of `{ endpoint, keys: { p256dh, auth } }` per user.

### Frontend additions

- `public/sw.js` — service worker for push notification display and click handling (no fetch/cache interception)
- `src/js/utils/push.js` — push subscription client (register SW, subscribe/unsubscribe via `/push` API)
- `src/js/components/renderNotifyToggle.js` — bell button UI for enabling/disabling notifications
- `src/js/config.js` — `VAPID_PUBLIC_KEY` constant (non-secret)

### New dependency

- `web-push` ^3.6.7 — added to `lambda/package.json`, bundled into Lambda zips via `node_modules/`

## Links

- [W3C Push API](https://www.w3.org/TR/push-api/)
- [RFC 8292 — VAPID](https://tools.ietf.org/html/rfc8292)
- [RFC 5545 — iCalendar](https://tools.ietf.org/html/rfc5545)
- [web-push npm package](https://www.npmjs.com/package/web-push)
- ADR-0018 — Sync model and security hardening (conditional writes reused by rsvpLink)
- PR #328 — Implementation PR
