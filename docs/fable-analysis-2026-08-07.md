# Game Night PWA — Independent Analysis (Fable, 2026-08-07)

**Verdict up front:** the backend Lambdas are in good shape — the unit suite passes (183/183 locally), auth design is sound, and the upload validator is a reasonable idea. The real problems are in the **sync model and the frontend/backend seams**. I found five bugs severe enough to explain "some aspects still don't work," plus a data-loss bug you may not have noticed yet. Everything below is confirmed against the code unless marked *verify*.

## Ranked findings

| # | Severity | Finding |
|---|----------|---------|
| 1 | Critical | Cancelling an event permanently breaks sync for every other user who had it cached |
| 2 | Critical | Session silently dies after ~1 hour — `refresh()` exists but is never called |
| 3 | High | Saving your profile deletes all your Saved Groups (server-side data loss) |
| 4 | High | Events move to "Past nights" on the day they happen (UTC/local date bug) |
| 5 | High (*verify*) | Feedback widget likely posts to the wrong URL in production |
| 6 | High | Whole-file last-writer-wins sync loses concurrent RSVPs; four writers race on `gameNights.json` |
| 7 | Medium | `VITE_ADMIN_NAMES` is documented as gating host controls but is referenced nowhere — everyone sees "Schedule a Game Night" |
| 8 | Medium | "Interested players" renders but no UI can ever express interest — half-built feature |
| 9 | Medium | `utils.js` still has array-shaped `selectedGames` functions (dead code, wrong data shape — your own test file notes it) |
| 10 | Medium | It's a PWA with no service worker; 1.4 MB icons; manifest branding mismatch |
| 11–16 | Low | Details below |

---

## 1. Critical — Cancel event bricks sync for everyone else

**Chain:** `storage.js` merges cloud + localStorage with no deletion tombstones, and `loadGameNights()` **pushes the merged array back to the cloud on every page load**. When a host cancels a night, every other user's browser still has it in localStorage. On their next load:

1. Merge resurrects the deleted night locally (`mergeNights` has no concept of deletion).
2. `pushGameNightsToCloud(merged)` sends it up.
3. `GeneratePresignedPost.validateChanges` no longer finds it in `current`, treats it as a **new** night, and rejects with 403 `"New night must set hostUserId to your own userId"` (hostUserId is the original host, not the pusher).
4. `loadGameNights` catches, falls back to local — and **every subsequent save from that user also 403s**, because `saveGameNights` always sends the full array containing the zombie night.

Result: after any event cancellation, all other participants are stuck on stale local data and none of their RSVPs save — until they manually clear localStorage. The failure is silent apart from generic "Could not save" toasts. On the host's *other* devices the night quietly resurrects instead (host passes validation). This is my top candidate for "things don't work."

