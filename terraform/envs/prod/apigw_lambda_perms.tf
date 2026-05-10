# Lambda permissions allowing API Gateway to invoke each function.
#
# Statement IDs are a mix of:
#   - AWS-auto-generated UUIDs (older permissions added via console)
#   - Hand-named statement IDs (later permissions added via `aws lambda
#     add-permission --statement-id <name>`)
#
# Source ARN patterns vary too — some target a specific HTTP method
# (`*/POST/feedback`), others use wildcards (`*/POST/*`). Preserved as-is.
#
# Notable: bggProxy has 5 statements including one orphan from a deprecated
# API (lolf2568d1) — kept for retrofit fidelity. Can be cleaned up in a
# later commit.

# ── apiKeyAuthorizer (1 statement, used by the authorizer itself) ──────────
resource "aws_lambda_permission" "apigw_authorizer" {
  statement_id  = "apigw-authorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.apiKeyAuthorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/authorizers/*"
}

# ── bggProxy (5 statements) ────────────────────────────────────────────────
resource "aws_lambda_permission" "bggProxy_collection_legacy" {
  # Orphan from a deprecated API id (lolf2568d1) — kept for state fidelity.
  statement_id  = "aa8e99d1-bc7b-5258-b659-89fcd23187bb"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bggProxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:lolf2568d1/*/*/bgg/collection"
}

resource "aws_lambda_permission" "bggProxy_get" {
  statement_id  = "allow-presigned-api-invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bggProxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/GET/bgg"
}

resource "aws_lambda_permission" "bggProxy_post" {
  statement_id  = "allow-post-bgg"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bggProxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/POST/bgg"
}

resource "aws_lambda_permission" "bggProxy_options" {
  statement_id  = "allow-options-bgg"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bggProxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/OPTIONS/bgg"
}

resource "aws_lambda_permission" "bggProxy_profiles" {
  # Wildcard covers GET/POST/OPTIONS on /profiles
  statement_id  = "apigateway-profiles"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bggProxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/*/profiles"
}

# ── createEvent (1 statement, wildcard POST) ──────────────────────────────
resource "aws_lambda_permission" "createEvent_post" {
  statement_id  = "apigw-0epz07-POST"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.createEvent.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/POST/*"
}

# ── feedback (1 statement) ─────────────────────────────────────────────────
resource "aws_lambda_permission" "feedback_invoke" {
  statement_id  = "apigateway-invoke-feedback"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.feedback.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/*/feedback"
}

# ── GeneratePresignedGetUrl (1 statement) ──────────────────────────────────
resource "aws_lambda_permission" "GeneratePresignedGetUrl_get" {
  statement_id  = "3d75ad4e-d5de-52b1-86b9-1c65d2d8f0f7"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.GeneratePresignedGetUrl.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/GET/get-token"
}

# ── GeneratePresignedPost (3 statements) ───────────────────────────────────
resource "aws_lambda_permission" "GeneratePresignedPost_get" {
  statement_id  = "ed1cb48e-0f64-5ea9-b835-f8a93f40ec1d"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.GeneratePresignedPost.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/GET/upload-token"
}

resource "aws_lambda_permission" "GeneratePresignedPost_post" {
  statement_id  = "allow-post-upload-token"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.GeneratePresignedPost.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/POST/upload-token"
}

resource "aws_lambda_permission" "GeneratePresignedPost_options" {
  statement_id  = "allow-options-upload-token"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.GeneratePresignedPost.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/OPTIONS/upload-token"
}

# ── groups (4 statements — one per HTTP method, all wildcard path) ─────────
resource "aws_lambda_permission" "groups_get" {
  statement_id  = "apigw-fojxnt-GET"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.groups.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/GET/*"
}

resource "aws_lambda_permission" "groups_post" {
  statement_id  = "apigw-fojxnt-POST"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.groups.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/POST/*"
}

resource "aws_lambda_permission" "groups_delete" {
  statement_id  = "apigw-fojxnt-DELETE"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.groups.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/DELETE/*"
}

resource "aws_lambda_permission" "groups_options" {
  statement_id  = "apigw-fojxnt-OPTIONS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.groups.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/OPTIONS/*"
}

# ── nudgeNonResponders (2 statements — POST routes only; OPTIONS are MOCK) ─
resource "aws_lambda_permission" "nudge_post" {
  statement_id  = "apigateway-nudge-post"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nudgeNonResponders.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/POST/nudge"
}

resource "aws_lambda_permission" "nudge_invite" {
  statement_id  = "apigateway-invite-prod"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nudgeNonResponders.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/POST/invite"
}

# ── searchGames (1 statement, wildcard GET) ────────────────────────────────
resource "aws_lambda_permission" "searchGames_get" {
  statement_id  = "apigw-tozu7q-GET"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.searchGames.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:us-east-2:${var.aws_account_id}:${aws_api_gateway_rest_api.main.id}/*/GET/*"
}
