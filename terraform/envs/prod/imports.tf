# Import blocks for the Phase 6 retrofit. After each slice reaches zero-diff
# in `tofu plan` AND has been applied (state populated), the corresponding
# import block can be removed. This file should eventually be empty and
# deletable.
#
# Slice progress:
#   [x] S3 bucket + companions
#   [x] Lambdas + their execution roles
#   [x] GitHub deploy role + OIDC trust policy
#   [x] API Gateway: REST API + resources + authorizers + stage
#   [x] API Gateway: methods + integrations + Lambda invoke permissions
#   [x] Cognito (data sources â€” shared with meal-planner + portal)
#   [x] Secrets Manager: game-night/prod/github-token (project-owned, imported)
#                        shared/postmark-api-key (data source â€” shared)

# â”€â”€ S3 bucket: jaetill-game-nights â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  to = aws_s3_bucket.game_nights
  id = "jaetill-game-nights"
}

import {
  to = aws_s3_bucket_server_side_encryption_configuration.game_nights
  id = "jaetill-game-nights"
}

import {
  to = aws_s3_bucket_public_access_block.game_nights
  id = "jaetill-game-nights"
}

import {
  to = aws_s3_bucket_ownership_controls.game_nights
  id = "jaetill-game-nights"
}

import {
  to = aws_s3_bucket_cors_configuration.game_nights
  id = "jaetill-game-nights"
}

# â”€â”€ Lambda functions (9) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  to = aws_lambda_function.apiKeyAuthorizer
  id = "apiKeyAuthorizer"
}

import {
  to = aws_lambda_function.bggProxy
  id = "bggProxy"
}

import {
  to = aws_lambda_function.createEvent
  id = "createEvent"
}

import {
  to = aws_lambda_function.feedback
  id = "feedback"
}

import {
  to = aws_lambda_function.GeneratePresignedGetUrl
  id = "GeneratePresignedGetUrl"
}

import {
  to = aws_lambda_function.GeneratePresignedPost
  id = "GeneratePresignedPost"
}

import {
  to = aws_lambda_function.groups
  id = "groups"
}

import {
  to = aws_lambda_function.nudgeNonResponders
  id = "nudgeNonResponders"
}

import {
  to = aws_lambda_function.searchGames
  id = "searchGames"
}

# â”€â”€ IAM roles (10) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  to = aws_iam_role.apiKeyAuthorizer
  id = "apiKeyAuthorizer-lambda-role"
}

import {
  to = aws_iam_role.bggProxy
  id = "bggProxy-role-4m5m0lfj"
}

import {
  to = aws_iam_role.createEvent
  id = "createEvent-lambda-role"
}

import {
  to = aws_iam_role.feedback
  id = "feedback-lambda-role"
}

import {
  to = aws_iam_role.GeneratePresignedGetUrl
  id = "GeneratePresignedGetUrl-role-vghochhj"
}

import {
  to = aws_iam_role.GeneratePresignedPost
  id = "GeneratePresignedPost-role-1hw3dtet"
}

import {
  to = aws_iam_role.groups
  id = "groups-lambda-role"
}

import {
  to = aws_iam_role.nudge
  id = "nudge-lambda-role"
}

import {
  to = aws_iam_role.searchGames
  id = "searchGames-lambda-role"
}

import {
  to = aws_iam_role.github_deploy
  id = "game-night-github-deploy"
}

# â”€â”€ IAM inline role policies (14) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Import IDs use the format: "<role_name>:<policy_name>"
import {
  to = aws_iam_role_policy.apiKeyAuthorizer_ssm
  id = "apiKeyAuthorizer-lambda-role:ssm-access"
}

import {
  to = aws_iam_role_policy.bggProxy_collection
  id = "bggProxy-role-4m5m0lfj:S3CollectionAccess"
}

import {
  to = aws_iam_role_policy.bggProxy_profile
  id = "bggProxy-role-4m5m0lfj:S3ProfileAccess"
}

