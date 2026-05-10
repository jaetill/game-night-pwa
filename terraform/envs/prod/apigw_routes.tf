# API Gateway routes — methods, integrations, and (for MOCK CORS preflights)
# the method/integration response pairs that hold the CORS headers.
#
# Auth pattern:
#   - Most authenticated routes use the dual-mode `apiKeyAuthorizer` (CUSTOM).
#   - `/feedback` is public (no auth).
#   - `/upload-token` GET uses the legacy `CognitoAuth` authorizer (Cognito
#     User Pools type) — kept for historical reasons, predates the dual-mode
#     authorizer. The other /upload-token methods use CUSTOM like everything
#     else.
#
# Integration pattern:
#   - AWS_PROXY for everything that calls a Lambda.
#   - MOCK for the OPTIONS preflights on /get-token, /invite, /nudge — these
#     return CORS headers directly from API Gateway without invoking Lambda,
#     since those routes pre-date the per-Lambda CORS handling we use today.
#   - The other OPTIONS routes (/bgg, /feedback, /groups, /profiles,
#     /upload-token) go through Lambda — that Lambda sets CORS headers itself.

locals {
  # Lambda invoke URI helper — every aws_api_gateway_integration uses the
  # same pattern: apigateway:lambda:path/2015-03-31/functions/<arn>/invocations
  invoke_uri = {
    apiKeyAuthorizer        = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.apiKeyAuthorizer.arn}/invocations"
    bggProxy                = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.bggProxy.arn}/invocations"
    createEvent             = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.createEvent.arn}/invocations"
    feedback                = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.feedback.arn}/invocations"
    GeneratePresignedGetUrl = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.GeneratePresignedGetUrl.arn}/invocations"
    GeneratePresignedPost   = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.GeneratePresignedPost.arn}/invocations"
    groups                  = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.groups.arn}/invocations"
    nudge                   = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.nudgeNonResponders.arn}/invocations"
    searchGames             = "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/${aws_lambda_function.searchGames.arn}/invocations"
  }
}

# ════════════════════════════════════════════════════════════════════════════
# /bgg — bggProxy Lambda (GET, POST, OPTIONS)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "bgg_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.bgg.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "bgg_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.bgg.id
  http_method             = aws_api_gateway_method.bgg_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.bggProxy
}

resource "aws_api_gateway_method" "bgg_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.bgg.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "bgg_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.bgg.id
  http_method             = aws_api_gateway_method.bgg_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.bggProxy
}

resource "aws_api_gateway_method" "bgg_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.bgg.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "bgg_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.bgg.id
  http_method             = aws_api_gateway_method.bgg_options.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.bggProxy
}

# ════════════════════════════════════════════════════════════════════════════
# /create-event — createEvent Lambda (POST only)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "create_event_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.create_event.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "create_event_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.create_event.id
  http_method             = aws_api_gateway_method.create_event_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.createEvent
}

# ════════════════════════════════════════════════════════════════════════════
# /feedback — feedback Lambda (POST + OPTIONS, both NO auth — public endpoint)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "feedback_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.feedback.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "feedback_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.feedback.id
  http_method             = aws_api_gateway_method.feedback_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.feedback
}

resource "aws_api_gateway_method" "feedback_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.feedback.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "feedback_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.feedback.id
  http_method             = aws_api_gateway_method.feedback_options.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.feedback
}

# ════════════════════════════════════════════════════════════════════════════
# /get-token — GeneratePresignedGetUrl Lambda (GET); MOCK CORS OPTIONS
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "get_token_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.get_token.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "get_token_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.get_token.id
  http_method             = aws_api_gateway_method.get_token_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.GeneratePresignedGetUrl
  content_handling        = "CONVERT_TO_TEXT"
}

resource "aws_api_gateway_method" "get_token_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.get_token.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "get_token_options" {
  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.get_token.id
  http_method          = aws_api_gateway_method.get_token_options.http_method
  type                 = "MOCK"
  passthrough_behavior = "WHEN_NO_MATCH"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "get_token_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.get_token.id
  http_method = aws_api_gateway_method.get_token_options.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = false
    "method.response.header.Access-Control-Allow-Methods" = false
    "method.response.header.Access-Control-Allow-Origin"  = false
  }
}

resource "aws_api_gateway_integration_response" "get_token_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.get_token.id
  http_method = aws_api_gateway_method.get_token_options.http_method
  status_code = aws_api_gateway_method_response.get_token_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://gamenights.jaetill.com'"
  }
}

# ════════════════════════════════════════════════════════════════════════════
# /groups — groups Lambda (GET, POST, DELETE, OPTIONS)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "groups_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.groups.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "groups_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.groups.id
  http_method             = aws_api_gateway_method.groups_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.groups
}

resource "aws_api_gateway_method" "groups_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.groups.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "groups_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.groups.id
  http_method             = aws_api_gateway_method.groups_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.groups
}

resource "aws_api_gateway_method" "groups_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.groups.id
  http_method   = "DELETE"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "groups_delete" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.groups.id
  http_method             = aws_api_gateway_method.groups_delete.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.groups
}

