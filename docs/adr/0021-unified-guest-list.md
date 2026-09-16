# ADR-0021: Unified `guests[]` list replaces `invited[]` / `rsvps[]` / `declined[]`

- **Status:** Accepted
- **Date:** 2026-09-16
- **Deciders:** Jason
- **Tags:** data-model, security, api, sync

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

A game night tracked who was coming across three parallel arrays with three different element shapes:

| Field | Element | Meaning in practice |
|---|---|---|
| `invited[]` | `string` — an email **or** a Cognito userId | People who have *not yet responded*. Responding removed you from it. |
| `rsvps[]` | `{ userId, name, type, email?, guests? }` | People who said yes, in one of four flavours; `guests` was a *count* of anonymous plus-ones |
| `declined[]` | `string` — userId | People who said no |

Three things went wrong with this, all observed on the 2026-09-26 night:

1. **`invited[]` did not mean "invited".** It meant "pending", but every reader (host controls, MCP tools, the nudge Lambda, and the humans debugging it) had to rediscover that responding *removes* you. "Who did I invite?" was not answerable from the data — the only record of the eight real invites was a hashed recipient in CloudWatch.
2. **Two key spaces.** An email-invited guest was keyed by email in `invited[]` and by Cognito userId in `rsvps[]`. Matching the two required a lookup table (`userDirectory`, backfilled from `rsvp.email`) and four separate ad-hoc filters that each removed both keys on response. Any path that forgot one left a phantom pending entry.
3. **No enforceable permission model.** Because guests had to edit `invited[]` to remove themselves, the upload validator could not make it host-only, so *any* signed-in user could rewrite any night's guest list, RSVPs, and declines. The validator's comment claimed otherwise; it was wrong.

Plus-ones were a further wrinkle: `rsvp.guests` was an integer, expanded on the fly into synthetic `${userId}_guest_${n}` ids so the host could assign them to games. Those synthetic ids were stored in `selectedGames[].signedUpPlayers` while the count that generated them lived elsewhere.

The product rule that has to keep working: **the host can invite anyone; a guest who has said yes can bring people** (today: anonymous plus-ones; going forward: named people who get their own invite).

## Decision Drivers

- One list, one element shape, one place to compute "pending" / "attending" / "declined".
- Every entry identifies a **person** (a Cognito userId once known) rather than a string that is sometimes an email.
- A permission rule that can be stated in three lines and enforced server-side.
- Anonymous plus-ones must survive: sponsors should not need their guests' emails.
- Existing nights must keep working without a data migration.
- Keep the shared `gameNights.json` file as the sync unit (ADR-0018) — no new storage.

## Considered Options

### Sub-decision 1 — Shape

- **A: Single `guests[]` of guest-entry objects, response embedded** (chosen)
- **B: Keep three arrays; change `invited[]` to be append-only and derive "pending"**
- **C: Rename `invited` → `pending` only**

### Sub-decision 2 — Person identity

- **A: `userId` is the reference; `name` / `email` are caches on the entry** (chosen)
- **B: `userId` only; resolve names/emails through a directory endpoint**
- **C: Embedded person object, no reference**

### Sub-decision 3 — Plus-ones

- **A: Plus-ones are guest entries with `userId: null` and `invitedBy: <sponsor>`** (chosen)
- **B: Keep the integer count on the sponsor's entry**

### Sub-decision 4 — Legacy data

- **A: Normalize on read, deterministically; write only the new shape** (chosen)
- **B: One-off migration script over `gameNights.json`**

## Decision Outcome

### Sub-decision 1 — Single `guests[]`

Chosen option: **Option A**. A guest *is* a person plus their response; splitting that across arrays is what created the pending/invited confusion and the removal-on-respond dance.

