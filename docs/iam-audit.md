# Game Night PWA IAM Audit

**Date:** 2026-04-12
**Auditor:** Jason + Claude
**Scope:** All 8 Lambda execution roles

## Current State

Unlike meal-planner (which shared a single role), game-night already has
per-function IAM roles. This is good baseline hygiene.

### Role Inventory

| # | Role | Lambda(s) | Purpose |
|---|------|-----------|---------|
| 1 | `nudge-lambda-role` | nudgeNonResponders | Send invite/nudge emails |
| 2 | `bggProxy-role-4m5m0lfj` | bggProxy | BGG proxy + profile/collection CRUD |
| 3 | `GeneratePresignedGetUrl-role-vghochhj` | GeneratePresignedGetUrl | Presigned download URLs |
| 4 | `GeneratePresignedPost-role-1hw3dtet` | GeneratePresignedPost | Upload gameNights.json + invite emails |
| 5 | `createEvent-lambda-role` | createEvent | Create game night events |
| 6 | `searchGames-lambda-role` | searchGames | Search BGG collection |
| 7 | `groups-lambda-role` | groups | Manage invitation groups |
| 8 | `apiKeyAuthorizer-lambda-role` | apiKeyAuthorizer | API key auth via SSM |

---

## Per-Role Analysis

### 1. `nudge-lambda-role` (nudgeNonResponders)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole` (AWS-managed, `logs:*` on `Resource: *`)
- Inline `nudge-inline`:
  ```json
  { "Action": "s3:GetObject", "Resource": "arn:aws:s3:::jaetill-game-nights/*" }
  { "Action": "cognito-idp:AdminGetUser", "Resource": "arn:aws:cognito-idp:us-east-2:214599503944:userpool/us-east-2_xneeJzaDJ" }
  ```

**Code uses:**
- `s3:GetObject` on `gameNights.json` only
- `cognito-idp:AdminGetUser` on the user pool

**Findings:**
- S3 resource is `/*` (all objects) but code only reads `gameNights.json` -- could
  be tightened to `gameNights.json` specifically
- CloudWatch logging uses the AWS-managed `AWSLambdaBasicExecutionRole` which
  grants `logs:*` on `Resource: *` -- overly broad but functional (see F3)

---

### 2. `bggProxy-role-4m5m0lfj` (bggProxy)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole-23457392-...` (custom, scoped to `/aws/lambda/bggProxy`)
- Inline `S3Access` (`terraform/envs/prod/iam-policies/bggProxy-S3Access.json`):
  ```json
  { "Sid": "ReadWriteCollections", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::jaetill-game-nights/collections/*" }
  { "Sid": "ReadWriteProfiles",    "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::jaetill-game-nights/profiles/*" }
  { "Sid": "ListBucketForExistenceChecks", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::jaetill-game-nights" }
  ```

