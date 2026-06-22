# IAM execution roles for the 9 Lambda functions + the GitHub Actions deploy
# role. Inline policies are imported alongside the role; AWS-console-generated
# managed policies (the auto-named AWSLambdaBasicExecutionRole-* policies on
# the bggProxy / GeneratePresigned* roles) are imported as `aws_iam_policy`
# resources to preserve their existing names.
#
# The trust policies for execution roles all share the same shape: Lambda
# service principal. The GitHub deploy role uses an OIDC federated principal.

# ── Standard Lambda assume-role trust policy ────────────────────────────────
data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ════════════════════════════════════════════════════════════════════════════
# Execution roles, one per Lambda
# ════════════════════════════════════════════════════════════════════════════

resource "aws_iam_role" "apiKeyAuthorizer" {
  name               = "apiKeyAuthorizer-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "bggProxy" {
  name               = "bggProxy-role-4m5m0lfj"
  path               = "/service-role/"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "createEvent" {
  name               = "createEvent-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "feedback" {
  name               = "feedback-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  description        = "Execution role for the feedback Lambda (Standard 11)"
}

resource "aws_iam_role" "GeneratePresignedGetUrl" {
  name               = "GeneratePresignedGetUrl-role-vghochhj"
  path               = "/service-role/"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "GeneratePresignedPost" {
  name               = "GeneratePresignedPost-role-1hw3dtet"
  path               = "/service-role/"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "groups" {
  name               = "groups-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "nudge" {
  name               = "nudge-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role" "searchGames" {
  name               = "searchGames-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# ════════════════════════════════════════════════════════════════════════════
# game-night-github-deploy — used by the deploy.yml workflow via OIDC
# Trust policy is fetched live (refines per-branch claims).
# ════════════════════════════════════════════════════════════════════════════
resource "aws_iam_role" "github_deploy" {
  name               = "game-night-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust.json
  description        = "GitHub Actions OIDC role for game-night-pwa CI/CD"
}

# Trust policy as currently deployed. Note: the sub-claim is pinned to the
# master branch via StringEquals — strictest possible scoping. If a future
# workflow needs to assume this role from another ref (e.g. a release tag),
# add an additional StringEquals or relax to StringLike then.
data "aws_iam_policy_document" "github_deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["arn:aws:iam::${var.aws_account_id}:oidc-provider/token.actions.githubusercontent.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:jaetill/game-night-pwa:ref:refs/heads/master"]
    }
  }
}

# ════════════════════════════════════════════════════════════════════════════
# Inline policies — imported as `aws_iam_role_policy` resources keyed by
# (role_name, policy_name). Policy documents will be back-filled from AWS
# during `tofu plan` iteration.
# ════════════════════════════════════════════════════════════════════════════

# ── apiKeyAuthorizer ────────────────────────────────────────────────────────
resource "aws_iam_role_policy" "apiKeyAuthorizer_ssm" {
  name   = "ssm-access"
  role   = aws_iam_role.apiKeyAuthorizer.id
  policy = file("${path.module}/iam-policies/apiKeyAuthorizer-ssm-access.json")
}

# ── bggProxy ────────────────────────────────────────────────────────────────
# s3:ListBucket is intentionally unconditional. A StringLike s3:prefix
# condition is a no-op when S3 evaluates a GetObject request for a missing
# key: s3:prefix is absent in that context, so StringLike evaluates to false
# and the Allow statement never fires — S3 continues to return AccessDenied
# instead of NoSuchKey (see #124). Accepted risk: a compromised bggProxy
# role can enumerate bucket keys (Cognito username enumeration). Object
# contents remain gated by the scoped GetObject/PutObject statements.
# Tradeoff analysis: #146.
resource "aws_iam_role_policy" "bggProxy_s3" {
  name   = "S3Access"
  role   = aws_iam_role.bggProxy.id
  policy = file("${path.module}/iam-policies/bggProxy-S3Access.json")
}

# ── createEvent ─────────────────────────────────────────────────────────────
resource "aws_iam_role_policy" "createEvent_logs" {
  name   = "createEvent-lambda-role-logs"
  role   = aws_iam_role.createEvent.id
  policy = file("${path.module}/iam-policies/createEvent-logs.json")
}

resource "aws_iam_role_policy" "createEvent_s3" {
  name   = "s3-access"
  role   = aws_iam_role.createEvent.id
  policy = file("${path.module}/iam-policies/createEvent-s3-access.json")
}

# ── feedback ────────────────────────────────────────────────────────────────
resource "aws_iam_role_policy" "feedback_inline" {
  name   = "feedback-inline"
  role   = aws_iam_role.feedback.id
  policy = file("${path.module}/iam-policies/feedback-inline.json")
}

# ── groups ──────────────────────────────────────────────────────────────────
resource "aws_iam_role_policy" "groups_logs" {
  name   = "groups-lambda-role-logs"
  role   = aws_iam_role.groups.id
  policy = file("${path.module}/iam-policies/groups-logs.json")
}

resource "aws_iam_role_policy" "groups_s3" {
  name   = "s3-access"
  role   = aws_iam_role.groups.id
  policy = file("${path.module}/iam-policies/groups-s3-access.json")
}

# ── nudge ───────────────────────────────────────────────────────────────────
resource "aws_iam_role_policy" "nudge_inline" {
  name   = "nudge-inline"
  role   = aws_iam_role.nudge.id
  policy = file("${path.module}/iam-policies/nudge-inline.json")
}

resource "aws_iam_role_policy" "nudge_logs" {
  name   = "nudge-lambda-role-logs"
  role   = aws_iam_role.nudge.id
  policy = file("${path.module}/iam-policies/nudge-logs.json")
}

resource "aws_iam_role_policy" "nudge_secrets" {
  name   = "shared-secrets-access"
  role   = aws_iam_role.nudge.id
  policy = file("${path.module}/iam-policies/nudge-shared-secrets-access.json")
}

# ── searchGames ─────────────────────────────────────────────────────────────
resource "aws_iam_role_policy" "searchGames_logs" {
  name   = "searchGames-lambda-role-logs"
  role   = aws_iam_role.searchGames.id
  policy = file("${path.module}/iam-policies/searchGames-logs.json")
}

resource "aws_iam_role_policy" "searchGames_s3" {
  name   = "s3-access"
  role   = aws_iam_role.searchGames.id
  policy = file("${path.module}/iam-policies/searchGames-s3-access.json")
}

# ════════════════════════════════════════════════════════════════════════════
# game-night-iac-drift — read-only role for the claude-drift-detector
# workflow. Used to run `tofu plan` against terraform/envs/prod and detect
# infrastructure drift.
#
# CURRENT SCOPE (as of 2026-06-12, issue #48):
#   - ReadOnlyAccess (AWS-managed) REMOVED. Replaced by the narrow inline
#     `iac_drift_introspect` policy below (per-service Describe/Get/List
#     only). The `iac_drift_tfstate` inline policy still grants object reads
#     on the tfstate bucket + GetItem on the DynamoDB lock table.
#   - Intentional omissions (secret values, PII, object reads outside
#     tfstate) are listed in the `iac_drift_introspect` comment below.
#
# HISTORY: PR #59 first attempted this narrowing and hung for >13 min.
# Root cause (identified 2026-06-05): the drift-detector workflow was
# missing `-input=false` AND the `TF_VAR_grafana_external_id` secret,
# causing `tofu plan` to block on an interactive prompt rather than fail
# on a missing permission. Both were fixed in PR #181. This second attempt
# should succeed cleanly; the iac-guard CI job on this PR provides
# confirmation.
# ════════════════════════════════════════════════════════════════════════════
resource "aws_iam_role" "iac_drift" {
  name               = "game-night-iac-drift"
  assume_role_policy = data.aws_iam_policy_document.iac_drift_trust.json
  description        = "Read-only OIDC role for tofu plan drift detection"
}

data "aws_iam_policy_document" "iac_drift_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["arn:aws:iam::${var.aws_account_id}:oidc-provider/token.actions.githubusercontent.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # master: the scheduled drift detector. pull_request: the ADR-0035
      # iac-additive-guard caller (.github/workflows/iac-guard.yml), which
      # plans PR branches before the fleet auto-merge gate will let a
      # scope:iac PR auto-merge. Read-only role — both contexts only plan.
      values = [
        "repo:jaetill/game-night-pwa:ref:refs/heads/master",
        "repo:jaetill/game-night-pwa:pull_request",
      ]
    }
  }
}

