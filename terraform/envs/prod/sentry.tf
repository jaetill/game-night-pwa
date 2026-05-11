# Sentry resources managed by OpenTofu via the jianyuan/sentry community
# provider. Authentication is via the SENTRY_AUTH_TOKEN env var (see
# providers.tf for setup notes).
#
# Resources currently managed:
#   - sentry_issue_alert.prod_error_to_github
#       Fires on new error-category issues in prod; creates a GitHub issue
#       in jaetill/game-night-pwa with labels incident:p0,source:sentry.
#       The claude-incident-responder.yml workflow then triages the issue.
#
# Import procedure (one-time, when first adopting an existing rule):
#   1. Find the rule's numeric ID in Sentry's UI:
#      Settings → Alerts → click the rule → URL contains /rules/<ID>/
#      Or via the API:
#        curl -H "Authorization: Bearer $env:SENTRY_AUTH_TOKEN" `
#          https://sentry.io/api/0/projects/jaetill/game-night-pwa/rules/ `
#          | ConvertFrom-Json | Select-Object id, name
#   2. tofu import sentry_issue_alert.prod_error_to_github `
#        jaetill/game-night-pwa/<ID>
#   3. tofu plan — read diff, back-fill the conditions / actions block
#      below to match. Iterate until plan shows 0 changes.
#
# Until imported, the resource block below is a SKELETON — uncomment +
# fill in after the import succeeds.

# resource "sentry_issue_alert" "prod_error_to_github" {
#   organization = "jaetill"
#   project      = "game-night-pwa"
#   name         = "Prod error → GitHub incident:p0"
#
#   action_match  = "any"   # fire if ANY trigger matches
#   filter_match  = "all"   # all filters must match
#   frequency     = 60      # action throttle (minutes)
#   environment   = "prod"
#
#   conditions = jsonencode([
#     { id = "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition" },
#     { id = "sentry.rules.conditions.regression_event.RegressionEventCondition" },
#     # Add more triggers as configured in the UI (escalation, etc.).
#   ])
#
#   filters = jsonencode([
#     {
#       id    = "sentry.rules.filters.issue_category.IssueCategoryFilter"
#       value = "1"   # 1 = error
#     },
#   ])
#
#   actions = jsonencode([
#     {
#       id           = "sentry.integrations.github.notify_action.GitHubCreateTicketAction"
#       integration  = "<github-integration-id>"  # from API
#       repo         = "game-night-pwa"
#       labels       = "incident:p0, source:sentry"
#     },
#   ])
# }
