# ADR-0018: Sync model, auth, and security hardening (2026-08 overhaul)

- **Status:** Proposed
- **Date:** 2026-08-11
- **Deciders:** Jason
- **Tags:** security, sync, auth, iam, xss, concurrency

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

An independent code review (documented in `docs/fable-analysis-2026-08-07.md`) identified several interacting issues in the sync model, authentication lifecycle, and input sanitisation. The most impactful findings:

1. **Deleted events resurrect.** Removing a night from the array means every other user's localStorage still contains it; `mergeNights` has no concept of deletion, so `loadGameNights` re-uploads the deleted night, which the server then rejects (403) for every subsequent save by that user — permanently breaking sync until localStorage is cleared.
2. **Concurrent writes silently lose data.** Four writers (every browser tab, plus nudge/createEvent/upload Lambdas) do unconditional `PutObject` on `gameNights.json`. Two near-simultaneous RSVPs means one is silently dropped (whole-night last-writer-wins).
3. **Auth tokens expire silently.** `authFetch` never calls `refresh()`; after ~1 hour every API call fails, with saves silently falling back to localStorage.
4. **Toast XSS.** `toast.js` interpolates user-typed strings (e.g. invite email addresses) into `innerHTML`.
5. **Re-invite dead end.** Re-inviting a never-signed-in user sends a credentials-free email while their 7-day temp password may have expired — no recovery path.
6. **IAM gap.** Fixing (5) requires `cognito-idp:AdminSetUserPassword`, not in the nudge role.

These span multiple ADR-gated categories (security-relevant, IAM change, auth model change) but form a single coherent design change — the sync/tombstone model, the conditional-write guard, and the auth/credential fixes are interdependent.

## Decision Drivers

- **User-facing reliability.** Sync breakage after event cancellation is the top reported issue.
- **Data integrity.** Lost RSVPs from write races erode trust.
- **Security posture.** The XSS vector (finding 12 in the analysis) is self-XSS today but becomes exploitable if any upstream source ever injects content into toast messages.
- **Least-privilege IAM.** Expanding the nudge role's Cognito permissions must be justified and scoped.
- **Backward compatibility.** Older frontend bundles (pre-tombstone) must not break on the new server-side model.

## Considered Options

### Sub-decision 1 — Deletion model

- **A: Tombstone-based deletion** (chosen)
- **B: Per-event S3 keys** (one object per night instead of a single `gameNights.json`)
- **C: Status quo (remove from array)**

### Sub-decision 2 — Write concurrency

- **A: S3 conditional writes (ETag / If-Match)** (chosen)
- **B: DynamoDB for event storage**
- **C: Status quo (unconditional PutObject)**

### Sub-decision 3 — Auth token lifecycle

- **A: Auto-refresh in authFetch** (chosen)
- **B: Periodic background timer**
- **C: Status quo (no refresh)**

### Sub-decision 4 — Toast XSS

- **A: textContent** (chosen)
- **B: DOMPurify / sanitisation library**

### Sub-decision 5 — Expired temp-password re-invite

- **A: AdminSetUserPassword (Permanent: false)** (chosen)
- **B: AdminCreateUser with new UUID (delete + re-provision)**

## Decision Outcome

### Sub-decision 1: Tombstone-based deletion

Chosen option: **A**, because it is the minimal change to the existing single-file sync model that eliminates the resurrection bug while remaining backward-compatible with older frontends.

