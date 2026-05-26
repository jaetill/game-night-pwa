# ADR-0015: Add s3:ListBucket to bggProxy role and treat ListBucket-AccessDenied as not-found

- **Status:** Proposed
- **Date:** 2026-05-26
- **Deciders:** Jason
- **Tags:** security, iam, lambda, s3

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

S3 returns `AccessDenied` instead of `NoSuchKey` when an IAM role lacks `s3:ListBucket` and the requested object does not exist. The `bggProxy-role-4m5m0lfj` role only had `s3:GetObject` and `s3:PutObject`, so any new user without a saved profile or BGG collection triggered a 500 error instead of the expected empty/default response (issue #81).

Two changes are needed: (1) an IAM permission expansion to restore correct S3 error semantics, and (2) a defensive code-level catch so the Lambda handles this error class gracefully regardless of IAM state.

Both changes are security-relevant: the IAM change widens the role's permissions, and the code change reinterprets an authorization error as a business-logic not-found result.

## Decision Drivers

- **Correctness.** New users must get an empty default response, not a 500.
- **Least privilege.** IAM roles should have only the permissions they need, but `s3:ListBucket` is the AWS-documented prerequisite for correct `NoSuchKey` semantics.
- **Defense in depth.** The Lambda should handle this error gracefully even if the IAM policy has not yet been applied (deployment timing) or is later modified.
- **Minimal blast radius.** The catch must be narrowly scoped to avoid masking genuine authorization failures.

## Sub-decision 1: IAM permission expansion

### Considered Options

- **Option A: Add `s3:ListBucket` on the bucket resource** — `arn:aws:s3:::jaetill-game-nights` (bucket-level, no prefix condition).
- **Option B: Add `s3:ListBucket` with a `Condition` restricting `s3:prefix` to `collections/` and `profiles/`** — limits enumeration to only the paths bggProxy uses.
- **Option C: Do not expand IAM** — rely solely on the code-level catch.

### Decision Outcome

Chosen option: **Option A (bucket-level `s3:ListBucket`)**, because `s3:ListBucket` is a bucket-level action and the bucket contains only application data managed by trusted Lambda roles. The permission is required by AWS for correct `GetObject` error semantics; without it, the code-level catch is the only safety net.

### Pros and Cons of the Options

#### Option A: Bucket-level `s3:ListBucket`

- ✅ Restores correct S3 `NoSuchKey` semantics — the canonical AWS fix
- ✅ Simple, matches the pattern used by other roles in this account
- ❌ bggProxy can now enumerate all keys in the bucket (including `gameNights.json`), not just `collections/*` and `profiles/*`

#### Option B: Prefix-scoped `s3:ListBucket` via Condition

- ✅ Limits key enumeration to only the paths bggProxy needs
- ❌ `s3:ListBucket` `Condition` keys only filter `ListObjectsV2` results — they do not restrict the `GetObject` 403-vs-404 behavior, so this Condition would not actually solve the root cause
- ❌ Adds IAM complexity for no functional benefit

#### Option C: Code-only catch (no IAM change)

- ✅ No IAM change required
- ❌ Permanently relies on matching an error message string — fragile if AWS changes the message format
- ❌ Violates the principle of fixing the root cause

## Sub-decision 2: Defensive error-handling catch

### Considered Options

- **Option A: Catch `AccessDenied` where `err.message` includes `s3:ListBucket`** — treat as `notFoundValue`, re-throw all other `AccessDenied` errors.
- **Option B: Catch all `AccessDenied` errors as not-found** — broadest catch.
- **Option C: No code-level catch** — fix IAM only and rely on correct S3 semantics.

### Decision Outcome

Chosen option: **Option A (narrowly-scoped catch)**, because it handles the deployment gap (IAM not yet applied) and future IAM drift without masking unrelated authorization failures.

### Pros and Cons of the Options

#### Option A: Narrow catch (AccessDenied + s3:ListBucket in message)

- ✅ Handles the specific S3 behavior documented by AWS
- ✅ Does not mask genuine GetObject/PutObject permission denials
- ✅ Makes the Lambda resilient to IAM deployment timing
- ❌ Depends on the error message containing the string `s3:ListBucket` — could break if AWS changes the message format (low risk, stable for years)

#### Option B: Catch all AccessDenied as not-found

- ✅ Simpler condition
- ❌ Silently swallows genuine permission failures (e.g., if `s3:GetObject` is revoked) — masks real errors as empty data
- ❌ Violates defense-in-depth by hiding authorization failures

#### Option C: IAM-only fix (no code catch)

- ✅ No message-string matching in code
- ❌ 500s persist until the IAM policy is manually applied to the role
- ❌ If IAM is later tightened (e.g., removing `s3:ListBucket`), the bug silently returns

## Consequences

### Positive

- New users without profiles or BGG collections get the correct empty/default response instead of 500 errors.
- The Lambda is resilient to IAM deployment timing — the code-level catch provides a safety net before, during, and after the IAM change is applied.
- The IAM policy document (`lambda/iam/bggProxy-inline.json`) is now committed, making the role's intended permissions auditable from source control.

### Negative

- `bggProxy-role-4m5m0lfj` can now enumerate all keys in the `jaetill-game-nights` bucket, not just `collections/*` and `profiles/*`. Practical risk is low — the bucket contains only application data and all Lambda code is trusted — but it widens the blast radius if the role's credentials were ever exfiltrated.
- The error-message string match (`err.message?.includes('s3:ListBucket')`) is a coupling to AWS's current error message format. If AWS changes the message, the catch would stop matching — but at that point the IAM fix would be the primary defense.

### Neutral

- The `_s3GetWith(client, key, notFoundValue)` export is a test-only seam. It widens the module's public API surface but follows an established pattern in this codebase (see `resolveCallerId` test exports).

## Implementation notes

- `lambda/bggProxy.mjs`: `_s3GetWith` exported for test injection; `s3Get` delegates to it with the module-scoped S3 client.
- `lambda/iam/bggProxy-inline.json`: reference IAM policy — apply to `bggProxy-role-4m5m0lfj` via AWS Console or CLI.
- `tests/bggProxy.test.js`: 5 tests covering NoSuchKey, ListBucket-AccessDenied, custom notFoundValue, unrelated AccessDenied (re-throws), and unexpected errors (re-throws).

## Links

- [Issue #81](https://github.com/jaetill/game-night-pwa/issues/81) — bggProxy 500 for new users without profile/collection
- [AWS docs: Troubleshoot Access Denied (403 Forbidden)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-403-errors.html) — explains s3:ListBucket requirement for correct 404 semantics
- [ADR-0003](./0003-security-hardening-low-findings.md) — prior security hardening decisions for Lambda helpers
- [ADR-0001](./0001-platform-adoption.md) — platform adoption (references Standard 04 quality gates)