import {
  to = aws_iam_role_policy.createEvent_logs
  id = "createEvent-lambda-role:createEvent-lambda-role-logs"
}

import {
  to = aws_iam_role_policy.createEvent_s3
  id = "createEvent-lambda-role:s3-access"
}

import {
  to = aws_iam_role_policy.feedback_inline
  id = "feedback-lambda-role:feedback-inline"
}

import {
  to = aws_iam_role_policy.groups_logs
  id = "groups-lambda-role:groups-lambda-role-logs"
}

import {
  to = aws_iam_role_policy.groups_s3
  id = "groups-lambda-role:s3-access"
}

import {
  to = aws_iam_role_policy.nudge_inline
  id = "nudge-lambda-role:nudge-inline"
}

import {
  to = aws_iam_role_policy.nudge_logs
  id = "nudge-lambda-role:nudge-lambda-role-logs"
}

import {
  to = aws_iam_role_policy.nudge_secrets
  id = "nudge-lambda-role:shared-secrets-access"
}

import {
  to = aws_iam_role_policy.searchGames_logs
  id = "searchGames-lambda-role:searchGames-lambda-role-logs"
}

import {
  to = aws_iam_role_policy.searchGames_s3
  id = "searchGames-lambda-role:s3-access"
}

import {
  to = aws_iam_role_policy.github_deploy
  id = "game-night-github-deploy:deploy"
}

# â”€â”€ Console-generated managed policies (3) + their attachments (3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  to = aws_iam_policy.bggProxy_basic_exec
  id = "arn:aws:iam::214599503944:policy/service-role/AWSLambdaBasicExecutionRole-23457392-080c-49c2-849d-db688eae1193"
}

import {
  to = aws_iam_policy.GeneratePresignedGetUrl_basic_exec
  id = "arn:aws:iam::214599503944:policy/service-role/AWSLambdaBasicExecutionRole-334872a5-7c1a-48f2-bc15-8fb429e8188e"
}

import {
  to = aws_iam_policy.GeneratePresignedPost_basic_exec
  id = "arn:aws:iam::214599503944:policy/service-role/AWSLambdaBasicExecutionRole-499b99fb-9404-4328-a2c2-d0c8ce501ce8"
}

# Attachment imports: "<role_name>/<policy_arn>"
import {
  to = aws_iam_role_policy_attachment.bggProxy_basic_exec
  id = "bggProxy-role-4m5m0lfj/arn:aws:iam::214599503944:policy/service-role/AWSLambdaBasicExecutionRole-23457392-080c-49c2-849d-db688eae1193"
}

import {
  to = aws_iam_role_policy_attachment.GeneratePresignedGetUrl_basic_exec
  id = "GeneratePresignedGetUrl-role-vghochhj/arn:aws:iam::214599503944:policy/service-role/AWSLambdaBasicExecutionRole-334872a5-7c1a-48f2-bc15-8fb429e8188e"
}

import {
  to = aws_iam_role_policy_attachment.GeneratePresignedPost_basic_exec
  id = "GeneratePresignedPost-role-1hw3dtet/arn:aws:iam::214599503944:policy/service-role/AWSLambdaBasicExecutionRole-499b99fb-9404-4328-a2c2-d0c8ce501ce8"
}

# â”€â”€ Secrets Manager: project-owned secret â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  to = aws_secretsmanager_secret.github_token
  id = "arn:aws:secretsmanager:us-east-2:214599503944:secret:game-night/prod/github-token-ee8SdX"
}

# â”€â”€ API Gateway: REST API + resources + authorizers + stage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# The deployment (21r6w8) is intentionally NOT imported â€” it's managed
# manually per-deploy and tracking it in state would force redeploys.

import {
  to = aws_api_gateway_rest_api.main
  id = "pufsqfvq8g"
}

# Resources: import format is "<rest_api_id>/<resource_id>"
import {
  to = aws_api_gateway_resource.bgg
  id = "pufsqfvq8g/2ularh"
}