```js
night.guests = [
  { id, userId: 'd535…', name: 'Jim', email: 'jm…', invitedBy: 'jaetill', invitedAt,
    response: { type: 'playing', at }, respondedAt },
  { id, userId: null,    name: null,  email: null,  invitedBy: 'd535…',   invitedAt,
    response: { type: 'if_needed', at }, respondedAt },   // Jim's anonymous plus-one
  { id, userId: '0686…', name: 'Phil', email: 'ph…', invitedBy: 'd535…',  invitedAt,
    response: null, respondedAt: null },                  // Phil, invited by Jim, pending
]
```

- `id` — stable entry identity (UUID for new entries; deterministic `legacy-*` ids for normalized data so every client normalizes a legacy night to the *same* entries).
- `userId` — Cognito username; `null` until known (anonymous plus-one, or an email invite whose account resolution has not been written back yet).
- `name`, `email` — display and routing caches (see sub-decision 2).
- `invitedBy` — userId of whoever added the entry (host or a sponsoring guest).
- `response` — `null` (pending) or `{ type, at }` with `type ∈ playing | any_game | if_needed | spectating | declined`.
- `respondedAt` — when `response` last changed, including a cancel back to `null`; `null` if never answered. The merge below uses it so a stale tab cannot revert a person's own newer answer. Client-supplied values are clamped to "now + 5 min" server-side so they cannot be forged into the future.
- Guest-sponsored invites (rule 2) provision Cognito accounts and send Postmark mail from the host's address, so `/invite` logs them at WARN (`invite.by_guest`) with the sponsor's identity fields. Accepted for a friend group; a per-sponsor rate limit is the next step if it is ever abused.

Derived sets, computed by one shared helper module and nowhere else:

- **pending** = `response === null`
- **attending** = `response.type !== 'declined'`
- **declined** = `response.type === 'declined'`

**Permission rule** (enforced in `GeneratePresignedPost.validateChanges`, per entry, keyed by `id`):

