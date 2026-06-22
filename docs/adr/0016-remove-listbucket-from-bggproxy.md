# ADR-0016: Remove s3:ListBucket from bggProxy role to prevent key enumeration

- **Status:** Proposed
- **Date:** 2026-06-22
- **Deciders:** Jason
- **Tags:** security, iam, s3, lambda
- **Supersedes (partial):** [ADR-0015](./0015-unconditional-listbucket-for-bggproxy.md) — the `s3:ListBucket` grant is removed; the policy-file consolidation from ADR-0015 still stands

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

ADR-0015 granted unconditional `s3:ListBucket` on the entire `jaetill-game-nights` bucket to the `bggProxy` Lambda role. The grant existed solely so S3 would return `NoSuchKey` (404) instead of `AccessDenied` (403) when `GetObject` targeted a non-existent key — a UX concern for new users who have no collection or profile yet.

Issue #145 identified that this unconditional `s3:ListBucket` also allows the Lambda (or any actor who assumes the role) to enumerate every key in the bucket via `ListObjects`. The bucket stores `gameNights.json`, all user profiles, and all user collections. While the data itself remains protected by prefix-scoped `GetObject`, the ability to list all keys leaks the set of active usernames and the presence of their data files.

The `bggProxy` Lambda already has a code guard in `_s3Get` that catches `AccessDenied` errors whose message mentions `s3:ListBucket` and treats them as "not found." This guard was originally defense-in-depth (ADR-0015). The question: should we remove the IAM grant and promote this code guard to the primary missing-key handler?

## Decision Drivers

- **Least privilege.** The role should have only the permissions its code path requires. `bggProxy` never calls `ListObjects` — the grant served only S3's internal 404-vs-403 decision.
- **Key enumeration risk.** Unconditional `s3:ListBucket` on a shared bucket allows enumerating all keys, leaking the set of users and their data-file existence.
- **Proven code guard.** The `_s3Get` `AccessDenied` handler has been in production since the original P1 fix and is exercised by unit tests. Promoting it from defense-in-depth to primary handler requires no new code.
- **Operational simplicity.** Removing a permission is simpler than adding conditions, and the behavior is well-tested.

## Considered Options

- **Option A: Remove `s3:ListBucket` entirely and rely on the existing `_s3Get` code guard.**
- **Option B: Scope `s3:ListBucket` with a `StringLike` condition on `s3:prefix`.**
- **Option C: Keep unconditional `s3:ListBucket` and accept the enumeration risk.**

## Decision Outcome

Chosen option: **Option A (remove `s3:ListBucket`, rely on code guard)**, because the Lambda never calls `ListObjects`, the code guard is proven in production, and removing the grant eliminates key enumeration entirely with no functional regression.

## Consequences

### Positive

- Eliminates bucket-wide key enumeration from the `bggProxy` role — the role can now only `GetObject`/`PutObject` under `collections/*` and `profiles/*`.
- Tighter least-privilege posture: the role has exactly two actions (`GetObject`, `PutObject`) on exactly two prefixes.
- No new code required — the existing `_s3Get` guard already handles the `AccessDenied`-as-404 pattern.

### Negative

- `GetObject` on a non-existent key now returns `AccessDenied` (not `NoSuchKey`). The Lambda must pattern-match the error message to distinguish "missing key" from "genuine permission failure." If AWS changes the error message format, the guard could misclassify errors. Mitigation: the guard checks for `s3:ListBucket` in the message, which is a stable part of S3's IAM-denial error format; unit tests catch regressions.
- Slightly more opaque debugging: CloudWatch logs will show `AccessDenied` for normal "new user, no file yet" cases rather than `NoSuchKey`. The structured logger and code comments document this.

### Neutral

- The Terraform policy file and the reference policy file (`lambda/iam/bggProxy-inline.json`) both lose the `ListBucketForExistenceChecks` statement. No Terraform state migration needed — this is a pure policy-document update.

## Pros and Cons of the Options

### Option A: Remove s3:ListBucket, rely on code guard

- Achieves true least privilege — no permissions beyond what the code path uses
- Eliminates key-enumeration attack surface entirely
- No new code; existing guard promoted from defense-in-depth to primary handler
- Proven in production (the guard was already catching these errors before ADR-0015's fix propagated)
- Depends on stable S3 error-message format for `AccessDenied` classification

### Option B: Scope s3:ListBucket with StringLike on s3:prefix

- Would preserve `NoSuchKey` behavior while limiting enumeration scope
- Cannot work for the same reason documented in ADR-0015: `s3:prefix` is absent from the `GetObject` evaluation context, so the condition evaluates to false and the Allow never fires
- Was already tried and failed (PR #123, issue #124)

### Option C: Keep unconditional s3:ListBucket

- Preserves clean `NoSuchKey` responses — simpler error handling
- Leaves bucket-wide key enumeration open — violates least privilege
- The Lambda never calls `ListObjects`, so the grant serves only S3's internal decision logic

## Implementation notes

- `lambda/iam/bggProxy-inline.json`: removed `ListBucketForExistenceChecks` statement.
- `terraform/envs/prod/iam-policies/bggProxy-S3Access.json`: same removal, keeping the two files identical.
- `lambda/bggProxy.mjs`: updated IAM header comment to document intentional omission.
- `tests/bggProxy.test.js`: updated comment — code guard is now primary, not defense-in-depth.
- `tests/iamPolicies.test.js`: replaced "allows s3:ListBucket" assertion with "does not grant s3:ListBucket" assertion.
- `docs/iam-audit.md`: updated bggProxy section to reflect the removal.
- `docs/adr/0015-unconditional-listbucket-for-bggproxy.md`: status updated to "Superseded (partial)."

## Links

- [Issue #145](https://github.com/jaetill/game-night-pwa/issues/145) — unconditional `s3:ListBucket` allows full-bucket key enumeration
- [ADR-0015](./0015-unconditional-listbucket-for-bggproxy.md) — prior decision that granted unconditional `s3:ListBucket` (now partially superseded)
- [Issue #124](https://github.com/jaetill/game-night-pwa/issues/124) — original finding that `s3:prefix` conditions don't work in `GetObject` context
- [AWS docs: ListBucket and error responses](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html) — documents that `s3:ListBucket` controls 404-vs-403 for missing keys
