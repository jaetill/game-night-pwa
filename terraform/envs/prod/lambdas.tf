# 9 Lambda functions making up the game-night-pwa backend.
#
# Each resource:
#   - References its execution role from iam.tf
#   - Merges the shared `local.observability_env` with function-specific env vars
#   - Uses `lifecycle.ignore_changes` for code attributes (manual deploys via
#     `aws lambda update-function-code`; Terraform owns config only)
#   - Uses `placeholder.zip` as a stub for the Lambda schema's required
#     code-source attribute. The placeholder is never actually deployed
#     because of the lifecycle ignore_changes block.

# â”€â”€ apiKeyAuthorizer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "apiKeyAuthorizer" {
  function_name    = "apiKeyAuthorizer"
  role             = aws_iam_role.apiKeyAuthorizer.arn
  handler          = "apiKeyAuthorizer.handler"
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  memory_size      = 128
  timeout          = 10

  filename         = "${path.module}/placeholder.zip"

  environment {
    variables = local.observability_env
  }

  ephemeral_storage {
    size = 512
  }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/apiKeyAuthorizer"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ bggProxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "bggProxy" {
  function_name = "bggProxy"
  role          = aws_iam_role.bggProxy.arn
  handler       = "bggProxy.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 128
  timeout       = 15

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = local.observability_env
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/bggProxy"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ createEvent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "createEvent" {
  function_name = "createEvent"
  role          = aws_iam_role.createEvent.arn
  handler       = "createEvent.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 128
  timeout       = 3

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = merge(local.observability_env, {
      S3_BUCKET = "jaetill-game-nights"
    })
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/createEvent"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "feedback" {
  function_name = "feedback"
  role          = aws_iam_role.feedback.arn
  handler       = "feedback.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 256
  timeout       = 10
  description   = "User feedback endpoint -> GitHub Issue (Standard 11). Phase 7."

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = merge(local.observability_env, {
      GITHUB_REPO_OWNER = "jaetill"
      GITHUB_REPO_NAME  = "game-night-pwa"
      GITHUB_SECRET_ID  = "game-night/prod/github-token"
    })
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/feedback"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ GeneratePresignedGetUrl â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "GeneratePresignedGetUrl" {
  function_name = "GeneratePresignedGetUrl"
  role          = aws_iam_role.GeneratePresignedGetUrl.arn
  handler       = "GeneratePresignedGetUrl.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 128
  timeout       = 3

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = local.observability_env
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/GeneratePresignedGetUrl"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ GeneratePresignedPost â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "GeneratePresignedPost" {
  function_name = "GeneratePresignedPost"
  role          = aws_iam_role.GeneratePresignedPost.arn
  handler       = "GeneratePresignedPost.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 128
  timeout       = 3

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = local.observability_env
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/GeneratePresignedPost"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "groups" {
  function_name = "groups"
  role          = aws_iam_role.groups.arn
  handler       = "groups.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 128
  timeout       = 3

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = merge(local.observability_env, {
      S3_BUCKET = "jaetill-game-nights"
    })
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/groups"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ nudgeNonResponders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "nudgeNonResponders" {
  function_name = "nudgeNonResponders"
  role          = aws_iam_role.nudge.arn
  handler       = "nudge.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 128
  timeout       = 30

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = merge(local.observability_env, {
      S3_BUCKET            = "jaetill-game-nights"
      APP_URL              = "https://gamenights.jaetill.com"
      COGNITO_USER_POOL_ID = "us-east-2_xneeJzaDJ"
      FROM_EMAIL           = "jason@jaetill.com"
    })
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/nudgeNonResponders"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# â”€â”€ searchGames â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
resource "aws_lambda_function" "searchGames" {
  function_name = "searchGames"
  role          = aws_iam_role.searchGames.arn
  handler       = "searchGames.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  memory_size   = 128
  timeout       = 3

  filename = "${path.module}/placeholder.zip"

  environment {
    variables = merge(local.observability_env, {
      S3_BUCKET = "jaetill-game-nights"
    })
  }

  ephemeral_storage { size = 512 }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/searchGames"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}