**Code uses:**
- `s3:GetObject` on `collections/{userId}.json` and `profiles/{userId}.json`
- `s3:PutObject` on `collections/{userId}.json` and `profiles/{userId}.json`
- `s3:ListBucket` — unconditional, allows S3 to return `NoSuchKey` instead of `AccessDenied` for missing keys (issue #124)

**Findings:**
- Permissions match code exactly. Well scoped. No issues.
- CloudWatch logging properly scoped to its own log group. Good.

---

### 3. `GeneratePresignedGetUrl-role-vghochhj` (GeneratePresignedGetUrl)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole-334872a5-...` (custom, scoped to `/aws/lambda/GeneratePresignedGetUrl`)
- Inline `AllowGetGameNightsJson`:
  ```json
  { "Action": "s3:GetObject", "Resource": "arn:aws:s3:::jaetill-game-nights/gameNights.json" }
  ```

**Code uses:**
- `s3:GetObject` via presigned URL for `gameNights.json` AND `collections/*`
  (code has `ALLOWED = ['gameNights.json', 'collections/']` and accepts any key
  matching those prefixes)

**Findings:**
- **F1 (High): Missing S3 permission for collections.** The Lambda code generates
  presigned GET URLs for `collections/{userId}.json` but the IAM policy only allows
  `s3:GetObject` on `gameNights.json`. Presigned URLs for collections will fail
  with AccessDenied at download time. This is a functional bug.

---

### 4. `GeneratePresignedPost-role-1hw3dtet` (GeneratePresignedPost)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole-499b99fb-...` (custom, scoped to `/aws/lambda/GeneratePresignedPost`)
- Inline `AllowPutObjectToGameNights`:
  ```json
  { "Action": ["s3:PutObject", "s3:GetObject"], "Resource": "arn:aws:s3:::jaetill-game-nights/gameNights.json" }
  ```
- Inline `SESSendEmail`:
  ```json
  { "Action": "ses:SendEmail", "Resource": "*", "Condition": { "StringEquals": { "ses:FromAddress": "noreply@jaetill.com" } } }
  ```

**Code uses:**
- `s3:GetObject` on `gameNights.json` and `profiles/{hostUserId}.json`
- `s3:PutObject` on `gameNights.json`
- Does NOT use SES -- sends email via Postmark HTTP API (not AWS SES)

**Findings:**
- **F2 (High): Missing S3 permission for profiles.** Code reads
  `profiles/{hostUserId}.json` to get the host display name for invite emails,
  but the IAM policy only covers `gameNights.json`. The `getHostProfile()` call
  will silently fail (caught error), degrading invite email quality.
- **F3 (Low): Unused SES permission.** The `SESSendEmail` inline policy is a
  leftover -- the function uses Postmark, not SES. This is dead permission that
  expands the blast radius.

---

### 5. `createEvent-lambda-role` (createEvent)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole` (AWS-managed, `logs:*` on `Resource: *`)
- Inline `s3-access`:
  ```json
  { "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::jaetill-game-nights/gameNights.json" }
  ```

**Code uses:**
- `s3:GetObject` on `gameNights.json`
- `s3:PutObject` on `gameNights.json`

**Findings:**
- S3 permissions match exactly. Well scoped.
- CloudWatch logging uses the AWS-managed policy (`Resource: *`) -- see F4.

---

### 6. `searchGames-lambda-role` (searchGames)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole` (AWS-managed, `logs:*` on `Resource: *`)
- Inline `s3-access`:
  ```json
  { "Action": "s3:GetObject", "Resource": "arn:aws:s3:::jaetill-game-nights/collections/*" }
  ```

**Code uses:**
- `s3:GetObject` on `collections/{userId}.json`

**Findings:**
- S3 permissions match exactly. Well scoped.
- CloudWatch logging uses the AWS-managed policy (`Resource: *`) -- see F4.

---

### 7. `groups-lambda-role` (groups)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole` (AWS-managed, `logs:*` on `Resource: *`)
- Inline `s3-access`:
  ```json
  { "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::jaetill-game-nights/profiles/*" }
  ```

**Code uses:**
- `s3:GetObject` on `profiles/{userId}.json`
- `s3:PutObject` on `profiles/{userId}.json`

**Findings:**
- S3 permissions match exactly. Well scoped.
- CloudWatch logging uses the AWS-managed policy (`Resource: *`) -- see F4.

---

### 8. `apiKeyAuthorizer-lambda-role` (apiKeyAuthorizer)

**Policies:**
- Managed: `AWSLambdaBasicExecutionRole` (AWS-managed, `logs:*` on `Resource: *`)
- Inline `ssm-access`:
  ```json
  { "Action": "ssm:GetParameter", "Resource": "arn:aws:ssm:us-east-2:214599503944:parameter/game-night/api-keys/*" }
  ```

**Code uses:**
- `ssm:GetParameter` with `WithDecryption: true` on `/game-night/api-keys/{key}`

**Findings:**
- SSM permission matches exactly. Well scoped.
- CloudWatch logging uses the AWS-managed policy (`Resource: *`) -- see F4.

---

## Findings Summary

### F1: GeneratePresignedGetUrl missing collections/* permission (High)
The Lambda generates presigned URLs for both `gameNights.json` and
`collections/{userId}.json`, but the IAM role only allows `s3:GetObject` on
`gameNights.json`. Presigned URLs for collection downloads will fail with
AccessDenied. This is a functional bug causing broken BGG collection reads
via presigned URLs.

### F2: GeneratePresignedPost missing profiles/* read permission (High)
The Lambda reads `profiles/{hostUserId}.json` to build invite emails, but the
IAM role only covers `gameNights.json`. The `getHostProfile()` call silently
fails, meaning invite emails show the raw userId instead of the host's display
name.

### F3: GeneratePresignedPost has unused SES permission (Low)
The `SESSendEmail` inline policy is a leftover from before the migration to
Postmark. The function makes zero SES API calls. This dead permission needlessly
expands the blast radius.

### F4: Five roles use the AWS-managed AWSLambdaBasicExecutionRole (Low)
The AWS-managed `AWSLambdaBasicExecutionRole` grants `logs:CreateLogGroup`,
`logs:CreateLogStream`, and `logs:PutLogEvents` on `Resource: *`. This means
these 5 Lambdas can write logs to ANY log group in the account, not just their
own. The other 3 roles (bggProxy, GeneratePresignedGetUrl, GeneratePresignedPost)
correctly use custom logging policies scoped to their specific log groups.

Affected roles: `nudge-lambda-role`, `createEvent-lambda-role`,
`searchGames-lambda-role`, `groups-lambda-role`, `apiKeyAuthorizer-lambda-role`

### F5: nudge-lambda-role S3 resource is overly broad (Low)
The S3 GetObject permission covers `jaetill-game-nights/*` but the code only
reads `gameNights.json`. Could be tightened to just that key.

---

## Recommended Remediations

### R1: Add collections/* to GeneratePresignedGetUrl role (fixes F1)
Add a second statement to the `AllowGetGameNightsJson` inline policy:
```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": [
    "arn:aws:s3:::jaetill-game-nights/gameNights.json",
    "arn:aws:s3:::jaetill-game-nights/collections/*"
  ]
}
```

### R2: Add profiles/* read to GeneratePresignedPost role (fixes F2)
Update the `AllowPutObjectToGameNights` inline policy:
```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": [
    "arn:aws:s3:::jaetill-game-nights/gameNights.json",
    "arn:aws:s3:::jaetill-game-nights/profiles/*"
  ]
},
{
  "Effect": "Allow",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::jaetill-game-nights/gameNights.json"
}
```

### R3: Remove SESSendEmail policy from GeneratePresignedPost role (fixes F3)
Delete the `SESSendEmail` inline policy entirely -- the function uses Postmark,
not SES.

### R4: Replace AWS-managed logging with custom scoped policies (fixes F4)
For each of the 5 affected roles, detach `AWSLambdaBasicExecutionRole` and create
a custom managed policy scoped to that function's log group:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "logs:CreateLogGroup",
      "Resource": "arn:aws:logs:us-east-2:214599503944:*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:us-east-2:214599503944:log-group:/aws/lambda/{functionName}:*"
    }
  ]
}
```

### R5: Tighten nudge-lambda-role S3 scope (fixes F5)
Change S3 resource from `arn:aws:s3:::jaetill-game-nights/*` to
`arn:aws:s3:::jaetill-game-nights/gameNights.json`.

---

## Changes Applied

| # | Change | Status |
|---|--------|--------|
| R1 | Add collections/* to GeneratePresignedGetUrl role | Done |
| R2 | Add profiles/* read to GeneratePresignedPost role | Done |
| R3 | Remove SESSendEmail from GeneratePresignedPost role | Done |
| R4 | Replace AWS-managed logging with scoped policies (5 roles) | Done |
| R5 | Tighten nudge-lambda-role S3 scope | Done |