import {
  to = aws_api_gateway_resource.create_event
  id = "pufsqfvq8g/0epz07"
}

import {
  to = aws_api_gateway_resource.feedback
  id = "pufsqfvq8g/kuf5xf"
}

import {
  to = aws_api_gateway_resource.get_token
  id = "pufsqfvq8g/6cqhkx"
}

import {
  to = aws_api_gateway_resource.groups
  id = "pufsqfvq8g/fojxnt"
}

import {
  to = aws_api_gateway_resource.invite
  id = "pufsqfvq8g/j3vzrr"
}

import {
  to = aws_api_gateway_resource.nudge
  id = "pufsqfvq8g/nej9n6"
}

import {
  to = aws_api_gateway_resource.profiles
  id = "pufsqfvq8g/1pkq64"
}

import {
  to = aws_api_gateway_resource.search_games
  id = "pufsqfvq8g/tozu7q"
}

import {
  to = aws_api_gateway_resource.upload_token
  id = "pufsqfvq8g/hefh06"
}

# Authorizers: import format is "<rest_api_id>/<authorizer_id>"
import {
  to = aws_api_gateway_authorizer.api_key
  id = "pufsqfvq8g/e7otea"
}

import {
  to = aws_api_gateway_authorizer.cognito
  id = "pufsqfvq8g/8ljovy"
}

# Stage: import format is "<rest_api_id>/<stage_name>"
import {
  to = aws_api_gateway_stage.prod
  id = "pufsqfvq8g/prod"
}

# â”€â”€ API Gateway methods (22) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Import format: "<rest_api_id>/<resource_id>/<http_method>"

import {
  to = aws_api_gateway_method.bgg_get
  id = "pufsqfvq8g/2ularh/GET"
}
import {
  to = aws_api_gateway_method.bgg_post
  id = "pufsqfvq8g/2ularh/POST"
}
import {
  to = aws_api_gateway_method.bgg_options
  id = "pufsqfvq8g/2ularh/OPTIONS"
}
import {
  to = aws_api_gateway_method.create_event_post
  id = "pufsqfvq8g/0epz07/POST"
}
import {
  to = aws_api_gateway_method.feedback_post
  id = "pufsqfvq8g/kuf5xf/POST"
}
import {
  to = aws_api_gateway_method.feedback_options
  id = "pufsqfvq8g/kuf5xf/OPTIONS"
}
import {
  to = aws_api_gateway_method.get_token_get
  id = "pufsqfvq8g/6cqhkx/GET"
}
import {
  to = aws_api_gateway_method.get_token_options
  id = "pufsqfvq8g/6cqhkx/OPTIONS"
}
import {
  to = aws_api_gateway_method.groups_get
  id = "pufsqfvq8g/fojxnt/GET"
}
import {
  to = aws_api_gateway_method.groups_post
  id = "pufsqfvq8g/fojxnt/POST"
}
import {
  to = aws_api_gateway_method.groups_delete
  id = "pufsqfvq8g/fojxnt/DELETE"
}
import {
  to = aws_api_gateway_method.groups_options
  id = "pufsqfvq8g/fojxnt/OPTIONS"
}
import {
  to = aws_api_gateway_method.invite_post
  id = "pufsqfvq8g/j3vzrr/POST"
}
import {
  to = aws_api_gateway_method.invite_options
  id = "pufsqfvq8g/j3vzrr/OPTIONS"
}
import {
  to = aws_api_gateway_method.nudge_post
  id = "pufsqfvq8g/nej9n6/POST"
}
import {
  to = aws_api_gateway_method.nudge_options
  id = "pufsqfvq8g/nej9n6/OPTIONS"
}
import {
  to = aws_api_gateway_method.profiles_get
  id = "pufsqfvq8g/1pkq64/GET"
}
import {
  to = aws_api_gateway_method.profiles_post
  id = "pufsqfvq8g/1pkq64/POST"
}
import {
  to = aws_api_gateway_method.profiles_options
  id = "pufsqfvq8g/1pkq64/OPTIONS"
}
import {
  to = aws_api_gateway_method.search_games_get
  id = "pufsqfvq8g/tozu7q/GET"
}
import {
  to = aws_api_gateway_method.upload_token_get
  id = "pufsqfvq8g/hefh06/GET"
}
import {
  to = aws_api_gateway_method.upload_token_post
  id = "pufsqfvq8g/hefh06/POST"
}
import {
  to = aws_api_gateway_method.upload_token_options
  id = "pufsqfvq8g/hefh06/OPTIONS"
}

