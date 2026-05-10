# API Gateway REST API: PresignedUploadAPI (id: pufsqfvq8g).
#
# This file scaffolds the REST API + 11 resources + 2 authorizers + 1 stage,
# but the per-method aws_api_gateway_method / _integration / _method_response
# resources are deferred to a follow-up commit. There are ~22 methods and
# each has 4 companion resources (method, integration, method_response,
# integration_response) — landing them in a single commit risks introducing
# many small drifts that are hard to review together.
#
# Lambda invoke permissions (aws_lambda_permission) are scaffolded for the
# core API Gateway → Lambda flow.

# ── REST API ────────────────────────────────────────────────────────────────
resource "aws_api_gateway_rest_api" "main" {
  name        = "PresignedUploadAPI"  # legacy name from when only /upload-token existed
  description = ""

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  api_key_source = "HEADER"
}

# ── Resources (paths) ───────────────────────────────────────────────────────
# The root resource ("/") is auto-created with the REST API; we reference
# its ID via the rest_api's `root_resource_id` attribute. Only non-root
# resources need explicit aws_api_gateway_resource declarations.

resource "aws_api_gateway_resource" "bgg" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "bgg"
}

resource "aws_api_gateway_resource" "create_event" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "create-event"
}

resource "aws_api_gateway_resource" "feedback" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "feedback"
}

resource "aws_api_gateway_resource" "get_token" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "get-token"
}

resource "aws_api_gateway_resource" "groups" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "groups"
}

resource "aws_api_gateway_resource" "invite" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "invite"
}

resource "aws_api_gateway_resource" "nudge" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "nudge"
}

resource "aws_api_gateway_resource" "profiles" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "profiles"
}

resource "aws_api_gateway_resource" "search_games" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "search-games"
}

resource "aws_api_gateway_resource" "upload_token" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "upload-token"
}

# ── Authorizers (2) ─────────────────────────────────────────────────────────
# `apiKeyAuthorizer` is the dual-mode (X-API-Key OR Cognito JWT) used by
# every authenticated route. `CognitoAuth` is a legacy COGNITO_USER_POOLS
# authorizer kept around for historical reasons; not used by current routes
# but present in the API state, so imported.

resource "aws_api_gateway_authorizer" "api_key" {
  rest_api_id                      = aws_api_gateway_rest_api.main.id
  name                             = "ApiKeyAuthorizer"
  type                             = "REQUEST"
  authorizer_uri                   = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.apiKeyAuthorizer.arn}/invocations"
  authorizer_result_ttl_in_seconds = 0
  identity_source                  = "method.request.header.Host"
}

resource "aws_api_gateway_authorizer" "cognito" {
  rest_api_id     = aws_api_gateway_rest_api.main.id
  name            = "CognitoAuth"
  type            = "COGNITO_USER_POOLS"
  provider_arns   = ["arn:aws:cognito-idp:us-east-2:${var.aws_account_id}:userpool/us-east-2_xneeJzaDJ"]
  identity_source = "method.request.header.Authorization"
}

# ── Stage ───────────────────────────────────────────────────────────────────
# Note: the deployment is owned by ad-hoc runs of `aws apigateway create-deployment`
# (most recently 21r6w8 from the Phase 7 activation). We do NOT manage the
# `aws_api_gateway_deployment` resource here because it would re-deploy on
# every Terraform apply. The stage references whatever the latest deployment is.

resource "aws_api_gateway_stage" "prod" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = "prod"
  deployment_id = "21r6w8"  # current deployment ID; updated when API GW is redeployed manually

  lifecycle {
    # If the deployment is updated out-of-band (typical), don't fight it.
    ignore_changes = [deployment_id]
  }
}

# ── Lambda permissions (DEFERRED to follow-up) ─────────────────────────────
# Each route's Lambda has an aws_lambda_permission allowing API Gateway to
# invoke it. The 9 functions across this API have between 1 and 5 statements
# each (most have one per route they serve), and the statement IDs are
# AWS-auto-generated identifiers that need to be enumerated via
# `aws lambda get-policy --function-name X`. Skipping in this slice — the
# follow-up commit will add aws_lambda_permission resources matched 1:1
# against the live policy statements.