1. The host may add, remove, or change any entry.
2. A guest whose own response is a yes-type may **add** entries with `invitedBy` = themselves, and may **remove or edit** only the anonymous plus-ones they brought (`userId === null && email === null`). A named friend they invited by email has their own standing from the moment the entry exists.
3. Anyone may change **only** `response` (and refresh `name`/`email`) on the entry whose `userId` is their own. Claiming an email-only entry on first contact requires the **authorizer-verified** JWT email to match the entry's email — the client's own statement of its email is never trusted (a member could otherwise hijack another invitee's pending entry). API-key callers (MCP) have no verified email and cannot claim.

**Enforcement is a merge, not a rejection.** The client uploads its whole in-memory array and never re-fetches first, so by the time Bob taps "Reserve a seat" the server copy has usually moved on (Carol responded, the host invited Dan). Rejecting Bob's upload because *someone else's* entry differs would make "Could not save" the normal experience of a PWA tab left open. So for a non-host, `mergeGuestChanges(serverGuests, uploadedGuests, actor)` starts from the **server's** list and applies only the actor's permitted deltas from the upload; everything else is kept as the server has it. The only rejections are the actor's own illegal actions (adding themselves to a night they were not invited to; bringing people while pending). The host's saves remain whole-night authoritative, as before (ADR-0018's accepted LWW granularity).

"Cancel RSVP" sets `response` back to `null`; it no longer deletes the person.

### Sub-decision 2 — `userId` reference with cached `name` / `email`

Chosen option: **Option A**. The reference is the userId; `name` and `email` are denormalized so the client can render a chip and the Lambda can address an email without a round-trip for every entry. Any path with fresher data refreshes the cache: the RSVP path writes the responder's current display name, the `/invite` Lambda writes Cognito's name and email on provisioning.

Option B (no email in the shared file) would be a real privacy improvement — `gameNights.json` is downloaded by every member — but it needs a new directory endpoint and would regress "Saved groups" / "Recent guests" matching. Deferred; the entry shape does not preclude it (drop the two cache fields, add the endpoint).

### Sub-decision 3 — Plus-ones as entries

Chosen option: **Option A**. A plus-one becomes a first-class row: `userId: null`, `invitedBy: <sponsor>`, optional `name`, and `response: { type: 'if_needed' }` at creation (the same treatment the old integer count received). The host assigns them to games by entry `id` — `playerKey(guest) = guest.userId ?? guest.id`. Legacy plus-ones normalize to `id = ${sponsorUserId}_guest_${n}`, which is exactly the synthetic id already stored in `signedUpPlayers`, so existing game assignments keep matching.

If a sponsor declines or cancels, their anonymous plus-ones are removed with them (they have no standing of their own). A named person the sponsor invited by email stays — they now have their own entry, their own invite email, and their own response.

### Sub-decision 4 — Normalize on read

Chosen option: **Option A**. `sanitizeNight` (client) and every Lambda read path call `normalizeGuests(night)`: if `guests[]` exists it is used as-is; otherwise it is built from the three legacy arrays with deterministic ids, and the legacy arrays are dropped on write. Because the mapping is a pure function of the legacy data, two clients normalizing the same legacy night produce identical `guests[]`, so the upload validator sees no spurious diff.

Nights that responders were already removed from (every past night) come back with those people as attending or declined, which is what the data said all along; "invited" for those nights is reconstructed as `pending ∪ responded`, which loses nothing that was still stored.

## Consequences

### Positive

- "Everyone invited" is `night.guests`. "Pending" is a one-liner. No path removes people on response.
- One key space. `findGuest(guests, { userId, email })` is the only place email↔userId matching happens; it fills in `userId` on first match.
- The upload validator finally enforces what its comment promised: non-hosts can only touch their own response and the plus-ones they brought.
- Plus-ones stop being an integer that pretends to be people at render time; assignments reference a real entry.
- `invitedBy` gives the host the sponsorship chain for free.

### Negative

- Touches every component and Lambda that reads attendance (~14 source files) plus their tests. Shipped as one PR because an intermediate state with both models is worse than either.
- `name`/`email` caches can go stale until refreshed by a response or re-invite. Accepted; the old `rsvps[].name` had the same property with no refresh path.
- `/invite` (nudgeNonResponders) and `GeneratePresignedPost` must be redeployed together with the frontend. During the minutes between the Pages deploy and the Lambda deploys, a save from a new client would still pass the *old* validator (it only checked `HOST_ONLY`), so nothing is rejected — but the new permission rules are not enforced until the Lambda lands.
- Clients running a pre-change bundle in an open tab would write the legacy arrays alongside `guests[]`; the normalizer prefers `guests[]` and drops the legacy arrays, so their edits to attendance would be lost until they reload. There is no service worker, so a reload picks up the new bundle. Accepted for a friend-group app.

### Neutral

- `selectedGames[].signedUpPlayers` / `interestedPlayers` keep their `{ userId, name }` shape; for plus-ones `userId` holds the entry id (as it already did via the synthetic-id convention).
- The RSVP-link token's `invitee` claim now carries the userId when known, email otherwise — same tolerance the token already had.
- Known gap: if Cognito provisioning failed for an email invitee, an email-link game join keys the seat by the entry `id`; once their account resolves, that seat is no longer recognised as theirs in the app. Rare (needs a failed provisioning) and host-fixable; a normalization pass that rewrites `signedUpPlayers[].userId === entry.id` to the resolved userId would close it.
- `sides[]` (food) is unchanged; it was already keyed by userId only.

## Pros and Cons of the Options

### Sub-decision 1

**A: Single `guests[]`** — ✅ one shape, one derivation, enforceable rules; ✅ `invitedBy` falls out naturally. ❌ largest blast radius.

**B: Append-only `invited[]` + derive pending** — ✅ smaller change; ✅ makes `invited` host-only. ❌ still two key spaces; ❌ still three arrays with three shapes; ❌ plus-one count stays.

**C: Rename only** — ✅ trivial. ❌ changes nothing that caused the bugs.

### Sub-decision 2

**A: userId + cached name/email** — ✅ no new endpoint; ✅ renders offline. ❌ email remains in the shared file; ❌ cache staleness.

**B: userId only + directory endpoint** — ✅ best privacy. ❌ new Lambda/route + IAM; ❌ Saved groups / Recent guests need rework.

**C: Embedded person object** — ✅ simplest reads. ❌ no identity to match on; every rename is a divergence.

### Sub-decision 3

**A: Entries** — ✅ assignable by id; ✅ can be named; ✅ upgrades to a real invite in place. ❌ more rows.

**B: Integer count** — ✅ tiny. ❌ synthetic ids at render time; ❌ can't name or upgrade.

### Sub-decision 4

**A: Normalize on read** — ✅ no migration window; ✅ idempotent across clients. ❌ normalizer lives forever (small).

**B: Migration script** — ✅ file is clean afterwards. ❌ needs a write freeze; ❌ any client with stale localStorage re-uploads the old shape anyway.

## Implementation notes

- Helper module: `src/js/data/guests.js` (ESM, frontend) and `lambda/lib/guests.js` (CJS, Lambdas + MCP). The two are byte-identical apart from the export block; `tests/guestsParity.test.js` fails the build if they drift. This is the cost of the frontend being ESM under Vite and the Lambdas being CommonJS; a shared package was judged heavier than one parity test.
- `GeneratePresignedPost.validateChanges` normalizes both `current` and `incoming`, then for non-hosts replaces the uploaded `guests[]` with `mergeGuestChanges(current.guests, incoming.guests, actorId)` from the helper module (see the enforcement note above). Hosts pass through.
- `findGuest` is pure; `claimGuest` is the write-path variant that fills in `userId`/`email`/`name` on first contact. Legacy nights that list one person twice (userId in `rsvps[]` without an email, plus their email in `invited[]`) keep both entries — the email one shows as pending until the host removes it. The data cannot prove they are the same person, and guessing would delete an invite.
- The host's invite flows save the night **before** calling `/invite`, so the Lambda resolves the client's placeholder in place (matched by email) and both sides keep the same entry id.
- `nudge.js` `/invite`: provisions first, then `ensureGuest` (ETag-conditional read-merge-write, matching by userId or email, filling in `userId`/`name`/`email`); returns the entry so the client can upsert it locally instead of inventing its own. Callers who are attending (not just the host) may invite; `invitedBy` is the caller.
- `nudge.js` `/nudge` targets `pendingGuests(night)`; email comes from the entry cache, falling back to `AdminGetUser`.
- `rsvpLink.js` `applyChoice` sets `response` on the matched entry (creating one under the host's `invitedBy` when a valid token names someone with no entry — the token itself is proof of invitation).
- Frontend: `sanitizeNight` normalizes; `renderRSVP`, host controls, summary, selected-games assignment, food/suggestion gates, `permissions.js`, `utils.joinGame`, `userDirectory`, `previewData`, and the event form all read/write `guests[]` only.
- Deploy order after merge: Pages (automatic) → `GeneratePresignedPost` → `nudgeNonResponders` → `rsvpLink` (all via `build/make_deploy_zips.py` + `update-function-code`).

## Links

- [ADR-0018 — Sync model, auth, and security hardening](0018-sync-auth-security-hardening.md) — whole-file LWW merge and ETag-conditional writes this design relies on
- [ADR-0019 — Web Push, RSVP links, calendar invites](0019-web-push-rsvp-links-calendar-invites.md) — RSVP-link token `invitee` claim
- [ADR-0020 — Caller-attribution logging](0020-caller-attribution-logging.md) — `recipient_hash` is how the 2026-09-12 invites were reconstructed
- PR #364–#367 — `rsvp.email` and the `userDirectory` email map this replaces