# â”€â”€ API Gateway integrations (22) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Same format as methods.

import {
  to = aws_api_gateway_integration.bgg_get
  id = "pufsqfvq8g/2ularh/GET"
}
import {
  to = aws_api_gateway_integration.bgg_post
  id = "pufsqfvq8g/2ularh/POST"
}
import {
  to = aws_api_gateway_integration.bgg_options
  id = "pufsqfvq8g/2ularh/OPTIONS"
}
import {
  to = aws_api_gateway_integration.create_event_post
  id = "pufsqfvq8g/0epz07/POST"
}
import {
  to = aws_api_gateway_integration.feedback_post
  id = "pufsqfvq8g/kuf5xf/POST"
}
import {
  to = aws_api_gateway_integration.feedback_options
  id = "pufsqfvq8g/kuf5xf/OPTIONS"
}
import {
  to = aws_api_gateway_integration.get_token_get
  id = "pufsqfvq8g/6cqhkx/GET"
}
import {
  to = aws_api_gateway_integration.get_token_options
  id = "pufsqfvq8g/6cqhkx/OPTIONS"
}
import {
  to = aws_api_gateway_integration.groups_get
  id = "pufsqfvq8g/fojxnt/GET"
}
import {
  to = aws_api_gateway_integration.groups_post
  id = "pufsqfvq8g/fojxnt/POST"
}
import {
  to = aws_api_gateway_integration.groups_delete
  id = "pufsqfvq8g/fojxnt/DELETE"
}
import {
  to = aws_api_gateway_integration.groups_options
  id = "pufsqfvq8g/fojxnt/OPTIONS"
}
import {
  to = aws_api_gateway_integration.invite_post
  id = "pufsqfvq8g/j3vzrr/POST"
}
import {
  to = aws_api_gateway_integration.invite_options
  id = "pufsqfvq8g/j3vzrr/OPTIONS"
}
import {
  to = aws_api_gateway_integration.nudge_post
  id = "pufsqfvq8g/nej9n6/POST"
}
import {
  to = aws_api_gateway_integration.nudge_options
  id = "pufsqfvq8g/nej9n6/OPTIONS"
}
import {
  to = aws_api_gateway_integration.profiles_get
  id = "pufsqfvq8g/1pkq64/GET"
}
import {
  to = aws_api_gateway_integration.profiles_post
  id = "pufsqfvq8g/1pkq64/POST"
}
import {
  to = aws_api_gateway_integration.profiles_options
  id = "pufsqfvq8g/1pkq64/OPTIONS"
}
import {
  to = aws_api_gateway_integration.search_games_get
  id = "pufsqfvq8g/tozu7q/GET"
}
import {
  to = aws_api_gateway_integration.upload_token_get
  id = "pufsqfvq8g/hefh06/GET"
}
import {
  to = aws_api_gateway_integration.upload_token_post
  id = "pufsqfvq8g/hefh06/POST"
}
import {
  to = aws_api_gateway_integration.upload_token_options
  id = "pufsqfvq8g/hefh06/OPTIONS"
}

# â”€â”€ Method responses (4 â€” only for MOCK CORS + the legacy upload_token GET) â”€
# Import format: "<rest_api_id>/<resource_id>/<http_method>/<status_code>"