resource "aws_api_gateway_method" "groups_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.groups.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "groups_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.groups.id
  http_method             = aws_api_gateway_method.groups_options.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.groups
}

# ════════════════════════════════════════════════════════════════════════════
# /invite — nudgeNonResponders Lambda (POST); MOCK CORS OPTIONS
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "invite_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.invite.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "invite_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.invite.id
  http_method             = aws_api_gateway_method.invite_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.nudge
}

resource "aws_api_gateway_method" "invite_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.invite.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "invite_options" {
  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.invite.id
  http_method          = aws_api_gateway_method.invite_options.http_method
  type                 = "MOCK"
  passthrough_behavior = "WHEN_NO_MATCH"
  request_templates = {
    "application/json" = "{\"statusCode\":200}"
  }
}

resource "aws_api_gateway_method_response" "invite_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.invite.id
  http_method = aws_api_gateway_method.invite_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = false
    "method.response.header.Access-Control-Allow-Methods" = false
    "method.response.header.Access-Control-Allow-Origin"  = false
  }
}

resource "aws_api_gateway_integration_response" "invite_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.invite.id
  http_method = aws_api_gateway_method.invite_options.http_method
  status_code = aws_api_gateway_method_response.invite_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://gamenights.jaetill.com'"
  }
}

# ════════════════════════════════════════════════════════════════════════════
# /nudge — nudgeNonResponders Lambda (POST); MOCK CORS OPTIONS
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "nudge_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.nudge.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "nudge_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.nudge.id
  http_method             = aws_api_gateway_method.nudge_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.nudge
}

resource "aws_api_gateway_method" "nudge_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.nudge.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "nudge_options" {
  rest_api_id          = aws_api_gateway_rest_api.main.id
  resource_id          = aws_api_gateway_resource.nudge.id
  http_method          = aws_api_gateway_method.nudge_options.http_method
  type                 = "MOCK"
  passthrough_behavior = "WHEN_NO_MATCH"
  request_templates = {
    "application/json" = "{\"statusCode\":200}"
  }
}

resource "aws_api_gateway_method_response" "nudge_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.nudge.id
  http_method = aws_api_gateway_method.nudge_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = false
    "method.response.header.Access-Control-Allow-Methods" = false
    "method.response.header.Access-Control-Allow-Origin"  = false
  }
}

resource "aws_api_gateway_integration_response" "nudge_options_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.nudge.id
  http_method = aws_api_gateway_method.nudge_options.http_method
  status_code = aws_api_gateway_method_response.nudge_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'https://gamenights.jaetill.com'"
  }
}

# ════════════════════════════════════════════════════════════════════════════
# /profiles — bggProxy Lambda (GET, POST, OPTIONS)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "profiles_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.profiles.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "profiles_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.profiles.id
  http_method             = aws_api_gateway_method.profiles_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.bggProxy
}

resource "aws_api_gateway_method" "profiles_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.profiles.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "profiles_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.profiles.id
  http_method             = aws_api_gateway_method.profiles_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.bggProxy
}

resource "aws_api_gateway_method" "profiles_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.profiles.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "profiles_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.profiles.id
  http_method             = aws_api_gateway_method.profiles_options.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.bggProxy
}

# ════════════════════════════════════════════════════════════════════════════
# /search-games — searchGames Lambda (GET only, no OPTIONS preflight)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "search_games_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.search_games.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "search_games_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.search_games.id
  http_method             = aws_api_gateway_method.search_games_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.searchGames
}

# ════════════════════════════════════════════════════════════════════════════
# /upload-token — GeneratePresignedPost Lambda (GET, POST, OPTIONS)
#
# The GET method is special: it predates the dual-mode authorizer and uses
# the legacy CognitoAuth (COGNITO_USER_POOLS). The POST and OPTIONS use the
# standard CUSTOM/NONE pattern.
# ════════════════════════════════════════════════════════════════════════════
resource "aws_api_gateway_method" "upload_token_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.upload_token.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "upload_token_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.upload_token.id
  http_method             = aws_api_gateway_method.upload_token_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.GeneratePresignedPost
  content_handling        = "CONVERT_TO_TEXT"
}

resource "aws_api_gateway_method_response" "upload_token_get_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.upload_token.id
  http_method = aws_api_gateway_method.upload_token_get.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "upload_token_get_200" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.upload_token.id
  http_method = aws_api_gateway_method.upload_token_get.http_method
  status_code = aws_api_gateway_method_response.upload_token_get_200.status_code
  response_templates = {
    "application/json" = ""
  }
}

resource "aws_api_gateway_method" "upload_token_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.upload_token.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "upload_token_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.upload_token.id
  http_method             = aws_api_gateway_method.upload_token_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.GeneratePresignedPost
}

resource "aws_api_gateway_method" "upload_token_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.upload_token.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "upload_token_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.upload_token.id
  http_method             = aws_api_gateway_method.upload_token_options.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.invoke_uri.GeneratePresignedPost
}
