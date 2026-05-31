# ADR-0015: Use StringLikeIfExists for bggProxy ListBucket prefix condition

- **Status:** Proposed
- **Date:** 2026-05-31
- **Deciders:** Jason
- **Tags:** security, iam, s3, least-privilege

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

Issue #122 identified that the `bggProxy` Lambda role's `s3:ListBucket` grant was unconditional on the bucket root, allowing full bucket enumeration if the role's credentials were ever compromised. The fix (PR #129) added a `StringLike` condition on `s3:prefix` to scope enumeration to `collections/*` and `profiles/*`.

Issue #130 then identified that `StringLike` is the wrong operator for this use case. When S3 internally evaluates `s3:ListBucket` authorization during a `GetObject` request on a non-existent key, the `s3:prefix` condition key is absent from the IAM evaluation context. `StringLike` with an absent key evaluates to **false**, so the `Allow` statement does not fire — S3 returns `AccessDenied` instead of the more informative `NoSuchKey`. This breaks the Lambda's ability to distinguish "key doesn't exist" from "permission denied", which matters for collection and profile existence checks.

The decision: which IAM condition operator should scope the `s3:ListBucket` grant while preserving both (a) enumeration restriction for direct `ListBucket` calls and (b) correct `NoSuchKey` responses for `GetObject` on absent keys?

## Decision Drivers

- **Least privilege.** The bggProxy role should not be able to enumerate keys outside `collections/*` and `profiles/*` via direct `ListBucket` calls.
- **Correct error semantics.** `GetObject` on a non-existent key should return `NoSuchKey` (HTTP 404), not `AccessDenied` (HTTP 403). The Lambda relies on this distinction.
- **IAM condition-key semantics.** The `...IfExists` suffix is the idiomatic AWS approach when a condition key may be absent from the evaluation context — it evaluates to true when the key is missing, and applies the operator normally when it is present.

## Considered Options

- **Option A: `StringLikeIfExists`** — evaluates to true when `s3:prefix` is absent; applies the prefix filter when present.
- **Option B: `StringLike`** (status quo from PR #129) — evaluates to false when `s3:prefix` is absent; blocks the `Allow` in contexts where the key is missing.
- **Option C: Remove the condition entirely** — unconditional `s3:ListBucket` on the bucket ARN; accept the enumeration risk.

## Decision Outcome

Chosen option: **Option A (`StringLikeIfExists`)**, because it is the only operator that satisfies both decision drivers simultaneously — it scopes explicit `ListBucket` calls to the intended prefixes while allowing the `Allow` to fire during `GetObject` internal authorization checks where `s3:prefix` is absent.

## Consequences

### Positive

- `GetObject` on a non-existent key under `collections/*` or `profiles/*` correctly returns `NoSuchKey`, enabling the Lambda to distinguish missing data from permission errors.
- Direct `ListBucket` API calls are still restricted to keys under `collections/*` and `profiles/*`, preserving the enumeration mitigation from issue #122.
- Aligns with AWS's documented `...IfExists` pattern for condition keys that are not present in all request contexts.

### Negative

- Slightly broader than `StringLike` in edge cases: any S3 API call that does not populate `s3:prefix` (not just `GetObject`) will have the condition evaluate to true. In practice this is a non-issue — the only S3 action in this statement is `s3:ListBucket`, and the `GetObject`/`PutObject` grants are already separately scoped to the correct resource ARNs.

### Neutral

- The reference policy file (`lambda/iam/bggProxy-inline.json`) is committed as documentation — applying it to the live IAM role is a separate manual step.
- Issue #124 tracks the same `StringLike` → `StringLikeIfExists` fix for the Terraform-managed sibling policy files; this ADR's rationale applies to those as well.

## Pros and Cons of the Options

### Option A: `StringLikeIfExists`

- ✅ Correct `NoSuchKey` response for `GetObject` on absent keys
- ✅ Prefix-scoped enumeration for direct `ListBucket` calls
- ✅ Idiomatic AWS pattern for optional condition keys
- ❌ Marginally broader: condition passes for any request context missing `s3:prefix` (low practical risk)

### Option B: `StringLike`

- ✅ Strictest possible condition — only fires when `s3:prefix` is present and matches
- ❌ Breaks `GetObject` error semantics — returns `AccessDenied` instead of `NoSuchKey` for absent keys
- ❌ Contradicts the stated purpose of the `ListBucketForExistenceChecks` statement

### Option C: Remove the condition entirely

- ✅ Simplest policy — no condition-operator ambiguity
- ✅ `GetObject` error semantics work correctly
- ❌ Allows full bucket enumeration via direct `ListBucket` calls, re-opening issue #122

## Implementation notes

- `lambda/iam/bggProxy-inline.json`: canonical reference policy with three statements — `ReadWriteCollections`, `ReadWriteProfiles`, and `ListBucketForExistenceChecks` (using `StringLikeIfExists`).
- `tests/iamPolicies.test.js`: two tests assert `StringLikeIfExists` is present (not `StringLike`) and that prefix scope covers `collections/*` and `profiles/*`.
- The live IAM role (`bggProxy-role-4m5m0lfj`) must be updated separately to match this reference policy.
- Issue #124 tracks applying the same operator change to the Terraform-managed policy files.

## Links

- [Issue #122](https://github.com/jaetill/game-night-pwa/issues/122) — original finding: unconditional `s3:ListBucket` enables full bucket enumeration
- [Issue #130](https://github.com/jaetill/game-night-pwa/issues/130) — `StringLike` vs `StringLikeIfExists` for absent condition keys
- [Issue #124](https://github.com/jaetill/game-night-pwa/issues/124) — same fix needed for Terraform-managed sibling policies
- [AWS IAM condition operator docs](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html#Conditions_IfExists) — `...IfExists` semantics
- [ADR-0003](./0003-security-hardening-low-findings.md) — prior security hardening decisions
