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

# ── game-night-github-deploy ────────────────────────────────────────────────
resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = file("${path.module}/iam-policies/github-deploy.json")
}

# ════════════════════════════════════════════════════════════════════════════
# AWS-console-generated managed policies attached to bggProxy /
# GeneratePresignedGetUrl / GeneratePresignedPost. Imported as customer-
# managed policies to preserve names; can be replaced with inline policies
# in a future cleanup pass once the retrofit is stable.
# ════════════════════════════════════════════════════════════════════════════

resource "aws_iam_policy" "bggProxy_basic_exec" {
  name   = "AWSLambdaBasicExecutionRole-23457392-080c-49c2-849d-db688eae1193"
  path   = "/service-role/"
  policy = file("${path.module}/iam-policies/managed-bggProxy-basic-exec.json")
  # description is unset on the live policy; setting it forces replacement.
}

resource "aws_iam_role_policy_attachment" "bggProxy_basic_exec" {
  role       = aws_iam_role.bggProxy.name
  policy_arn = aws_iam_policy.bggProxy_basic_exec.arn
}

resource "aws_iam_policy" "GeneratePresignedGetUrl_basic_exec" {
  name   = "AWSLambdaBasicExecutionRole-334872a5-7c1a-48f2-bc15-8fb429e8188e"
  path   = "/service-role/"
  policy = file("${path.module}/iam-policies/managed-GeneratePresignedGetUrl-basic-exec.json")
}

resource "aws_iam_role_policy_attachment" "GeneratePresignedGetUrl_basic_exec" {
  role       = aws_iam_role.GeneratePresignedGetUrl.name
  policy_arn = aws_iam_policy.GeneratePresignedGetUrl_basic_exec.arn
}

resource "aws_iam_policy" "GeneratePresignedPost_basic_exec" {
  name   = "AWSLambdaBasicExecutionRole-499b99fb-9404-4328-a2c2-d0c8ce501ce8"
  path   = "/service-role/"
  policy = file("${path.module}/iam-policies/managed-GeneratePresignedPost-basic-exec.json")
}

resource "aws_iam_role_policy_attachment" "GeneratePresignedPost_basic_exec" {
  role       = aws_iam_role.GeneratePresignedPost.name
  policy_arn = aws_iam_policy.GeneratePresignedPost_basic_exec.arn
}