**Fix direction:** tombstones (`deleted: true` + `lastModified`) instead of removal, and stop pushing on load (see #6). A cheap stopgap: on a 403 from `/upload-token`, drop nights that no longer exist in cloud from localStorage and retry once.

## 2. Critical — No token refresh, ever

`auth.js` has a complete, correct `refresh()` — and nothing calls it. `authFetch` blindly attaches whatever ID token is in localStorage; `isAuthenticated()` is checked exactly once, at page load. Cognito ID tokens live ~1 hour, so any tab open longer than that starts failing every API call: loads silently fall back to localStorage, saves toast "Try again" forever. A reload fixes it (silent re-auth via the Hosted UI cookie), which makes it feel like random flakiness.

**Fix direction:** in `authFetch`, check `gn.expires.at` before each call; if within the 60 s window, `await refresh()` first, and on refresh failure call `startLogin()`. That's ~10 lines and probably eliminates a whole class of "it stopped working until I refreshed."

## 3. High — Profile save wipes Saved Groups

Both features write `profiles/{userId}.json`, but only one is polite about it. `groups.js` preserves other fields (`{ ...profile, groups }`); `bggProxy.mjs` POST `/profiles` writes **exactly five whitelisted fields** and drops everything else — including `groups`. So: create groups → later tweak your display name in the profile modal → all groups gone from S3. The localStorage `userGroups` cache masks the loss until it's refreshed, which makes this look like random disappearance days later.

**Fix:** in bggProxy's profile POST, read-merge-write like groups.js does (or store groups under their own key).

## 4. High — Today's event shows under "Past nights"

`renderGameNights.js`:

```js
const upcoming = sorted.filter(n => new Date(n.date) >= today);
```

`new Date("2026-08-07")` parses as **UTC midnight** = Aug 6, 8:00 PM Eastern; `today` is *local* midnight Aug 7. So on the day of the event, `new Date(n.date) < today` and tonight's game night drops into the collapsed "Past nights" section — in any negative-UTC-offset timezone, i.e. always, for you. Guests looking for tonight's event see "No upcoming game nights."

**Fix:** parse as local (`new Date(\`${n.date}T00:00:00\`)`) or compare date strings lexically (`n.date >= todayStr`).

## 5. High (*verify*) — Feedback endpoint URL

`feedback.js` builds `${import.meta.env.VITE_API_URL}/feedback`, but your local `.env` has `VITE_API_URL=…/prod/get-token` — the variable predates the feedback widget and includes a route path. If the GitHub secret has the same value (likely — same origin story), production feedback posts to `/prod/get-token/feedback` → 403 from the gateway, and the widget shows "Could not submit feedback." Every other module hardcodes the base URL and ignores `VITE_API_URL` entirely, which is why nothing else is affected.

**Verify:** check the `VITE_API_URL` repo secret. **Fix:** set it to `…/prod` (no path) — or drop the env var and use the same hardcoded base as the rest of the app.

## 6. High — The sync model itself

Every mutation uploads the entire `gameNights.json`; every page load downloads, merges, and re-uploads it. Four independent writers (upload Lambda, nudge/invite Lambda, createEvent Lambda, and every browser) do read-modify-write on the same S3 object with no ETag/conditional-put. Two people RSVPing near-simultaneously = one RSVP silently lost (last writer wins at whole-night granularity — the merge picks whichever *night object* has the newer `lastModified`, discarding the other's changes wholesale). The invite button even races against itself: it fires `syncAndRender` (full upload) and `POST /invite` (Lambda also rewrites the file) concurrently.

For a friend-group app you don't need DynamoDB — but three cheap wins: stop pushing on load (push only on actual mutation), use `If-Match`/ETag conditional PUTs in `GeneratePresignedPost` with one retry, and merge per-field (rsvps by userId) rather than per-night. #1's tombstones fall out of the same rework.

## 7–10. Half-built and inconsistent pieces

**7.** `VITE_ADMIN_NAMES` is set in `.env`, passed by `deploy.yml`, documented in CLAUDE.md as "controls who sees host controls" — and appears in zero lines of `src/`. `renderGlobalHostPanel` shows the create button to everyone (any member can create a night they host — maybe intended, but then the docs and secret are dead weight).

**8.** `renderSelectedGames` displays "N interested" and interested-player chips, `expressInterest()` exists in utils — but no button, anywhere, calls it. The feature can only ever show data injected by `previewData` or the MCP path.

**9.** `utils.js` `createGameNight` / `addSelectedGame` / `removeSelectedGame` treat `selectedGames` as an **array**; the live data shape is an object map. They're exported and unit-tested but unused by the UI — `tests/gameUtils.test.js` literally contains the comment "this reveals a bug in the source." Dead code with the wrong schema is a trap for the next feature (or the next agent). Delete them or fix the shape.

**10.** No service worker exists in the repo — no offline, no caching; "PWA" is manifest-only (installable, but a dead app when offline, which is exactly when someone's standing in a driveway looking for the address). Also: `icons/icon-192.png` and `icon-512.png` are each ~1.4 MB (same oversized image), and the manifest still says `"name": "Game Night RSVP"`, `theme_color #4CAF50` (green) vs the app's amber `#d97706`.

## 11–16. Lower severity

**11.** `renderSuggestions` deletes by index into the *filtered* `bringing` array but splices the *original* `suggestions` array — wrong item deleted if any legacy non-object entry exists.

**12.** `toast.js` interpolates messages into `innerHTML`; invite toasts include user-typed text (`` `${email} invited!` ``). Self-XSS only today, but one `textContent` swap removes the class.

**13.** MCP-created events default `time: ''` → `new Date("2026-08-07T")` is Invalid → the card renders "Invalid Date" and sorts arbitrarily.

**14.** Re-inviting someone who was provisioned but never signed in sends a credentials-free email while their 7-day temp password may have expired — no resend path; that guest is stuck until you reset them in Cognito.

**15.** DEBUG preview toast says "not saved to cloud," but `syncAndRender` uploads the fake guests. Only bites when `DEBUG_MODE=true`.

**16.** `build/` zips and `dist/` are stale (the committed `dist/` bundle predates the feedback widget entirely, and the `build/` handler copies predate the Sentry/logger wrapping). Harmless if you never deploy from them — but worth confirming the *deployed* Lambdas match `lambda/` source, since Lambdas aren't in CI.

## What's solid

Credit where due: the dual-mode authorizer is well-reasoned (the identitySource workaround is documented and correct), `validateChanges` is the right instinct even if #1 shows an edge it mishandles, HTML escaping is disciplined in emails and summary rendering, the PII scrubbing in logger/sentry is more thorough than most production shops bother with, and 183 unit tests pass. The tests are unit-scoped, though — every bug above lives at an integration seam no test crosses, which is why the suite is green while the app misbehaves.

## Suggested order of attack

Fix #2 (token refresh, ~10 lines) and #4 (date parse, 1 line) first — small, high-visibility. Then #3 (profile merge, one Lambda change). Then #1 + #6 together, since tombstones and push-on-mutation are one design change to `storage.js` + `GeneratePresignedPost`. Verify #5 with a one-minute look at the GitHub secret.