import {
  to = aws_api_gateway_method_response.get_token_options_200
  id = "pufsqfvq8g/6cqhkx/OPTIONS/200"
}
import {
  to = aws_api_gateway_method_response.invite_options_200
  id = "pufsqfvq8g/j3vzrr/OPTIONS/200"
}
import {
  to = aws_api_gateway_method_response.nudge_options_200
  id = "pufsqfvq8g/nej9n6/OPTIONS/200"
}
import {
  to = aws_api_gateway_method_response.upload_token_get_200
  id = "pufsqfvq8g/hefh06/GET/200"
}

# â”€â”€ Integration responses (4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  to = aws_api_gateway_integration_response.get_token_options_200
  id = "pufsqfvq8g/6cqhkx/OPTIONS/200"
}
import {
  to = aws_api_gateway_integration_response.invite_options_200
  id = "pufsqfvq8g/j3vzrr/OPTIONS/200"
}
import {
  to = aws_api_gateway_integration_response.nudge_options_200
  id = "pufsqfvq8g/nej9n6/OPTIONS/200"
}
import {
  to = aws_api_gateway_integration_response.upload_token_get_200
  id = "pufsqfvq8g/hefh06/GET/200"
}

# â”€â”€ Lambda permissions for API Gateway invoke (19) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Import format: "<function_name>/<statement_id>"

import {
  to = aws_lambda_permission.apigw_authorizer
  id = "apiKeyAuthorizer/apigw-authorizer"
}
import {
  to = aws_lambda_permission.bggProxy_collection_legacy
  id = "bggProxy/aa8e99d1-bc7b-5258-b659-89fcd23187bb"
}
import {
  to = aws_lambda_permission.bggProxy_get
  id = "bggProxy/allow-presigned-api-invoke"
}
import {
  to = aws_lambda_permission.bggProxy_post
  id = "bggProxy/allow-post-bgg"
}
import {
  to = aws_lambda_permission.bggProxy_options
  id = "bggProxy/allow-options-bgg"
}
import {
  to = aws_lambda_permission.bggProxy_profiles
  id = "bggProxy/apigateway-profiles"
}
import {
  to = aws_lambda_permission.createEvent_post
  id = "createEvent/apigw-0epz07-POST"
}
import {
  to = aws_lambda_permission.feedback_invoke
  id = "feedback/apigateway-invoke-feedback"
}
import {
  to = aws_lambda_permission.GeneratePresignedGetUrl_get
  id = "GeneratePresignedGetUrl/3d75ad4e-d5de-52b1-86b9-1c65d2d8f0f7"
}
import {
  to = aws_lambda_permission.GeneratePresignedPost_get
  id = "GeneratePresignedPost/ed1cb48e-0f64-5ea9-b835-f8a93f40ec1d"
}
import {
  to = aws_lambda_permission.GeneratePresignedPost_post
  id = "GeneratePresignedPost/allow-post-upload-token"
}
import {
  to = aws_lambda_permission.GeneratePresignedPost_options
  id = "GeneratePresignedPost/allow-options-upload-token"
}
import {
  to = aws_lambda_permission.groups_get
  id = "groups/apigw-fojxnt-GET"
}
import {
  to = aws_lambda_permission.groups_post
  id = "groups/apigw-fojxnt-POST"
}
import {
  to = aws_lambda_permission.groups_delete
  id = "groups/apigw-fojxnt-DELETE"
}
import {
  to = aws_lambda_permission.groups_options
  id = "groups/apigw-fojxnt-OPTIONS"
}
import {
  to = aws_lambda_permission.nudge_post
  id = "nudgeNonResponders/apigateway-nudge-post"
}
import {
  to = aws_lambda_permission.nudge_invite
  id = "nudgeNonResponders/apigateway-invite-prod"
}
import {
  to = aws_lambda_permission.searchGames_get
  id = "searchGames/apigw-tozu7q-GET"
}
