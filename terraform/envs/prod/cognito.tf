# Cognito is SHARED with meal-planner and jaetill-portal — DO NOT manage from
# this project's Terraform. References are exposed as `data` sources only so
# the API Gateway authorizer can reference the pool/client IDs without owning
# them. The shared pool's lifecycle is managed in (TBD: a future shared
# Terraform project for cross-app account-level resources).

data "aws_cognito_user_pools" "shared" {
  name = "GameNightPlannerPool"
}

# The user pool client owned BY this project (one of three clients on the
# shared pool). Read via the data source's ID lookup; we know the literal
# values from the project's config.
data "aws_cognito_user_pool_client" "game_night_web" {
  user_pool_id = "us-east-2_xneeJzaDJ"
  client_id    = "34et7dk67ngqep1oqef49te0ic"
}
