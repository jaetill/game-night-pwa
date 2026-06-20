# ADR-0015: Grant unconditional s3:ListBucket to bggProxy and consolidate its IAM policies

- **Status:** Proposed
- **Date:** 2026-06-17
- **Deciders:** Jason
- **Tags:** security, iam, s3, lambda

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `bggProxy` Lambda role had two separate inline policies (`S3CollectionAccess` and `S3ProfileAccess`), each granting `s3:GetObject` + `s3:PutObject` on their respective prefix and `s3:ListBucket` on the bucket. PR #123 added a `StringLike` condition on `s3:prefix` to scope the `ListBucket` grant to `collections/*` and `profiles/*` only — intending to follow least-privilege while fixing the P1 incident where `GetObject` on a missing key returned `AccessDenied` instead of `NoSuchKey`.

Issue #124 identified that this condition is ineffective: `s3:prefix` is an IAM condition key populated only during actual `ListObjects`/`ListBucket` API calls. When S3 internally checks whether the caller has `s3:ListBucket` permission during a `GetObject` on a non-existent key (to decide between returning 404 vs 403), `s3:prefix` is absent from the evaluation context. An absent condition key causes `StringLike` to evaluate to false, the Allow never fires, and S3 returns `AccessDenied` anyway. The condition rendered the entire P1 fix a no-op.

The question: how should we fix the broken condition, and should we consolidate the two duplicate policy files while we're at it?

## Decision Drivers

- **Correctness.** The P1 fix must actually work — `GetObject` on a missing key must return `NoSuchKey`, not `AccessDenied`.
- **Least privilege.** IAM permissions should be as narrow as possible while still being functional.
- **Maintainability.** Two near-identical policy files that must stay in sync is a maintenance burden and a drift vector.
- **Terraform hygiene.** Reference policies (`lambda/iam/`) and deployed policies (`terraform/envs/prod/iam-policies/`) must match.

## Considered Options

- **Option A: Remove the condition (unconditional ListBucket) and consolidate into one policy file.**
- **Option B: Replace `StringLike` with `ForAnyValue:StringLike` or another condition operator** to make prefix scoping work.
- **Option C: Add a separate explicit `HeadObject` permission** instead of relying on `ListBucket` for the 404-vs-403 behavior.

## Decision Outcome

Chosen option: **Option A (unconditional ListBucket, consolidated policy)**, because there is no IAM condition operator that makes `s3:prefix` available during the implicit `ListBucket` check inside a `GetObject` call — the condition key is structurally absent. Option B cannot work. Option C (`HeadObject`) does not solve the problem either — S3's 404-vs-403 decision is specifically gated on `s3:ListBucket`, not `HeadObject`.

## Consequences

### Positive

- The P1 fix actually works: `GetObject` on a non-existent key now returns `NoSuchKey` (404), enabling the Lambda to distinguish "no collection yet" from "permission denied."
- Single source of truth: one policy file (`bggProxy-S3Access.json`) instead of two near-duplicates.
- Reference policy (`lambda/iam/bggProxy-inline.json`) and Terraform policy are now identical, verified by automated tests.

### Negative

- The `bggProxy` role can now enumerate all top-level keys in `jaetill-game-nights` via `ListObjects`, not just keys under `collections/` and `profiles/`. This is a minor privilege widening. Mitigations:
  - The role still cannot *read* objects outside `collections/*` and `profiles/*` — `GetObject` remains prefix-scoped.
  - The role still cannot *write* objects outside those prefixes — `PutObject` remains prefix-scoped.
  - The bucket contains only `gameNights.json`, `profiles/*.json`, and `collections/*.json` — key names are not sensitive.
  - The Lambda code never calls `ListObjects` — the grant exists solely for S3's internal 404-vs-403 evaluation.

### Neutral

- Terraform apply will create the new `S3Access` policy before destroying `S3CollectionAccess` and `S3ProfileAccess`. The role always has S3 permissions throughout the transition — no window of denied access.

## Pros and Cons of the Options

### Option A: Unconditional ListBucket + consolidate

- ✅ Actually fixes the P1 incident — `GetObject` 404 behavior works
- ✅ Eliminates policy file duplication (two files → one)
- ✅ Aligns reference and deployed policies
- ✅ Simple — removes code rather than adding it
- ❌ Widens `ListBucket` from prefix-scoped to bucket-wide (but see mitigations above)

### Option B: Alternative condition operator

- ✅ Would preserve prefix scoping if it worked
- ❌ Cannot work — `s3:prefix` is structurally absent during `GetObject`'s implicit `ListBucket` check; no IAM condition operator changes this
- ❌ Would give a false sense of scoping while remaining a no-op

### Option C: HeadObject permission

- ✅ Would be narrower than `ListBucket`
- ❌ Does not solve the problem — S3's 404-vs-403 decision is specifically gated on `s3:ListBucket`, not `s3:HeadObject` (per AWS documentation)
- ❌ Would require Lambda code changes to add explicit `HeadObject` calls before each `GetObject`

## Implementation notes

- `lambda/iam/bggProxy-inline.json`: removed the `Condition.StringLike` block from the `ListBucketForExistenceChecks` statement.
- `terraform/envs/prod/iam-policies/bggProxy-S3Access.json`: new consolidated policy file replacing `bggProxy-S3CollectionAccess.json` and `bggProxy-S3ProfileAccess.json`.
- `terraform/envs/prod/iam.tf`: replaced two `aws_iam_role_policy` resources (`bggProxy_collection`, `bggProxy_profile`) with one (`bggProxy_s3`).
- `tests/iamPolicies.test.js`: 7 tests verify both policy files grant the correct actions, assert `ListBucket` is unconditional, and assert the two files are identical.
- `docs/iam-audit.md`: updated to reflect the consolidated policy.

## Links

- [Issue #124](https://github.com/jaetill/game-night-pwa/issues/124) — `s3:prefix` condition ineffective in `GetObject` evaluation context
- [Issue #133](https://github.com/jaetill/game-night-pwa/issues/133) — wire bggProxy IAM reference policy into Terraform
- [PR #123](https://github.com/jaetill/game-night-pwa/pulls/123) — original P1 fix that introduced the (broken) condition
- [AWS docs: ListBucket and error responses](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html) — documents that `s3:ListBucket` controls 404-vs-403 for missing keys
- [ADR-0003](./0003-security-hardening-low-findings.md) — prior security hardening ADR
