# ADR-0017: DynamoDB-backed distributed rate limiting for the feedback endpoint

- **Status:** Proposed
- **Date:** 2026-06-22
- **Deciders:** Jason
- **Tags:** security, new-external-dep, lambda, dynamodb, rate-limiting

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `POST /feedback` endpoint is the only public, unauthenticated route in the API. It is protected by a per-IP rate limiter (10 requests/hour). However, that rate limiter is an in-memory `Map` inside each warm Lambda instance. Because Lambda can scale to multiple concurrent instances, an attacker (or a buggy client) can exceed the intended 10 req/hour limit by having requests land on different instances. Each instance independently tracks its own counters, so the effective limit is `10 × N` where N is the number of warm instances.

The question: how should we replace the per-instance rate limiter with one that is consistent across all Lambda instances?

## Decision Drivers

- **Security.** The public endpoint must enforce a meaningful per-IP rate limit regardless of how many Lambda instances are running.
- **Availability.** Rate limiting infrastructure failures must not break the feedback endpoint — users should still be able to submit feedback.
- **Cost.** The feedback endpoint sees low traffic; the solution should not add meaningful cost.
- **Operational simplicity.** Prefer managed AWS services already in the stack over introducing new infrastructure categories.

## Considered Options

- **Option A: DynamoDB atomic counter with hour-aligned fixed window and fail-open fallback.**
- **Option B: API Gateway request throttling** (usage plans or per-route throttling).
- **Option C: ElastiCache (Redis) or DAX** for a centralized in-memory counter.

## Decision Outcome

Chosen option: **Option A (DynamoDB atomic counter)**, because it provides consistent cross-instance rate limiting with minimal new infrastructure (one PAY_PER_REQUEST table), self-cleaning keys via TTL, and a safe fail-open fallback to the existing in-memory limiter.

## Consequences

### Positive

- Rate limiting is now consistent across all Lambda instances — a single IP is limited to 10 requests per hour regardless of instance count.
- DynamoDB TTL automatically cleans up expired window items with no explicit delete logic or scheduled job.
- Fail-open design: if DynamoDB is temporarily unavailable, the endpoint falls back to the existing per-instance in-memory limiter rather than rejecting all requests.
- PAY_PER_REQUEST billing means zero cost when idle and negligible cost at the feedback endpoint's expected traffic volume (single-digit UpdateItem calls per hour).

### Negative

- New external dependency: `@aws-sdk/client-dynamodb` added to `lambda/package.json`. While the AWS SDK is available in the Lambda Node 22 runtime, explicitly declaring it pulls transitive dependencies (`mnemonist`, `obliterator`, `@aws-sdk/dynamodb-codec`, `@aws-sdk/middleware-endpoint-discovery`, `@aws-sdk/endpoint-cache`) into `node_modules/` and the deployment zip. This increases the cold-start artifact size.
- New AWS resource: a DynamoDB table (`game-night-feedback-rl`) must be provisioned and its ARN referenced in IAM policies. This widens the project's infrastructure footprint.
- Fail-open means a sustained DynamoDB outage degrades rate limiting back to per-instance (the pre-existing behavior), not that rate limiting disappears entirely — but the distributed guarantee is lost during that window.
- The `iac-drift` role gains `dynamodb:DescribeTable`, `dynamodb:DescribeTimeToLive`, `dynamodb:ListTagsOfResource` (scoped to this table) and `dynamodb:ListTables` (unscoped, required by AWS). This is a minor privilege widening for the CI introspection role.

### Neutral

- The `RATE_LIMIT_TABLE` env var gates the feature: when unset, the Lambda uses the in-memory limiter. This allows local development and testing without a DynamoDB table.
- The hour-aligned fixed window means the worst case is 20 requests in a rolling hour (10 at minute 59, 10 at minute 0 of the next window). This is acceptable for a feedback endpoint.

## Pros and Cons of the Options

### Option A: DynamoDB atomic counter (chosen)

- ✅ Consistent rate limiting across all Lambda instances via atomic `ADD` operation
- ✅ Self-cleaning via TTL — no maintenance
- ✅ PAY_PER_REQUEST — zero cost when idle, pennies at expected volume
- ✅ Fail-open fallback preserves endpoint availability
- ✅ Already in the AWS SDK (no new service category — S3, Cognito, SSM, Secrets Manager already used)
- ❌ Adds `@aws-sdk/client-dynamodb` to deployment zip (cold-start size increase)
- ❌ Fixed window allows up to 2× burst at window boundaries

### Option B: API Gateway request throttling

- ✅ No Lambda code changes — configured at the infrastructure layer
- ✅ No new dependency
- ❌ API Gateway throttling is per-route, not per-IP — cannot enforce per-source limits without a usage plan + API keys, which contradicts the endpoint being public/unauthenticated
- ❌ API Gateway's built-in throttling returns 429 with an opaque body, losing the structured JSON error format the client expects

### Option C: ElastiCache / Redis

- ✅ Sub-millisecond latency for counter operations
- ✅ Precise sliding-window algorithms possible
- ❌ Introduces a new infrastructure category (VPC, subnets, security groups, Redis cluster) — massive operational overhead for a low-traffic endpoint
- ❌ Ongoing cost regardless of traffic (~$15/month minimum for a single-node cache)
- ❌ Requires Lambda to be VPC-attached, adding cold-start latency and networking complexity

## Implementation notes

- `lambda/feedback.js`: new `makeDynamoRateLimiter(dynamoClient)` function uses `UpdateItem` with `ADD #cnt :one` for atomic increment. Partition key encodes IP + hour-aligned window start (`rl#<ip>#<windowStart>`). TTL set to 2× window via `if_not_exists` to avoid overwriting on subsequent requests.
- `lambda/feedback.js`: `createHandler()` resolution order: test-injected `deps.checkRateLimit` → test-injected `deps.dynamoClient` → real DynamoDB client (when `RATE_LIMIT_TABLE` is set) → in-memory fallback.
- `lambda/iam/feedback-inline.json` and `terraform/envs/prod/iam-policies/feedback-inline.json`: grant `dynamodb:UpdateItem` scoped to `arn:aws:dynamodb:us-east-2:*:table/game-night-feedback-rl`.
- `terraform/envs/prod/dynamodb.tf`: new PAY_PER_REQUEST table with TTL enabled on the `ttl` attribute.
- `terraform/envs/prod/lambdas.tf`: adds `RATE_LIMIT_TABLE` env var referencing the table name.
- `terraform/envs/prod/iam.tf`: grants `iac-drift` role `DescribeTable`, `DescribeTimeToLive`, `ListTagsOfResource` (scoped) and `ListTables` (unscoped) for `tofu plan` introspection.
- `tests/feedback.test.js`: 4 new tests covering DynamoDB rate limiting (11th request blocked, per-IP isolation, fallback on DynamoDB error, UpdateItem expression inspection).

## Links

- [PR #252](https://github.com/jaetill/game-night-pwa/pull/252) — implementing PR
- [ADR-0003](./0003-security-hardening-low-findings.md) — prior security hardening ADR
- [Platform ADR-0003](https://github.com/jaetill/agentic-dev-environment/blob/main/docs/adr/0003-ci-cd-ai-authority.md) — ADR-gated change categories (new-external-dep, security-relevant)
