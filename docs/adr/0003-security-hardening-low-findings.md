# ADR-0003: Harden Lambda helpers against information disclosure and unverified-trust paths

- **Status:** Proposed
- **Date:** 2026-05-10
- **Deciders:** Jason
- **Tags:** security, lambda, defense-in-depth

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

A security review (tracked in issue #6) identified 7 LOW-severity findings across the Lambda codebase. Three of these represent architectural decisions worth recording:

1. **`resolveCallerId.js` had a fallback path** that decoded JWT payloads directly from the `Authorization` header without signature verification. Under the current deployment this was safe (API Gateway always runs the authorizer first), but it created a latent trust violation — if the helper were ever reused outside an authorizer-gated context, the unverified payload would be accepted as truth.

2. **`feedback.js` returned `issue_url`** (the full GitHub Issues URL) in its 201 response to anonymous, unauthenticated callers. This disclosed the internal repository name and issue numbering to the public internet.

3. **`createEvent.js` event-ID generation** was documented but the security rationale for the cryptographic suffix (vs. the information-disclosure tradeoff of the timestamp prefix) was implicit rather than explicit.

The question: should these be fixed individually (removing fallback, removing field, adding docs), or should the codebase adopt a broader hardening pattern (e.g., a shared validation layer, response-schema stripping)?

## Decision Drivers

- **Minimal blast radius.** The app has real users; changes should be surgical.
- **Defense-in-depth.** The platform's security stance (Standard 04) values layers — code should not rely on a single upstream check.
- **Least-information principle.** Responses to unauthenticated callers should disclose the minimum necessary.
- **Maintainability.** A small friend-group app should not carry enterprise middleware patterns that obscure readability.

## Considered Options

- **Option A: Surgical per-finding fixes** — remove the fallback path, remove the field, improve docs.
- **Option B: Response-schema allowlisting middleware** — add a shared layer that strips any field not in an explicit schema before returning responses.
- **Option C: Do nothing** — accept the LOWs as acceptable risk for a low-traffic friend-group app.

## Decision Outcome

Chosen option: **Option A (surgical per-finding fixes)**, because the findings are isolated, the blast radius of each fix is near-zero, and adding shared middleware would be over-engineering for 3 independent LOWs in a small app.

## Consequences

### Positive

- `resolveCallerId` can now be safely reused in any context — it trusts only the authorizer-injected value, never raw headers.
- Anonymous callers to `/feedback` no longer learn the GitHub repo structure or issue-numbering cadence.
- The event-ID security contract is explicitly documented, making future reviews faster.

### Negative

- If a future Lambda is added outside API Gateway's authorizer context and uses `resolveCallerId`, it will get `null` — the developer must supply their own auth. (Previously the fallback would have silently "worked" — albeit unsafely.)

### Neutral

- The `/feedback` response shape changes (`issue_url` removed). No known consumers depend on this field (the frontend ignores it), but if any external integration scraped it, it will break.
- The `createEvent.js` change is documentation-only; no runtime behavior changes.

## Pros and Cons of the Options

### Option A: Surgical per-finding fixes

- ✅ Zero runtime risk — changes are deletions and doc improvements
- ✅ Each fix is independently reviewable and revertible
- ✅ No new abstractions to maintain
- ❌ Does not prevent similar issues in future code (no automated enforcement)

### Option B: Response-schema allowlisting middleware

- ✅ Prevents accidental field leakage by default in all future Lambdas
- ❌ Adds a shared abstraction layer that all 8 handlers must integrate with
- ❌ Increases coupling — a schema-definition bug breaks all endpoints
- ❌ Over-engineering for a 3-finding, friend-group-scale app

### Option C: Do nothing

- ✅ No effort; no regression risk
- ❌ Leaves a latent trust violation in `resolveCallerId` that could escalate if reused
- ❌ Continues disclosing internal repo structure to the public internet
- ❌ Violates the platform's defense-in-depth stance (Standard 04)

## Implementation notes

- `lambda/lib/resolveCallerId.js`: reduced to a single `return event?.requestContext?.authorizer?.userId || null` — no fallback paths.
- `lambda/feedback.js`: response body now returns only `{ id, status: 'received' }` — the opaque `FB-YYYY-NNNNNN` ID is sufficient for user follow-up.
- `lambda/createEvent.js`: JSDoc expanded to document the security property (32-bit random suffix), the tradeoff (timestamp prefix discloses creation time), and the mitigation path if the threat model changes.
- `tests/feedback.test.js`: assertion updated to verify `issue_url` is absent.

## Links

- [Issue #6](https://github.com/jaetill/game-night-pwa/issues/6) — security review findings tracker
- [OWASP API Security Top 10 — API3:2023 Broken Object Property Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/) — rationale for not exposing internal object references
- [ADR-0001](./0001-platform-adoption.md) — platform adoption (references Standard 04 quality gates)
