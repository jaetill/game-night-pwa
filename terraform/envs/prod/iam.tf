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
resource "aws_iam_role_policy" "bggProxy_collection" {
  name   = "S3CollectionAccess"
  role   = aws_iam_role.bggProxy.id
  policy = file("${path.module}/iam-policies/bggProxy-S3CollectionAccess.json")
}

resource "aws_iam_role_policy" "bggProxy_profile" {
  name   = "S3ProfileAccess"
  role   = aws_iam_role.bggProxy.id
  policy = file("${path.module}/iam-policies/bggProxy-S3ProfileAccess.json")
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
# infrastructure drift. Strictly scoped:
#   - ReadOnlyAccess (AWS-managed) so refresh can introspect every resource
#     type we manage without enumerating actions per service.
#   - S3 + DynamoDB scoped to ONLY the tfstate bucket + lock table.
# The deploy role (above) is NOT reused — separating drift-detection from
# deploy keeps the deploy role's blast radius minimal even if compromised.
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
      values   = ["repo:jaetill/game-night-pwa:ref:refs/heads/master"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "iac_drift_read_only" {
  role       = aws_iam_role.iac_drift.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
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
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]
    # tofu plan needs Put/Delete for the brief lock during refresh. Could be
    # avoided with `tofu plan -lock=false` but that risks a concurrent apply
    # racing the plan. Keep the lock; scope dynamodb to the one table.
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
    sid    = "S3DeployArtifacts"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::jaetill-game-nights",
      "arn:aws:s3:::jaetill-game-nights/*",
    ]
  }

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
