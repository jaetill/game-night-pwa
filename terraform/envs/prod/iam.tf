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
# infrastructure drift.
#
# CURRENT SCOPE (as of 2026-05-13):
#   - ReadOnlyAccess (AWS-managed) attached. This is wider than tofu plan
#     strictly needs and is the subject of OPEN ISSUE #48 (security-review
#     proposed narrowing to per-service inline Describe/Get/List actions).
#   - The inline `iac_drift_introspect` policy below ALSO attached. It is
#     a strict subset of ReadOnlyAccess so the role's effective permissions
#     equal ReadOnlyAccess. The inline policy is retained as scaffolding
#     for the next attempt to narrow this role.
#   - S3 + DynamoDB scoped to ONLY the tfstate bucket + lock table
#     (separate inline policy, below).
#
# HOW WE GOT HERE: PR #59 closed #48 by replacing the ReadOnlyAccess
# attachment with the narrow inline. That broke the drift-detector
# workflow — `tofu plan` hung for >13 minutes on the workflow runner,
# most likely because the narrow policy was missing a permission tofu's
# refresh loop needs for one of our resource types, and the deny was
# retried indefinitely instead of surfacing. PR #76 reverted by
# re-attaching ReadOnlyAccess (this commit). Issue #48 reopened with
# instructions for the next narrowing attempt (per-resource API call
# audit, sandboxed pre-merge test).
#
# RISK ACCEPTED (until #48 lands cleanly): a compromised drift-detector
# runner could exfiltrate S3 object contents, Cognito user metadata,
# SSM parameter names (not encrypted values — `kms:Decrypt` is not
# included in ReadOnlyAccess), and Secrets Manager descriptions. The
# trust policy gates assume-role on GitHub OIDC for this repo's master
# ref only, so the attack requires either a malicious PR landing on
# master or a supply-chain compromise of an action used by the workflow.
# The deploy role (above) is still NOT reused — separating drift-detect
# from deploy keeps deploy's blast radius minimal regardless.
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

# Scaffolding for the future re-narrowing attempt (see header comment).
# This data block + the role_policy resource below stay attached to the
# role alongside the ReadOnlyAccess managed policy — but ReadOnlyAccess
# is a strict superset, so this inline contributes nothing to the role's
# effective permissions today. Leaving it in place means the next
# narrowing attempt only needs to remove the ReadOnlyAccess attachment
# (and ideally add the missing permissions that caused the 2026-05-13
# hang). Per-action commentary describing INTENDED future omissions:
#   - secretsmanager:GetSecretValue (Postmark + GitHub PAT)
#   - ssm:GetParameter / GetParameters / GetParameterHistory
#   - cognito-idp:AdminGetUser
#   - s3:GetObject (outside tfstate)
# These are NOT actually omitted today — ReadOnlyAccess grants all of
# them — but capture the policy's design intent for the future fix.
data "aws_iam_policy_document" "iac_drift_introspect" {
  statement {
    sid       = "IAMRead"
    effect    = "Allow"
    actions   = ["iam:Get*", "iam:List*"]
    resources = ["*"]
  }
  statement {
    sid       = "LambdaRead"
    effect    = "Allow"
    actions   = ["lambda:Get*", "lambda:List*"]
    resources = ["*"]
  }
  statement {
    sid       = "ApiGwRead"
    effect    = "Allow"
    actions   = ["apigateway:GET"]
    resources = ["*"]
  }
  statement {
    sid       = "CognitoMetadataRead"
    effect    = "Allow"
    actions   = ["cognito-idp:Describe*", "cognito-idp:List*"]
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
      "s3:ListBucket",
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