A deleted night becomes `{ id, hostUserId, deleted: true, lastModified }`. The server carries forward any tombstones a client omits (old clients that don't know about tombstones), and converts a host's deletion-by-omission into a tombstone (legacy compatibility). Unknown nights hosted by someone else are silently dropped rather than rejected — this self-heals stale clients whose localStorage predates the deletion.

The frontend filters tombstones from rendering (`renderGameNights`) but keeps them in the array that flows through `saveGameNights`, so the deletion propagates to every client on merge.

### Sub-decision 2: S3 conditional writes (ETag / If-Match)

Chosen option: **A**, because S3 conditional writes (GA since late 2024) add concurrency safety with zero infrastructure changes. The Lambda reads `gameNights.json`, captures the `ETag`, validates, then writes with `IfMatch: etag` (or `IfNoneMatch: '*'` for a fresh file). On a 412 (lost race), it reloads, re-validates, and retries once. A second failure returns 409 to the client.

Option B (DynamoDB) would eliminate the single-file bottleneck entirely but is a much larger migration for a small-group app.

### Sub-decision 3: Auto-refresh in authFetch

Chosen option: **A**, because it is the narrowest fix (~20 lines) and handles the common case (tab open > 1 hour). `ensureFreshToken()` checks `isAuthenticated()` (which inspects `gn.expires.at` with a 60s early-expiry window), deduplicates concurrent refresh attempts via a shared promise, and falls back to `startLogin()` (typically silent via the Hosted UI session cookie) on refresh failure.

### Sub-decision 4: textContent for toasts

Chosen option: **A**, because the toast message is always a plain string and never needs HTML formatting. Switching from `innerHTML` to `textContent` eliminates the XSS vector with no feature loss and no new dependency.

### Sub-decision 5: AdminSetUserPassword for re-invites

Chosen option: **A**, because `AdminSetUserPassword` with `Permanent: false` re-issues a temp password while keeping the user in `FORCE_CHANGE_PASSWORD` state — the first-sign-in flow is unchanged, and the invite email carries working credentials. The IAM policy change is scoped to the existing user pool ARN.

Option B (delete + re-create) would lose any profile data or group memberships the user accumulated.

## Consequences

### Positive

- Event cancellation no longer breaks sync for other users.
- Concurrent RSVPs from two users no longer silently drop one.
- Sessions survive past the 1-hour token expiry without a manual page reload.
- Toast messages cannot be used as an XSS vector.
- Re-inviting a lapsed user sends a working credentials block.
- Older frontend bundles degrade gracefully: the server converts their deletion-by-omission into tombstones and drops their resurrection attempts silently.

### Negative

- `gameNights.json` grows monotonically (tombstones are never pruned). For a small-group app this is negligible; a future cleanup pass could prune tombstones older than N days.
- The nudge Lambda role gains `cognito-idp:AdminSetUserPassword` — a sensitive permission. It is scoped to the single shared user pool and guarded in code (`Permanent: false` only, no path sets `Permanent: true`).
- The conditional-write retry adds one extra S3 read on a lost race (rare). Two consecutive lost races return 409 to the client rather than silently clobbering.

### Neutral

- `loadGameNights` no longer pushes to the cloud on every page load. Local-only changes reach the cloud on the next actual save. This is intentional — the old push-on-load was the primary driver of write races and resurrection.
- The `validateChanges` return type changes from `string | null` to `{ error: string } | { accepted: night[] }`. Existing tests are updated.

## Pros and Cons of the Options

### Sub-decision 1

#### A: Tombstone-based deletion

- Good: minimal change to existing sync model
- Good: backward-compatible with pre-tombstone frontends (server converts omissions)
- Good: `dropZombieNights` handles pre-tombstone deletions already in the wild
- Bad: tombstones accumulate (minor for this scale)

#### B: Per-event S3 keys

- Good: eliminates single-file bottleneck entirely
- Bad: requires rewriting every Lambda that touches `gameNights.json`
- Bad: presigned-URL model for reads breaks (multiple keys)

#### C: Status quo

- Bad: resurrection bug persists; sync permanently breaks after any cancellation

### Sub-decision 2

#### A: S3 conditional writes

- Good: zero infrastructure changes (S3-native)
- Good: single retry handles the common case (two concurrent savers)
- Bad: still whole-file granularity (per-field merge deferred)

#### B: DynamoDB

- Good: per-item concurrency, no whole-file races
- Bad: significant migration; overkill for ~5 concurrent users

#### C: Status quo

- Bad: silent data loss on concurrent writes

### Sub-decision 5

#### A: AdminSetUserPassword

- Good: preserves existing user record and group memberships
- Good: `Permanent: false` keeps the FORCE_CHANGE_PASSWORD flow intact
- Bad: adds a sensitive IAM action to the nudge role

#### B: Delete + re-provision

- Good: no new IAM actions
- Bad: loses profile/group data; changes the user's Cognito username (UUID)

## Implementation notes

- **Lambda: `GeneratePresignedPost.js`** — `validateChanges` returns `{ error } | { accepted }` with resurrection-attempt filtering and tombstone carry-forward. Handler loop: read-with-ETag, validate, conditional-write, retry once on 412.
- **Lambda: `nudge.js`** — new invite-by-userId path (`AdminGetUser` → email resolution → group-add → optional `resetTempPassword`). Email path also gains `resetTempPassword` for `FORCE_CHANGE_PASSWORD` users.
- **Lambda: `bggProxy.mjs`** — profile POST now does read-merge-write (preserves `groups` key written by the groups Lambda).
- **IAM: `lambda/iam/nudge-inline.json`** — adds `cognito-idp:AdminSetUserPassword` scoped to `arn:aws:cognito-idp:us-east-2:214599503944:userpool/us-east-2_xneeJzaDJ`.
- **Frontend: `src/js/utils/authFetch.js`** — `ensureFreshToken()` with deduplication.
- **Frontend: `src/js/ui/toast.js`** — `innerHTML` replaced with `textContent`.
- **Frontend: `src/js/data/storage.js`** — `tombstoneNight`, `dropZombieNights`, `mergeNights` exported; `loadGameNights` no longer pushes on load.
- **Tests** — `tests/validateChanges.test.js` (tombstone rules), `tests/storageSync.test.js` (merge/zombie), `tests/nudgeInviteByUserId.test.js` (userId invite + temp-password reset).

## Links

- `docs/fable-analysis-2026-08-07.md` — independent code review that identified these issues
- ADR-0003 — prior security hardening (low-severity findings)
- [S3 conditional writes](https://aws.amazon.com/about-aws/whats-new/2024/08/amazon-s3-conditional-writes/) — AWS announcement (Aug 2024)