# Active narrow-scope policy for the drift role (issue #48).
# Grants only the read actions `tofu plan` needs across the services this
# module manages. Intentional omissions (security goals, not gaps):
#   - iam:GetAccountAuthorizationDetails (bulk account-wide IAM dump —
#     top-tier recon action; not needed for tofu plan per-resource reads)
#   - secretsmanager:GetSecretValue (Postmark + GitHub PAT)
#   - ssm:GetParameter / GetParameters / GetParameterHistory
#   - cognito-idp:ListUsers / AdminGetUser (PII — shared pool)
#   - s3:GetObject (outside tfstate)
#   - s3:ListBucket — data-plane object enumeration; iac_drift_tfstate
#     already grants it scoped to the tfstate bucket ARN
# The Cognito statement is wildcard-free to prevent future wildcard
# expansion from accidentally re-introducing ListUsers.
data "aws_iam_policy_document" "iac_drift_introspect" {
  statement {
    sid    = "IAMRead"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRoles",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicies",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "LambdaRead"
    effect = "Allow"
    actions = [
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetPolicy",
      "lambda:ListFunctions",
      "lambda:ListAliases",
      "lambda:ListVersionsByFunction",
      "lambda:ListEventSourceMappings",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "ApiGwRead"
    effect    = "Allow"
    actions   = ["apigateway:GET"]
    resources = ["*"]
  }
  statement {
    # Intentionally excludes cognito-idp:ListUsers (PII — shared pool) and
    # cognito-idp:AdminGetUser. Wildcard-free to prevent future wild-card
    # expansion from re-introducing either action.
    sid    = "CognitoMetadataRead"
    effect = "Allow"
    actions = [
      "cognito-idp:DescribeUserPool",
      "cognito-idp:DescribeUserPoolClient",
      "cognito-idp:DescribeUserPoolDomain",
      "cognito-idp:ListUserPools",
      "cognito-idp:ListUserPoolClients",
      "cognito-idp:ListGroups",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "S3MetadataRead"
    effect = "Allow"
    actions = [
      "s3:GetBucket*",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls",
      "s3:ListAllMyBuckets",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "SecretsManagerMetadataOnly"
    effect = "Allow"
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:ListSecrets",
      "secretsmanager:GetResourcePolicy",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "SsmMetadataOnly"
    effect = "Allow"
    actions = [
      "ssm:DescribeParameters",
      "ssm:ListTagsForResource",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "CloudWatchRead"
    effect    = "Allow"
    actions   = ["cloudwatch:Describe*", "cloudwatch:List*", "logs:Describe*"]
    resources = ["*"]
  }
  statement {
    sid       = "StsIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "iac_drift_introspect" {
  name   = "introspect"
  role   = aws_iam_role.iac_drift.id
  policy = data.aws_iam_policy_document.iac_drift_introspect.json
}

data "aws_iam_policy_document" "iac_drift_tfstate" {
  statement {
    sid    = "TFStateRead"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::jaetill-tfstate",
      "arn:aws:s3:::jaetill-tfstate/*",
    ]
  }

  statement {
    sid    = "TFStateLockRead"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
    ]
    # The drift-detector now runs `tofu plan -lock=false` (per the daily
    # workflow at .github/workflows/claude-drift-detector.yml); it never
    # acquires or releases the DynamoDB state lock, so PutItem/DeleteItem
    # are unnecessary. GetItem is retained for diagnostics (e.g. confirming
    # the lock table exists during init). The lock pattern was rejected
    # because cancelled workflow runs were orphaning locks and blocking
    # subsequent plans; tolerating the small false-positive risk of a
    # concurrent-apply race is the trade-off.
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:${var.aws_account_id}:table/terraform-state-lock",
    ]
  }
}

resource "aws_iam_role_policy" "iac_drift_tfstate" {
  name   = "tfstate-access"
  role   = aws_iam_role.iac_drift.id
  policy = data.aws_iam_policy_document.iac_drift_tfstate.json
}

# ── game-night-github-deploy ────────────────────────────────────────────────
# The deploy role needs lambda:UpdateFunctionCode on the 9 game-night
# Lambdas, NOT on every Lambda in the account. The AWS account is shared
# with meal-planner and jaetill-portal — wildcarding to `function:*` (the
# original setting) meant a compromised GitHub Actions OIDC token could
# overwrite Lambda code in those other applications. The list below is
# rendered from the aws_lambda_function resources we already manage, so it
# stays in sync automatically when functions are added or removed.
data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid    = "LambdaUpdateGameNightOnly"
    effect = "Allow"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:GetFunction",
    ]
    resources = [
      aws_lambda_function.apiKeyAuthorizer.arn,
      aws_lambda_function.bggProxy.arn,
      aws_lambda_function.createEvent.arn,
      aws_lambda_function.feedback.arn,
      aws_lambda_function.GeneratePresignedGetUrl.arn,
      aws_lambda_function.GeneratePresignedPost.arn,
      aws_lambda_function.groups.arn,
      aws_lambda_function.nudgeNonResponders.arn,
      aws_lambda_function.searchGames.arn,
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

# ════════════════════════════════════════════════════════════════════════════
# Logs policies for bggProxy / GeneratePresignedGetUrl / GeneratePresignedPost.
#
# These were originally console-generated AWSLambdaBasicExecutionRole-* managed
# policies (with auto-generated UUID-suffixed names). Refactored to inline
# policies for naming consistency with the other 6 lambda roles, which all use
# inline `*-logs` policies.
#
# Terraform creates the new inline policies before destroying the old managed
# policies + attachments, so the role always has logs permissions throughout
# the apply (no permission gap).
# ════════════════════════════════════════════════════════════════════════════

resource "aws_iam_role_policy" "bggProxy_logs" {
  name   = "bggProxy-logs"
  role   = aws_iam_role.bggProxy.id
  policy = file("${path.module}/iam-policies/bggProxy-logs.json")
}

resource "aws_iam_role_policy" "GeneratePresignedGetUrl_logs" {
  name   = "GeneratePresignedGetUrl-logs"
  role   = aws_iam_role.GeneratePresignedGetUrl.id
  policy = file("${path.module}/iam-policies/GeneratePresignedGetUrl-logs.json")
}

resource "aws_iam_role_policy" "GeneratePresignedPost_logs" {
  name   = "GeneratePresignedPost-logs"
  role   = aws_iam_role.GeneratePresignedPost.id
  policy = file("${path.module}/iam-policies/GeneratePresignedPost-logs.json")
}
